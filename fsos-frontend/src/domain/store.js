import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { buildSeed } from "./seed";
import { nowIso, addDays } from "./dates";
import { ensureToolSlices, scrapeReserveItems } from "./seedTools";
import { resolveAccess, LOCKED_ROLE } from "./access";

const KEY = "fsos_db_v1";
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

function patchUsers(d) {
  (d?.users || []).forEach((u) => {
    if (u.roles?.includes("CS")) u.streams = ["BO", "HPN"];
  });
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.meta && parsed.meta.version === 2) return patchUsers(ensureToolSlices(parsed));
    }
  } catch (e) { /* ignore */ }
  const seed = buildSeed();
  localStorage.setItem(KEY, JSON.stringify(seed));
  return seed;
}

const DemoContext = createContext(null);
const PREVIEW_KEY = "fsos_role_preview";

function loadPreview() {
  try { return sessionStorage.getItem(PREVIEW_KEY) || null; } catch (e) { return null; }
}

export function DemoProvider({ children }) {
  const [db, setDb] = useState(load);
  const [previewRole, setPreviewRoleState] = useState(loadPreview);
  const setPreviewRole = useCallback((role) => {
    setPreviewRoleState(role || null);
    try { if (role) sessionStorage.setItem(PREVIEW_KEY, role); else sessionStorage.removeItem(PREVIEW_KEY); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    setDb((prev) => patchUsers(structuredClone(prev)));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }, [db]);

  // generic patch helper
  const update = useCallback((fn) => setDb((prev) => fn(structuredClone(prev))), []);

  const actingUser = db.users.find((u) => u.id === db.actingUserId) || db.users[0];
  const today = db.meta.anchor;
  // Only people who can edit Users & Roles may preview other roles.
  const ownAccess = resolveAccess(db, actingUser, null);
  const canPreview = ownAccess.users_roles === "edit";
  const activePreview = canPreview ? previewRole : null;
  const access = activePreview ? resolveAccess(db, actingUser, activePreview) : ownAccess;
  // Stand-in used for nav / route gating while previewing a role.
  const gateUser = activePreview ? { ...actingUser, roles: [activePreview] } : actingUser;

  const logActivity = (d, ideaId, type, text) =>
    d.activity.push({ id: uid("act"), ideaId, type, text, actorId: d.actingUserId, at: nowIso() });

  const attachVersionLink = (d, versionId, link) => {
    const v = d.versions.find((x) => x.id === versionId);
    if (!v || !link?.url) return;
    if (v.assetLinks.some((l) => l.url === link.url)) return;
    v.assetLinks.push({ id: uid("lnk"), ...link });
    if (v.reviewStatus === "not_started") v.reviewStatus = "in_production";
    logActivity(d, v.ideaId, "link_added", `${link.type} link added`);
  };

  const actions = {
    resetDemo() {
      localStorage.removeItem(KEY);
      const seed = buildSeed();
      localStorage.setItem(KEY, JSON.stringify(seed));
      setDb(seed);
    },
    setActingUser(id) { setPreviewRole(null); update((d) => { d.actingUserId = id; return d; }); },

    addIdea(payload) {
      const newId = `idea-live-${uid("i")}`;
      update((d) => {
        const n = d.ideas.length + d.publications.length + 1;
        const id = newId;
        const idea = {
          id, code: `${payload.stream}-N${n}`, stream: payload.stream, title: payload.title,
          topic: (payload.title || "").split(" ").slice(0, 4).join(" ").toLowerCase(),
          format: payload.format, category: payload.category, creatorId: d.actingUserId,
          createdAt: nowIso(), sources: payload.sources || [], brief: payload.brief || {},
          destinations: payload.destinations || [],
          approval: payload.stream === "HPN"
            ? { state: "not_required", by: null, at: null }
            : { state: "pending", by: null, at: null },
          productionOwnerId: null, reviewerId: null, batchId: payload.batchId || null,
          deadline: null, bypassUsed: null, dropped: [],
        };
        d.ideas.push(idea);
        (payload.destinations || []).forEach((ipId) => {
          const hooks = (payload.versionHooks && payload.versionHooks[ipId]) || {};
          d.versions.push({ id: uid("ver"), ideaId: id, ipId, hookOverride: hooks.hookOverride || "", subHook: hooks.subHook || "", bodyText: "", caption: payload.brief?.defaultCaption || "", notesOverride: "", assetLinks: [], reviewStatus: "not_started", revisions: [] });
        });
        logActivity(d, id, "created", `Idea created by ${actingUser.name}`);
        return d;
      });
      return newId;
    },

    updateIdea(ideaId, patch) {
      update((d) => {
        const idea = d.ideas.find((i) => i.id === ideaId);
        if (idea) Object.assign(idea, patch);
        return d;
      });
    },

    setDestinations(ideaId, ipIds) {
      update((d) => {
        const idea = d.ideas.find((i) => i.id === ideaId);
        if (!idea) return d;
        const existing = d.versions.filter((v) => v.ideaId === ideaId);
        // add new
        ipIds.forEach((ipId) => {
          if (!existing.some((v) => v.ipId === ipId)) {
            d.versions.push({ id: uid("ver"), ideaId, ipId, hookOverride: "", subHook: "", bodyText: "", caption: "", notesOverride: "", assetLinks: [], reviewStatus: "not_started", revisions: [] });
            logActivity(d, ideaId, "destination_added", `Destination added: ${d.ips.find((i) => i.id === ipId)?.code}`);
          }
        });
        idea.destinations = ipIds;
        return d;
      });
    },

    approveIdea(ideaId) {
      update((d) => {
        const idea = d.ideas.find((i) => i.id === ideaId);
        if (idea && idea.stream === "BO") { idea.approval = { state: "approved", by: d.actingUserId, at: nowIso() }; logActivity(d, ideaId, "approved", `Idea approved by ${actingUser.name}`); }
        return d;
      });
    },

    approveBatch(batchId, ideaIds) {
      update((d) => {
        const batch = d.batches.find((b) => b.id === batchId);
        (ideaIds || batch?.ideaIds || []).forEach((id) => {
          const idea = d.ideas.find((i) => i.id === id);
          if (idea && idea.stream === "BO" && idea.approval.state !== "approved") { idea.approval = { state: "approved", by: d.actingUserId, at: nowIso() }; logActivity(d, id, "approved", `Approved in batch by ${actingUser.name}`); }
        });
        return d;
      });
    },

    assignProduction(ideaIds, ownerId, deadline, reviewerId) {
      update((d) => {
        ideaIds.forEach((id) => {
          const idea = d.ideas.find((i) => i.id === id);
          if (!idea) return;
          if (idea.productionOwnerId && idea.productionOwnerId !== ownerId) {
            idea.previousOwners = idea.previousOwners || [];
            idea.previousOwners.push({ ownerId: idea.productionOwnerId, until: nowIso() });
          }
          idea.productionOwnerId = ownerId;
          if (deadline) idea.deadline = deadline;
          if (reviewerId) idea.reviewerId = reviewerId;
          d.versions.filter((v) => v.ideaId === id && v.reviewStatus === "not_started").forEach((v) => (v.reviewStatus = "in_production"));
          logActivity(d, id, "assigned", `Assigned to ${d.users.find((u) => u.id === ownerId)?.name}${deadline ? ", due " + deadline : ""}`);
        });
        return d;
      });
    },

    updateVersion(versionId, patch) {
      update((d) => { const v = d.versions.find((x) => x.id === versionId); if (v) Object.assign(v, patch); return d; });
    },

    addVersionLink(versionId, link) {
      update((d) => { attachVersionLink(d, versionId, link); return d; });
    },

    updateVersionLink(versionId, linkId, patch) {
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        const l = v?.assetLinks.find((x) => x.id === linkId);
        if (!l) return d;
        if (patch.url) {
          l.url = patch.url;
          l.label = patch.label || patch.url;
        }
        if (patch.type) l.type = patch.type;
        logActivity(d, v.ideaId, "link_updated", `${l.type} link updated`);
        return d;
      });
    },

    removeVersionLink(versionId, linkId) {
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (v) {
          v.assetLinks = v.assetLinks.filter((l) => l.id !== linkId);
          logActivity(d, v.ideaId, "link_removed", "Deliverable link removed");
        }
        return d;
      });
    },

    submitForReview(versionId, extraLink) {
      update((d) => {
        if (extraLink) attachVersionLink(d, versionId, extraLink);
        const v = d.versions.find((x) => x.id === versionId);
        if (v && v.assetLinks.length) {
          v.reviewStatus = "awaiting_review";
          logActivity(d, v.ideaId, "submitted", `Version submitted for review`);
        }
        return d;
      });
    },

    submitIdeaForReview(ideaId, extraLinks) {
      update((d) => {
        (extraLinks || []).forEach((l) => attachVersionLink(d, l.versionId, l));
        const ready = d.versions.filter((v) => v.ideaId === ideaId && ["not_started", "in_production", "changes_requested"].includes(v.reviewStatus) && v.assetLinks.length);
        ready.forEach((v) => (v.reviewStatus = "awaiting_review"));
        if (ready.length) logActivity(d, ideaId, "submitted", `${ready.length} version${ready.length === 1 ? "" : "s"} submitted for review`);
        return d;
      });
    },

    requestReview(ideaId, reviewerId) {
      update((d) => {
        const idea = d.ideas.find((i) => i.id === ideaId);
        if (idea && reviewerId) idea.reviewerId = reviewerId;
        d.notifications.unshift({ id: uid("nt"), type: "review_request", text: `Review requested: ${idea?.title}`, ideaId, at: nowIso(), read: false });
        logActivity(d, ideaId, "review_requested", `Review requested from ${d.users.find((u) => u.id === reviewerId)?.name}`);
        return d;
      });
    },

    approveVersion(versionId) {
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (v) { v.reviewStatus = "ready"; logActivity(d, v.ideaId, "version_approved", `Version approved (Ready)`); }
        return d;
      });
    },

    requestChanges(versionId, note) {
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (v) {
          v.reviewStatus = "changes_requested";
          d.comments.push({ id: uid("cm"), ideaId: v.ideaId, versionId, anchor: { type: "asset" }, text: note || "Changes requested.", authorId: d.actingUserId, at: nowIso(), resolved: false, replies: [] });
          logActivity(d, v.ideaId, "changes_requested", `Changes requested`);
        }
        return d;
      });
    },

    replaceAsset(versionId, link) {
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (!v) return d;
        v.revisions.push({ id: uid("rev"), at: nowIso(), by: d.actingUserId, note: "Asset replaced — returned to review" });
        if (link) v.assetLinks.push({ id: uid("lnk"), ...link });
        // returning approved asset to review; unrelated versions untouched
        if (v.reviewStatus === "ready") v.reviewStatus = "awaiting_review";
        logActivity(d, v.ideaId, "asset_replaced", `Approved asset replaced → back to review`);
        return d;
      });
    },

    // --- comments ---
    addComment(ideaId, { versionId = null, anchor = { type: "general" }, text }) {
      update((d) => {
        d.comments.push({ id: uid("cm"), ideaId, versionId, anchor, text, authorId: d.actingUserId, at: nowIso(), resolved: false, replies: [] });
        return d;
      });
    },
    replyComment(commentId, text) {
      update((d) => {
        const c = d.comments.find((x) => x.id === commentId);
        if (c) c.replies.push({ id: uid("rp"), authorId: d.actingUserId, at: nowIso(), text });
        return d;
      });
    },
    resolveComment(commentId, resolved = true) {
      update((d) => { const c = d.comments.find((x) => x.id === commentId); if (c) c.resolved = resolved; return d; });
    },

    // --- placements ---
    placeVersion(versionId, date, time = null, opts = {}) {
      // compute conflict from current db (synchronously) before mutating
      const curV = db.versions.find((x) => x.id === versionId);
      let conflict = null;
      if (curV) {
        const sameDayNow = db.placements.filter((p) => p.state !== "cancelled" && p.date === date && db.versions.find((vv) => vv.id === p.versionId)?.ideaId === curV.ideaId && p.versionId !== versionId);
        if (sameDayNow.length && !opts.exception) conflict = "same_day_repetition";
      }
      if (conflict && !opts.force && !opts.exception) return conflict;
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (!v) return d;
        const idea = d.ideas.find((i) => i.id === v.ideaId);
        // prevent duplicate active placement of same version
        const dup = d.placements.find((p) => p.versionId === versionId && p.state !== "cancelled");
        if (dup) { dup.date = date; dup.time = time; dup.history.push({ at: nowIso(), by: d.actingUserId, action: `Moved to ${date}` }); }
        else d.placements.push({ id: uid("pl"), versionId, ipId: v.ipId, date, time, order: opts.order || 1, state: "pending", history: [{ at: nowIso(), by: d.actingUserId, action: "Placed" }], exceptionReason: opts.exception ? opts.reason || "Authorised exception" : null });
        logActivity(d, idea.id, "placed", `Placed on ${d.ips.find((i) => i.id === v.ipId)?.code} — ${date}`);
        return d;
      });
      return conflict;
    },

    bulkPlace(proposals) {
      // proposals: [{versionId, date, time}]
      update((d) => {
        proposals.forEach((p) => {
          const v = d.versions.find((x) => x.id === p.versionId);
          if (!v) return;
          const existing = d.placements.find((pl) => pl.versionId === p.versionId && pl.state !== "cancelled");
          if (existing) { existing.date = p.date; existing.time = p.time || null; existing.history.push({ at: nowIso(), by: d.actingUserId, action: `Bulk moved to ${p.date}` }); }
          else d.placements.push({ id: uid("pl"), versionId: p.versionId, ipId: v.ipId, date: p.date, time: p.time || null, order: 1, state: "pending", history: [{ at: nowIso(), by: d.actingUserId, action: "Bulk placed" }], exceptionReason: null });
        });
        return d;
      });
    },

    movePlacement(placementId, date) {
      update((d) => { const p = d.placements.find((x) => x.id === placementId); if (p) { p.history.push({ at: nowIso(), by: d.actingUserId, action: `Moved ${p.date} → ${date}` }); p.date = date; } return d; });
    },
    cancelPlacement(placementId, reason) {
      update((d) => { const p = d.placements.find((x) => x.id === placementId); if (p) { p.state = "cancelled"; p.exceptionReason = reason || p.exceptionReason; p.history.push({ at: nowIso(), by: d.actingUserId, action: `Cancelled: ${reason || ""}` }); } return d; });
    },
    unallocateVersion(versionId, reason) {
      update((d) => {
        d.placements.filter((p) => p.versionId === versionId && p.state !== "cancelled").forEach((p) => { p.state = "cancelled"; p.exceptionReason = reason || "Returned to unallocated"; p.history.push({ at: nowIso(), by: d.actingUserId, action: "Returned to bank" }); });
        return d;
      });
    },

    authorizeException(placementId, reason) {
      update((d) => {
        const p = d.placements.find((x) => x.id === placementId);
        if (p) {
          p.exceptionReason = reason || "Authorised exception";
          p.exceptionBy = d.actingUserId;
          p.exceptionAt = nowIso();
          p.history.push({ at: nowIso(), by: d.actingUserId, action: `Authorised same-day exception: ${reason || ""}` });
          const v = d.versions.find((x) => x.id === p.versionId);
          if (v) logActivity(d, v.ideaId, "exception", `Same-day repetition exception authorised by ${actingUser.name}`);
        }
        return d;
      });
    },

    // HPN takes a BO placement: place HPN, and reschedule OR return the BO version — never lose it
    replaceBOWithHPN({ boVersionId, hpnVersionId, ipId, date, boAction, newDate, reason }) {
      update((d) => {
        // place HPN version on the slot
        const hv = d.versions.find((x) => x.id === hpnVersionId);
        if (hv) {
          let hpl = d.placements.find((p) => p.versionId === hpnVersionId && p.state !== "cancelled");
          if (hpl) { hpl.date = date; hpl.ipId = ipId; hpl.history.push({ at: nowIso(), by: d.actingUserId, action: `Moved into displaced BO slot ${date}` }); }
          else d.placements.push({ id: uid("pl"), versionId: hpnVersionId, ipId, date, time: null, order: 1, state: "pending", history: [{ at: nowIso(), by: d.actingUserId, action: "Placed (HPN displacement)" }], exceptionReason: null });
          logActivity(d, hv.ideaId, "placed", `HPN placed into BO slot on ${date}`);
        }
        // handle displaced BO version
        const bpl = d.placements.find((p) => p.versionId === boVersionId && p.state !== "cancelled");
        const bv = d.versions.find((x) => x.id === boVersionId);
        if (bpl) {
          if (boAction === "reschedule" && newDate) {
            bpl.history.push({ at: nowIso(), by: d.actingUserId, action: `Displaced by HPN: rescheduled ${bpl.date} → ${newDate}` });
            bpl.date = newDate;
            if (bv) logActivity(d, bv.ideaId, "displaced", `Displaced by HPN — rescheduled to ${newDate}`);
          } else {
            bpl.state = "cancelled";
            bpl.exceptionReason = reason || "Displaced by HPN — returned to unallocated bank";
            bpl.history.push({ at: nowIso(), by: d.actingUserId, action: "Displaced by HPN → returned to bank (age & approval intact)" });
            if (bv) logActivity(d, bv.ideaId, "displaced", `Displaced by HPN — returned to unallocated bank`);
          }
        }
        return d;
      });
    },

    // --- publication ---
    confirmPublication(versionId, url, publishedAtIso) {
      const dupUrl = !!(url && db.publications.some((p) => p.url === url));
      update((d) => {
        const v = d.versions.find((x) => x.id === versionId);
        if (!v) return d;
        let pl = d.placements.find((p) => p.versionId === versionId && p.state !== "cancelled");
        if (pl) pl.state = "confirmed"; 
        const pub = { id: uid("pub"), versionIds: [versionId], ipIds: [v.ipId], url, publishedAt: publishedAtIso, placementIds: pl ? [pl.id] : [], isCollab: false };
        d.publications.push(pub);
        const dueAt = new Date(new Date(publishedAtIso).getTime() + 24 * 3600000).toISOString();
        d.snapshots.push({ id: uid("snap"), publicationId: pub.id, views: null, measuredAt: null, ageHours: null, recordedBy: null, dueAt });
        logActivity(d, v.ideaId, "published", `Published to ${d.ips.find((i) => i.id === v.ipId)?.code}`);
        return d;
      });
      return { dupUrl };
    },

    linkCollaboration(publicationId, versionId) {
      update((d) => {
        const pub = d.publications.find((p) => p.id === publicationId);
        const v = d.versions.find((x) => x.id === versionId);
        if (pub && v && !pub.versionIds.includes(versionId)) { pub.versionIds.push(versionId); pub.ipIds.push(v.ipId); pub.isCollab = true; logActivity(d, v.ideaId, "collab", `Linked as collaboration`); }
        return d;
      });
    },

    reportLivePending(versionId) {
      update((d) => {
        const pl = d.placements.find((p) => p.versionId === versionId && p.state !== "cancelled");
        if (pl) { pl.reportedPending = true; pl.history.push({ at: nowIso(), by: d.actingUserId, action: "Reported live, link pending" }); }
        return d;
      });
    },

    recordSnapshot(publicationId, views, measuredAtIso) {
      update((d) => {
        const pub = d.publications.find((p) => p.id === publicationId);
        if (!pub) return d;
        const viewsVal = views === "" || views === null || views === undefined || Number.isNaN(Number(views)) ? null : Number(views);
        const ageHours = Math.round((new Date(measuredAtIso).getTime() - new Date(pub.publishedAt).getTime()) / 3600000);
        let snap = d.snapshots.find((s) => s.publicationId === publicationId);
        if (!snap) {
          const dueAt = new Date(new Date(pub.publishedAt).getTime() + 24 * 3600000).toISOString();
          snap = { id: uid("snap"), publicationId, views: null, measuredAt: null, ageHours: null, recordedBy: null, dueAt };
          d.snapshots.push(snap);
        }
        snap.views = viewsVal;
        snap.measuredAt = viewsVal == null ? null : measuredAtIso;
        snap.ageHours = viewsVal == null ? null : ageHours;
        snap.recordedBy = d.actingUserId;
        return d;
      });
    },

    // --- HPN quick drawer: record owner, assets, review outcome in one go ---
    hpnQuickRecord(ideaId, { ownerId, links, reviewerId, outcome }) {
      update((d) => {
        const idea = d.ideas.find((i) => i.id === ideaId);
        if (!idea) return d;
        if (ownerId) idea.productionOwnerId = ownerId;
        if (reviewerId) idea.reviewerId = reviewerId;
        const vs = d.versions.filter((v) => v.ideaId === ideaId);
        vs.forEach((v) => {
          if (links && typeof links === "object" && links.url) {
            v.assetLinks.push({ id: uid("lnk"), type: links.type || "drive", url: links.url, label: links.label || links.url });
          }
          v.reviewStatus = outcome === "approved" ? "ready" : "changes_requested";
        });
        logActivity(d, ideaId, "hpn_record", `HPN outcome recorded by ${actingUser.name}: ${outcome}`);
        return d;
      });
    },

    // --- settings CRUD ---
    addIP(ip) { update((d) => { d.ips.push({ id: uid("ip"), active: true, floors: { posts: 0, reels: 0 }, ranges: {}, menu: [], boTarget: null, perfTarget: { reel: null, post: null, note: "" }, spacingMinutes: null, ...ip }); return d; }); },
    updateIP(id, patch) { update((d) => { const ip = d.ips.find((x) => x.id === id); if (ip) Object.assign(ip, patch); return d; }); },
    addUser(u) { update((d) => { d.users.push({ id: uid("u"), active: true, initials: (u.name || "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase(), color: "#57534E", skills: [], streams: [], roles: [], ...u }); return d; }); },
    updateUser(id, patch) { update((d) => { const u = d.users.find((x) => x.id === id); if (u) Object.assign(u, patch); return d; }); },
    addCategory(c) { update((d) => { d.categories.push({ id: uid("cat"), ...c }); return d; }); },
    updateSettings(patch) { update((d) => { Object.assign(d.settings, patch); return d; }); },
    updateBatch(id, patch) { update((d) => { const b = d.batches.find((x) => x.id === id); if (b) Object.assign(b, patch); return d; }); },

    // --- 6-day tracker ---
    upsertSixDayEntry({ month, cycle, ipId, ...fields }) {
      update((d) => {
        let e = d.sixDay.entries.find((x) => x.month === month && x.cycle === cycle && x.ipId === ipId);
        if (!e) { e = { id: uid("sde"), month, cycle, ipId }; d.sixDay.entries.push(e); }
        Object.assign(e, fields, { filledBy: d.actingUserId, updatedAt: nowIso() });
        return d;
      });
    },
    addSixDayTopContent(item) { update((d) => { d.sixDay.topContent.push({ id: uid("sdt"), ...item }); return d; }); },
    updateSixDayTopContent(id, patch) { update((d) => { const t = d.sixDay.topContent.find((x) => x.id === id); if (t) Object.assign(t, patch); return d; }); },
    deleteSixDayTopContent(id) { update((d) => { d.sixDay.topContent = d.sixDay.topContent.filter((x) => x.id !== id); return d; }); },
    upsertSixDayActual(month, ipId, actualViews) {
      update((d) => {
        let a = d.sixDay.actuals.find((x) => x.month === month && x.ipId === ipId);
        if (!a) { a = { month, ipId }; d.sixDay.actuals.push(a); }
        Object.assign(a, { actualViews, filledBy: d.actingUserId });
        return d;
      });
    },
    setSixDayAssignee(userId) { update((d) => { d.sixDay.config.assigneeId = userId; return d; }); },
    setFollowersGained(month, ipId, followersGained) {
      update((d) => {
        let f = d.growth.followers.find((x) => x.month === month && x.ipId === ipId);
        if (!f) { f = { month, ipId }; d.growth.followers.push(f); }
        f.followersGained = followersGained;
        return d;
      });
    },

    // --- tickets ---
    createTicket({ title, description, urgency, tags, attachments }) {
      update((d) => {
        d.ticketSeq = (d.ticketSeq || 100) + 1;
        const firstLine = (description || "").split("\n")[0].trim().slice(0, 120);
        const t = {
          id: uid("tkt"), ticketNumber: d.ticketSeq, title: (title || "").trim() || firstLine || "Ticket",
          description, urgency: urgency || "normal", status: "not_started", tags: tags || [],
          reporterId: d.actingUserId, assigneeId: null, attachments: attachments || [],
          createdAt: nowIso(), updatedAt: nowIso(), resolvedAt: null,
        };
        d.tickets.unshift(t);
        ticketMentionNotifications(d, t, []);
        return d;
      });
    },
    patchTicket(id, patch) {
      update((d) => {
        const t = d.tickets.find((x) => x.id === id);
        if (!t) return d;
        const before = { status: t.status, assigneeId: t.assigneeId, tags: [...(t.tags || [])] };
        Object.assign(t, patch, { updatedAt: nowIso() });
        if ("status" in patch) t.resolvedAt = patch.status === "resolved" ? nowIso() : null;
        const label = `#${t.ticketNumber}: ${t.title}`;
        if (t.assigneeId && t.assigneeId !== before.assigneeId && t.assigneeId !== d.actingUserId) {
          notifyUser(d, t.assigneeId, "ticket", `Ticket assigned to you — ${label}`, t.id);
        }
        if (t.status !== before.status && t.reporterId && t.reporterId !== d.actingUserId) {
          if (t.status === "in_progress") notifyUser(d, t.reporterId, "ticket", `Your ticket is being worked on — ${label}`, t.id);
          if (t.status === "resolved") notifyUser(d, t.reporterId, "ticket", `Your ticket was marked finished — ${label}`, t.id);
        }
        ticketMentionNotifications(d, t, before.tags);
        return d;
      });
    },
    deleteTicket(id) { update((d) => { d.tickets = d.tickets.filter((x) => x.id !== id); return d; }); },

    // --- news feed ---
    // `item` is kept so saved live stories survive after they age out of the feed.
    toggleNewsSaved(itemId, item) {
      update((d) => {
        const s = d.newsState.saved;
        d.newsState.savedItems = d.newsState.savedItems || {};
        if (s.includes(itemId)) {
          d.newsState.saved = s.filter((x) => x !== itemId);
          delete d.newsState.savedItems[itemId];
        } else {
          d.newsState.saved = [itemId, ...s];
          if (item) d.newsState.savedItems[itemId] = item;
        }
        return d;
      });
    },
    // Votes & bookmarks already stored in Supabase (shared with snoboard) merge over local ones.
    mergeNewsRemote({ feedback, savedItems }) {
      update((d) => {
        Object.assign(d.newsState.feedback, feedback);
        d.newsState.savedItems = d.newsState.savedItems || {};
        savedItems.forEach((it) => {
          if (!d.newsState.saved.includes(it.id)) d.newsState.saved.push(it.id);
          d.newsState.savedItems[it.id] = it;
        });
        return d;
      });
    },
    voteNews(itemId, vote, learnedCategory) {
      update((d) => {
        d.newsState.feedback[itemId] = vote;
        if (learnedCategory && !d.newsState.rules.includes(learnedCategory)) d.newsState.rules.push(learnedCategory);
        return d;
      });
    },
    resetNewsLearning() { update((d) => { d.newsState.feedback = {}; d.newsState.rules = []; return d; }); },
    // Demo "scrape": releases the next few queued stories as freshly published.
    scrapeNews() {
      const count = Math.min(3, db.news.reserve.length);
      update((d) => {
        const fresh = scrapeReserveItems(d.news.reserve, 3).filter((it) => !d.news.items.some((x) => x.id === it.id));
        d.news.items = [...fresh, ...d.news.items];
        d.news.reserve = d.news.reserve.slice(3);
        d.news.lastScrapedAt = nowIso();
        return d;
      });
      return count;
    },

    // --- users & roles ---
    setRoleAccess(role, matrix) {
      update((d) => { if (role !== LOCKED_ROLE) d.access.roles[role] = { ...matrix }; return d; });
    },
    resetRoleAccess(role) { update((d) => { delete d.access.roles[role]; return d; }); },
    setPersonAccess(userId, { roles, matrix }) {
      update((d) => {
        const u = d.users.find((x) => x.id === userId);
        if (u && roles) u.roles = roles;
        if (matrix) d.access.people[userId] = { ...matrix };
        else delete d.access.people[userId];
        return d;
      });
    },
    removePersonAccess(userId) {
      update((d) => {
        const u = d.users.find((x) => x.id === userId);
        if (u) u.roles = [];
        delete d.access.people[userId];
        return d;
      });
    },

    markNotificationsRead() { update((d) => { d.notifications.forEach((n) => { if (!n.userId || n.userId === d.actingUserId) n.read = true; }); return d; }); },
    markNotificationRead(id) { update((d) => { const n = d.notifications.find((x) => x.id === id); if (n) n.read = true; return d; }); },
  };

  return (
    <DemoContext.Provider value={{ db, actions, actingUser, gateUser, today, access, previewRole: activePreview, setPreviewRole, canPreview }}>
      {children}
    </DemoContext.Provider>
  );
}

function notifyUser(d, userId, type, text, ticketId) {
  d.notifications.unshift({ id: uid("nt"), type, userId, text, ticketId, at: nowIso(), read: false });
}

// "@First" tags address people by first name — notify anyone newly mentioned.
function ticketMentionNotifications(d, t, prevTags) {
  if (t.status === "resolved") return;
  (t.tags || []).filter((tag) => tag.startsWith("@") && !prevTags.includes(tag)).forEach((tag) => {
    const name = tag.slice(1).toLowerCase();
    const u = d.users.find((x) => x.name.split(" ")[0].toLowerCase() === name);
    if (u && u.id !== d.actingUserId) notifyUser(d, u.id, "ticket", `You were mentioned on ticket #${t.ticketNumber}: ${t.title}`, t.id);
  });
}

/** Area access for the acting user (or the previewed role). */
export function useAccess() {
  const { access, previewRole, setPreviewRole, canPreview } = useDemo();
  return {
    access,
    level: (area) => access[area] || "none",
    canView: (area) => (access[area] || "none") !== "none",
    canEdit: (area) => access[area] === "edit",
    previewRole,
    setPreviewRole,
    canPreview,
  };
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
