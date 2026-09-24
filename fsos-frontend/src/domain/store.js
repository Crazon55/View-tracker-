// The workspace: one state object, loaded from the FSOS API, mutated through it.
//
// This used to be a seeded demo in localStorage. It isn't any more — nothing here
// invents data, and nothing survives only in the browser. `GET /api/workspace` fills
// the whole state in one round trip; every action below writes to the database first
// and only then updates what's on screen, so a refresh always agrees with the server.
//
// Actions are async. Where the server returns the rows it touched we merge those in;
// where a change ripples (assignment, displacement, publication) we reload the
// workspace rather than guess. Callers that need a result — `addIdea`, `placeVersion`,
// `confirmPublication` — must await it.
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { api, usingDevLogin } from "@/lib/api";
import { isSignedIn } from "@/lib/session";
import { resolveAccess } from "./access";

const WorkspaceContext = createContext(null);
const PREVIEW_KEY = "fsos_role_preview";

// { kind: "role", role } | { kind: "person", id } | null
function loadPreview() {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.kind ? parsed : null;
  } catch (e) { return null; }
}

/** Replace a row in a list by id, or append it if it's new. */
function upsert(list, row, key = "id") {
  const i = (list || []).findIndex((x) => x[key] === row[key]);
  if (i === -1) return [...(list || []), row];
  const next = [...list];
  next[i] = row;
  return next;
}

function upsertMany(list, rows, key = "id") {
  return (rows || []).reduce((acc, r) => upsert(acc, r, key), list || []);
}

export function WorkspaceProvider({ children }) {
  const [db, setDb] = useState(null);
  // loading | ready | pending (signed in, no role yet) | signed_out | error
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Who we are when the workspace won't load — /api/me answers even with no roles.
  const [identity, setIdentity] = useState(null);
  const [preview, setPreviewState] = useState(loadPreview);
  const inflight = useRef(null);

  const setPreview = useCallback((next) => {
    setPreviewState(next || null);
    try {
      if (next) sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(PREVIEW_KEY);
    } catch (e) { /* private browsing — preview just won't persist */ }
  }, []);

  /** Pull the whole workspace. This is exactly what a browser refresh does. */
  const reload = useCallback(async () => {
    // Several actions can finish at once; one reload is enough for all of them.
    if (!isSignedIn() && !usingDevLogin) {
      setStatus("signed_out");
      return null;
    }
    if (inflight.current) return inflight.current;
    const p = (async () => {
      try {
        const next = await api.get("/api/workspace");
        setDb(next);
        setStatus("ready");
        setError(null);
        return next;
      } catch (e) {
        // 403 with no roles isn't a failure — it's someone waiting to be let in.
        // Find out who they are so the pending screen can name them to an admin.
        if (e.status === 403) {
          setStatus("pending");
          api.get("/api/me").then((me) => setIdentity(me.person)).catch(() => {});
        }
        else if (e.status === 401) setStatus("signed_out");
        else setStatus("error");
        setError(e);
        return null;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /**
   * Pick up what other people have done.
   *
   * There is one database and one API; roles decide what you may do, not which copy of
   * the data you get. But each browser holds a snapshot taken when it last asked, so
   * somebody else deleting an idea doesn't reach your screen on its own.
   *
   * Refreshing when the tab regains focus covers almost all of it — you look away, you
   * look back, it's current — and a slow interval catches the case of leaving a screen
   * open and watching it. Only while the tab is visible: there's no sense polling for a
   * window nobody is looking at.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !document.hidden) reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [reload]);

  /**
   * Refresh in the background, without making anyone wait for it.
   *
   * Most mutations already hand back the row they changed, and that's what the screen
   * shows. The reload is for the ripples — the activity entry, the notification, the
   * batch's idea list — which nobody is staring at. Awaiting it turned every click into
   * a second of nothing happening, which is how you end up pressing the button twice.
   */
  const reloadSoon = useCallback(() => { reload(); }, [reload]);

  /** Local-only patch, for merging a server response back into state. */
  const patch = useCallback((fn) => setDb((prev) => (prev ? fn({ ...prev }) : prev)), []);

  /**
   * Run a mutation, keep a "saving" flag for the UI, and make sure a failure is seen.
   *
   * Most call sites fire and forget — a switch in Settings, a number in the 6-Day grid.
   * Without this the API's refusal would vanish into an unhandled rejection and the
   * screen would keep showing a value the database never accepted. The error is still
   * rethrown, so the call sites that do care can react as well.
   */
  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(e.message || "That didn't save.");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  // An idea mutation returns { idea, versions } — merge both.
  const mergeIdea = useCallback((res) => {
    if (!res?.idea) return res;
    patch((d) => {
      d.ideas = upsert(d.ideas, res.idea);
      d.versions = upsertMany(d.versions, res.versions);
      return d;
    });
    return res;
  }, [patch]);

  const actingUser = useMemo(
    () => (db ? db.users.find((u) => u.id === db.actingUserId) || null : null),
    [db],
  );

  const ownAccess = useMemo(() => (db && actingUser ? resolveAccess(db, actingUser, null) : {}), [db, actingUser]);
  const canPreview = ownAccess.users_roles === "edit";
  const activePreview = canPreview ? preview : null;
  const access = useMemo(
    () => (activePreview && db ? resolveAccess(db, actingUser, activePreview) : ownAccess),
    [activePreview, db, actingUser, ownAccess],
  );

  /** Whose nav, streams and route gating to use while previewing. */
  const gateUser = useMemo(() => {
    if (!activePreview || !actingUser) return actingUser;
    if (activePreview.kind === "person") {
      return (db?.users || []).find((u) => u.id === activePreview.id) || actingUser;
    }
    return { ...actingUser, roles: [activePreview.role] };
  }, [activePreview, actingUser, db]);

  /** What to call the thing being previewed, for the banner. */
  const previewLabel = useMemo(() => {
    if (!activePreview) return null;
    if (activePreview.kind === "role") return activePreview.role;
    const p = (db?.users || []).find((u) => u.id === activePreview.id);
    return p ? p.name : "someone";
  }, [activePreview, db]);

  const actions = useMemo(() => ({
    reload,

    // ── ideas ────────────────────────────────────────────────────────────────
    async addIdea(payload) {
      const res = await run(() => api.post("/api/ideas", {
        stream: payload.stream,
        title: payload.title,
        format: payload.format,
        category: payload.category ?? null,
        sources: payload.sources || [],
        brief: payload.brief || {},
        destinations: payload.destinations || [],
        versionHooks: payload.versionHooks || {},
        batchId: payload.batchId || null,
      }));
      mergeIdea(res);
      reloadSoon();     // activity, notifications and the batch's idea list catch up
      return res.idea.id;
    },

    /** Delete an idea and everything under it. */
    async deleteIdea(ideaId) {
      await run(() => api.del(`/api/ideas/${ideaId}`));
      patch((d) => {
        const versionIds = new Set(d.versions.filter((v) => v.ideaId === ideaId).map((v) => v.id));
        d.ideas = d.ideas.filter((i) => i.id !== ideaId);
        d.versions = d.versions.filter((v) => v.ideaId !== ideaId);
        d.placements = d.placements.filter((pl) => !versionIds.has(pl.versionId));
        d.comments = d.comments.filter((c) => c.ideaId !== ideaId);
        d.activity = d.activity.filter((a) => a.ideaId !== ideaId);
        d.publications = d.publications.filter((pub) => (pub.versionIds || []).some((v) => !versionIds.has(v)));
        return d;
      });
      reloadSoon();
    },

    async updateIdea(ideaId, p) {
      return mergeIdea(await run(() => api.patch(`/api/ideas/${ideaId}`, p)));
    },

    async setDestinations(ideaId, ipIds) {
      return mergeIdea(await run(() => api.put(`/api/ideas/${ideaId}/destinations`, { ipIds })));
    },

    async approveIdea(ideaId) {
      mergeIdea(await run(() => api.post(`/api/ideas/${ideaId}/approve`)));
      reloadSoon();
    },

    async approveBatch(batchId) {
      await run(() => api.post(`/api/batches/${batchId}/approve`));
      reloadSoon();
    },

    async updateBatch(id, p) {
      const batch = await run(() => api.patch(`/api/batches/${id}`, p));
      patch((d) => { d.batches = upsert(d.batches, batch); return d; });
      return batch;
    },

    async addBatch(batch) {
      const made = await run(() => api.post("/api/batches", batch));
      patch((d) => { d.batches = upsert(d.batches, made); return d; });
      return made;
    },

    /** The ideas in it survive — batch_id goes null, they just stop being grouped. */
    async deleteBatch(id) {
      await run(() => api.del(`/api/batches/${id}`));
      patch((d) => {
        d.batches = d.batches.filter((b) => b.id !== id);
        d.ideas = d.ideas.map((i) => (i.batchId === id ? { ...i, batchId: null } : i));
        return d;
      });
    },

    // ── versions ─────────────────────────────────────────────────────────────
    async updateVersion(versionId, p) {
      const v = await run(() => api.patch(`/api/versions/${versionId}`, p));
      patch((d) => { d.versions = upsert(d.versions, v); return d; });
      return v;
    },

    async addVersionLink(versionId, link) {
      const v = await run(() => api.post(`/api/versions/${versionId}/links`, link));
      patch((d) => { d.versions = upsert(d.versions, v); return d; });
      return v;
    },

    async updateVersionLink(versionId, linkId, p) {
      const v = await run(() => api.patch(`/api/versions/${versionId}/links/${linkId}`, p));
      patch((d) => { d.versions = upsert(d.versions, v); return d; });
      return v;
    },

    async removeVersionLink(versionId, linkId) {
      const v = await run(() => api.del(`/api/versions/${versionId}/links/${linkId}`));
      patch((d) => { d.versions = upsert(d.versions, v); return d; });
      return v;
    },

    // ── production ───────────────────────────────────────────────────────────
    async assignProduction(ideaIds, ownerId, deadline, reviewerId) {
      await run(() => api.post("/api/production/assign", { ideaIds, ownerId, deadline, reviewerId }));
      reloadSoon();
    },

    async submitForReview(versionId, extraLink) {
      mergeIdea(await run(() => api.post(`/api/production/versions/${versionId}/submit`,
        { extraLink: extraLink || null })));
      reloadSoon();
    },

    async submitIdeaForReview(ideaId, extraLinks) {
      mergeIdea(await run(() => api.post(`/api/production/ideas/${ideaId}/submit`,
        { extraLinks: extraLinks || [] })));
      reloadSoon();
    },

    async requestReview(ideaId, reviewerId) {
      mergeIdea(await run(() => api.post(`/api/production/ideas/${ideaId}/request-review`, { reviewerId })));
      reloadSoon();
    },

    async approveVersion(versionId) {
      mergeIdea(await run(() => api.post(`/api/production/versions/${versionId}/approve`)));
      reloadSoon();
    },

    async requestChanges(versionId, note) {
      mergeIdea(await run(() => api.post(`/api/production/versions/${versionId}/request-changes`, { note })));
      reloadSoon();
    },

    async replaceAsset(versionId, link) {
      mergeIdea(await run(() => api.post(`/api/production/versions/${versionId}/replace-asset`,
        { link: link || null })));
      reloadSoon();
    },

    /** HPN's one-screen record: owner, asset and outcome together. */
    async hpnQuickRecord(ideaId, { ownerId, links, reviewerId, outcome }) {
      if (ownerId) await api.post("/api/production/assign", { ideaIds: [ideaId], ownerId, reviewerId });
      const versions = (db?.versions || []).filter((v) => v.ideaId === ideaId);
      for (const v of versions) {
        if (links?.url) await api.post(`/api/versions/${v.id}/links`, {
          type: links.type || "drive", url: links.url, label: links.label || links.url });
        if (outcome === "approved") await api.post(`/api/production/versions/${v.id}/approve`);
        else await api.post(`/api/production/versions/${v.id}/request-changes`, { note: "Changes requested" });
      }
      reloadSoon();
    },

    // ── comments ─────────────────────────────────────────────────────────────
    async addComment(ideaId, { versionId = null, anchor = { type: "general" }, text }) {
      const c = await run(() => api.post("/api/comments", { ideaId, versionId, anchor, text }));
      patch((d) => { d.comments = upsert(d.comments, c); return d; });
      return c;
    },

    async replyComment(commentId, text) {
      const c = await run(() => api.post(`/api/comments/${commentId}/replies`, { text }));
      patch((d) => { d.comments = upsert(d.comments, c); return d; });
      return c;
    },

    async resolveComment(commentId, resolved = true) {
      const c = await run(() => api.post(`/api/comments/${commentId}/resolve`, { resolved }));
      patch((d) => { d.comments = upsert(d.comments, c); return d; });
      return c;
    },

    // ── distribution ─────────────────────────────────────────────────────────
    /** Returns "same_day_repetition" when the repetition rule blocked it, else null. */
    async placeVersion(versionId, date, time = null, opts = {}) {
      const res = await run(() => api.post("/api/distribution/place", {
        versionId, date, time, order: opts.order || 1,
        force: !!opts.force, exception: !!opts.exception, reason: opts.reason || null,
      }));
      if (res.placement) {
        patch((d) => { d.placements = upsert(d.placements, res.placement); return d; });
        reloadSoon();
      }
      return res.conflict;
    },

    async bulkPlace(proposals) {
      await run(() => api.post("/api/distribution/bulk-place", {
        proposals: proposals.map((p) => ({ versionId: p.versionId, date: p.date, time: p.time || null })),
      }));
      reloadSoon();
    },

    async movePlacement(placementId, date) {
      await run(() => api.patch(`/api/distribution/placements/${placementId}`, { date }));
      reloadSoon();
    },

    async cancelPlacement(placementId, reason) {
      await run(() => api.post(`/api/distribution/placements/${placementId}/cancel`, { reason }));
      reloadSoon();
    },

    async unallocateVersion(versionId, reason) {
      await run(() => api.post(`/api/distribution/versions/${versionId}/unallocate`, { reason }));
      reloadSoon();
    },

    async authorizeException(placementId, reason) {
      await run(() => api.post(`/api/distribution/placements/${placementId}/authorize-exception`, { reason }));
      reloadSoon();
    },

    async replaceBOWithHPN(payload) {
      await run(() => api.post("/api/distribution/displace", payload));
      reloadSoon();
    },

    /** Returns { dupUrl } — the URL is already on another publication. */
    async confirmPublication(versionId, url, publishedAtIso) {
      const res = await run(() => api.post("/api/distribution/publish", {
        versionId, url, publishedAt: publishedAtIso }));
      // A publication creates a placement change, a publication row and a snapshot, so
      // this one really does need the round trip before the screen is right.
      await reload();
      return { dupUrl: !!res.dupUrl };
    },

    async linkCollaboration(publicationId, versionId) {
      await run(() => api.post(`/api/distribution/publications/${publicationId}/collab`, { versionId }));
      reloadSoon();
    },

    async reportLivePending(versionId) {
      await run(() => api.post(`/api/distribution/versions/${versionId}/report-pending`));
      reloadSoon();
    },

    // ── performance ──────────────────────────────────────────────────────────
    async recordSnapshot(publicationId, views, measuredAtIso) {
      const clean = views === "" || views === null || views === undefined || Number.isNaN(Number(views))
        ? null : Number(views);
      const snap = await run(() => api.post(`/api/performance/publications/${publicationId}/capture`,
        { views: clean, measuredAt: measuredAtIso }));
      patch((d) => { d.snapshots = upsert(d.snapshots, snap); return d; });
      return snap;
    },

    // ── settings ─────────────────────────────────────────────────────────────
    async addIP(ip) {
      const made = await run(() => api.post("/api/ips", ip));
      patch((d) => { d.ips = upsert(d.ips, made); return d; });
      return made;
    },

    async updateIP(id, p) {
      const ip = await run(() => api.patch(`/api/ips/${id}`, p));
      patch((d) => { d.ips = upsert(d.ips, ip); return d; });
      return ip;
    },

    async addCategory({ name, stream, format = "Carousel" }) {
      const made = await run(() => api.post("/api/categories", { name, stream, format }));
      patch((d) => { d.categories = upsert(d.categories, made); return d; });
      return made;
    },

    async deleteCategory(id) {
      await run(() => api.del(`/api/categories/${id}`));
      patch((d) => { d.categories = d.categories.filter((c) => c.id !== id); return d; });
    },

    async updateSettings(p) {
      const res = await run(() => api.patch("/api/settings", { settings: p }));
      patch((d) => { d.settings = res.settings; return d; });
      return res.settings;
    },

    // ── users & roles ────────────────────────────────────────────────────────
    // These all used to reload the whole workspace, which is a second or two of
    // staring at an unchanged screen for what is usually a one-field change. The API
    // hands back the person it touched, so merge that instead.
    async addUser(u) {
      const person = await run(() => api.post("/api/people", u));
      patch((d) => { d.users = upsert(d.users, person); return d; });
      return person;
    },

    async updateUser(id, p) {
      const person = await run(() => api.patch(`/api/people/${id}`, p));
      patch((d) => { d.users = upsert(d.users, person); return d; });
      return person;
    },

    async setRoleAccess(role, matrix) {
      await run(() => api.put("/api/roles/access", { role, matrix }));
      patch((d) => {
        d.access = { ...d.access, roles: { ...d.access.roles, [role]: { ...matrix } } };
        return d;
      });
    },

    async resetRoleAccess(role) {
      await run(() => api.post("/api/roles/access/reset", { role }));
      patch((d) => {
        const roles = { ...d.access.roles };
        delete roles[role];
        d.access = { ...d.access, roles };
        return d;
      });
    },

    async setPersonAccess(userId, { roles, matrix }) {
      const person = await run(() => api.patch(`/api/people/${userId}`, { roles, matrix }));
      patch((d) => {
        d.users = upsert(d.users, person);
        const people = { ...d.access.people };
        // `accessOverride` is null once the person is back on their roles' defaults.
        if (person.accessOverride) people[userId] = person.accessOverride;
        else delete people[userId];
        d.access = { ...d.access, people };
        return d;
      });
      return person;
    },

    async removePersonAccess(userId) {
      await run(() => api.del(`/api/people/${userId}/access`));
      patch((d) => {
        d.users = d.users.map((u) => (u.id === userId ? { ...u, roles: [] } : u));
        const people = { ...d.access.people };
        delete people[userId];
        d.access = { ...d.access, people };
        return d;
      });
    },

    /** Delete someone outright. The API refuses if they have any history. */
    async deletePerson(userId) {
      await run(() => api.del(`/api/people/${userId}`));
      patch((d) => {
        d.users = d.users.filter((u) => u.id !== userId);
        const people = { ...d.access.people };
        delete people[userId];
        d.access = { ...d.access, people };
        return d;
      });
    },

    // ── 6-Day tracker ────────────────────────────────────────────────────────
    async upsertSixDayEntry({ month, cycle, ipId, ...fields }) {
      const entry = await run(() => api.put("/api/six-day/entries", { month, cycle, ipId, ...fields }));
      patch((d) => {
        d.sixDay = { ...d.sixDay, entries: upsert(d.sixDay.entries, entry) };
        return d;
      });
      return entry;
    },

    async addSixDayTopContent(item) {
      const made = await run(() => api.post("/api/six-day/top-content", item));
      patch((d) => { d.sixDay = { ...d.sixDay, topContent: upsert(d.sixDay.topContent, made) }; return d; });
      return made;
    },

    async updateSixDayTopContent(id, p) {
      const row = await run(() => api.patch(`/api/six-day/top-content/${id}`, p));
      patch((d) => { d.sixDay = { ...d.sixDay, topContent: upsert(d.sixDay.topContent, row) }; return d; });
      return row;
    },

    async deleteSixDayTopContent(id) {
      await run(() => api.del(`/api/six-day/top-content/${id}`));
      patch((d) => {
        d.sixDay = { ...d.sixDay, topContent: d.sixDay.topContent.filter((x) => x.id !== id) };
        return d;
      });
    },

    async upsertSixDayActual(month, ipId, actualViews) {
      const row = await run(() => api.put("/api/six-day/actuals", { month, ipId, actualViews }));
      patch((d) => {
        const rest = d.sixDay.actuals.filter((a) => !(a.month === month && a.ipId === ipId));
        d.sixDay = { ...d.sixDay, actuals: [...rest, row] };
        return d;
      });
      return row;
    },

    async setSixDayAssignee(userId) {
      await run(() => api.put("/api/six-day/assignee", { userId }));
      patch((d) => { d.sixDay = { ...d.sixDay, config: { ...d.sixDay.config, assigneeId: userId } }; return d; });
    },

    // ── growth ───────────────────────────────────────────────────────────────
    async setFollowersGained(month, ipId, followersGained) {
      const row = await run(() => api.put("/api/growth/followers", { month, ipId, followersGained }));
      patch((d) => {
        const rest = d.growth.followers.filter((f) => !(f.month === month && f.ipId === ipId));
        d.growth = { ...d.growth, followers: [...rest, row] };
        return d;
      });
      return row;
    },

    // ── news feed ────────────────────────────────────────────────────────────
    async voteNews(itemId, vote, learnedCategory, item) {
      patch((d) => {
        d.newsState = { ...d.newsState, feedback: { ...d.newsState.feedback, [itemId]: vote } };
        if (learnedCategory && !d.newsState.rules.includes(learnedCategory)) {
          d.newsState.rules = [...d.newsState.rules, learnedCategory];
        }
        return d;
      });
      return api.post("/api/news/vote", {
        id: itemId, vote, learnedCategory: learnedCategory || null,
        title: item?.title || null, type: item?.type || null,
      });
    },

    async toggleNewsSaved(itemId, item) {
      const saved = !(db?.newsState?.saved || []).includes(itemId);
      patch((d) => {
        const list = d.newsState.saved || [];
        const items = { ...(d.newsState.savedItems || {}) };
        if (saved) items[itemId] = item; else delete items[itemId];
        d.newsState = {
          ...d.newsState,
          saved: saved ? [itemId, ...list] : list.filter((x) => x !== itemId),
          savedItems: items,
        };
        return d;
      });
      return api.post("/api/news/saved", { id: itemId, saved, item: item || {} });
    },

    async resetNewsLearning() {
      await run(() => api.post("/api/news/reset-learning"));
      reloadSoon();
    },

    // ── notifications ────────────────────────────────────────────────────────
    async markNotificationsRead() {
      patch((d) => { d.notifications = d.notifications.map((n) => ({ ...n, read: true })); return d; });
      return api.post("/api/notifications/read");
    },

    async markNotificationRead(id) {
      patch((d) => {
        d.notifications = d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        return d;
      });
      return api.post(`/api/notifications/${id}/read`);
    },
  }), [db, patch, reload, reloadSoon, run, mergeIdea]);

  const value = useMemo(() => ({
    db, actions, actingUser, gateUser, today: db?.meta?.anchor, access,
    preview: activePreview, setPreview, previewLabel, canPreview,
    status, error, busy, reload, identity,
  }), [db, actions, actingUser, gateUser, access, activePreview, setPreview, previewLabel,
       canPreview, status, error, busy, reload, identity]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Area access for the acting user (or the previewed role). */
export function useAccess() {
  const { access, preview, setPreview, previewLabel, canPreview } = useWorkspace();
  return {
    access,
    level: (area) => access[area] || "none",
    canView: (area) => (access[area] || "none") !== "none",
    canEdit: (area) => access[area] === "edit",
    preview,
    setPreview,
    previewLabel,
    canPreview,
  };
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
