import { formatCounts } from "./constants";
import { addDays, diffDays } from "./dates";

// ---- lookups ----
export const ipById = (db, id) => db.ips.find((i) => i.id === id);

/**
 * The IPs an operational screen should show: the ones being posted to, plus any paused
 * one that still has something on it.
 *
 * All 48 pages came across in the import and only 13 are active, so listing every one
 * buries the roster in rows reading "0P · 0R · met". A paused IP isn't deleted, though —
 * it keeps its placements and publications — so it stays visible while it has work
 * attached and drops out once it doesn't. Settings deliberately lists all of them; that's
 * where you turn one back on.
 */
export function visibleIps(db, { withPlacements = true, withPublications = true } = {}) {
  const busy = new Set();
  if (withPlacements) {
    db.placements.forEach((p) => { if (p.state !== "cancelled") busy.add(p.ipId); });
  }
  if (withPublications) {
    db.publications.forEach((p) => (p.ipIds || []).forEach((id) => busy.add(id)));
  }
  return db.ips.filter((ip) => ip.active || busy.has(ip.id));
}
export const userById = (db, id) => db.users.find((u) => u.id === id);
export const ideaById = (db, id) => db.ideas.find((i) => i.id === id);
/**
 * An idea's versions, in the order its destinations were chosen.
 *
 * Not whatever order the rows arrive in: editing a version rewrites its row, and
 * without an explicit order that moved its card on the next refresh. Anything not in
 * `destinations` any more (a removed IP whose version was kept) sorts to the end.
 */
export const versionsOf = (db, ideaId) => {
  const idea = db.ideas.find((i) => i.id === ideaId);
  const order = idea?.destinations || [];
  return db.versions
    .filter((v) => v.ideaId === ideaId)
    .slice()
    .sort((a, b) => {
      const ia = order.indexOf(a.ipId);
      const ib = order.indexOf(b.ipId);
      return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib) || String(a.id).localeCompare(String(b.id));
    });
};
export const activePlacementOf = (db, versionId) => db.placements.find((p) => p.versionId === versionId && p.state !== "cancelled");
export const publicationOf = (db, versionId) => db.publications.find((p) => p.versionIds.includes(versionId));
export const snapshotOf = (db, publicationId) => db.snapshots.find((s) => s.publicationId === publicationId);

// ---- idea progress + derived state ----
export function ideaProgress(db, idea) {
  const vs = versionsOf(db, idea.id);
  const counts = { total: vs.length, not_started: 0, in_production: 0, awaiting_review: 0, changes_requested: 0, ready: 0, published: 0 };
  vs.forEach((v) => {
    if (publicationOf(db, v.id)) counts.published += 1;
    else counts[v.reviewStatus] = (counts[v.reviewStatus] || 0) + 1;
  });
  return counts;
}

export function needsIdeaApproval(idea) {
  return idea && idea.stream === "BO";
}

export function ideaDerivedState(db, idea) {
  if (needsIdeaApproval(idea) && idea.approval.state === "pending" && !idea.bypassUsed) {
    const anyProduced = versionsOf(db, idea.id).some((v) => v.assetLinks.length);
    return anyProduced ? "in_production" : "awaiting_approval";
  }
  const c = ideaProgress(db, idea);
  if (c.total === 0) return "draft";
  if (c.published > 0 && c.published < c.total) return "partly_published";
  if (c.published === c.total && c.total > 0) return "published";
  if (!idea.productionOwnerId && idea.approval.state === "approved") return "approved_unassigned";
  if (c.changes_requested > 0) return "changes_requested";
  if (c.awaiting_review > 0) return "awaiting_review";
  if (c.ready === c.total && c.total > 0) return "ready";
  if (c.in_production > 0 || c.not_started > 0) return "in_production";
  return "in_production";
}

// ---- bank health ----
export function matchesStream(idea, streamFilter) {
  if (!idea) return false;
  if (!streamFilter || streamFilter === "All") return true;
  return idea.stream === streamFilter;
}

function ideaOfPublication(db, pub) {
  const v = db.versions.find((x) => pub?.versionIds?.includes(x.id));
  return v ? ideaById(db, v.ideaId) : null;
}

function pubMatchesStream(db, pub, streamFilter) {
  if (!streamFilter || streamFilter === "All") return true;
  return matchesStream(ideaOfPublication(db, pub), streamFilter);
}

export function readyBankVersions(db, stream = "BO") {
  // ready, not yet published (includes future-allocated). Default BO keeps Command Room bank stats unchanged.
  return db.versions.filter((v) => {
    const idea = ideaById(db, v.ideaId);
    return idea && matchesStream(idea, stream) && v.reviewStatus === "ready" && !publicationOf(db, v.id);
  });
}

export function bankSummary(db, stream = "BO") {
  const ready = readyBankVersions(db, stream);
  const inProd = db.versions.filter((v) => {
    const idea = ideaById(db, v.ideaId);
    return idea && matchesStream(idea, stream) && ["in_production", "awaiting_review", "changes_requested"].includes(v.reviewStatus);
  });
  const ideaSet = new Set(ready.map((v) => v.ideaId));
  const unallocated = ready.filter((v) => !activePlacementOf(db, v.id));
  const byFormat = { Reel: 0, Post: 0 };
  ready.forEach((v) => {
    const idea = ideaById(db, v.ideaId);
    if (idea.format === "Reel") byFormat.Reel += 1; else byFormat.Post += 1;
  });
  return { readyCount: ready.length, ideaCount: ideaSet.size, inProdCount: inProd.length, unallocatedCount: unallocated.length, byFormat, ready, unallocated };
}

// stock days per IP/format — Not configured when no BO target
export function bankStockDays(db, stream = "BO") {
  const ready = readyBankVersions(db, stream);
  return visibleIps(db, { withPublications: false }).map((ip) => {
    const readyReel = ready.filter((v) => v.ipId === ip.id && ideaById(db, v.ideaId).format === "Reel").length;
    const readyPost = ready.filter((v) => v.ipId === ip.id && ideaById(db, v.ideaId).format !== "Reel").length;
    const boReel = ip.boTarget?.reels ?? null;
    const boPost = ip.boTarget?.posts ?? null;
    const daysReel = boReel == null ? "not_configured" : boReel === 0 ? "na" : (readyReel / boReel);
    const daysPost = boPost == null ? "not_configured" : boPost === 0 ? "na" : (readyPost / boPost);
    return { ip, readyReel, readyPost, daysReel, daysPost };
  });
}

// ---- network posting status for a date ----
export function networkStatus(db, date, stream = "All") {
  return visibleIps(db, { withPublications: false }).map((ip) => {
    const req = ip.floors;
    let plannedPosts = 0, plannedReels = 0, confPosts = 0, confReels = 0, readyPosts = 0, readyReels = 0;
    db.placements.filter((p) => p.date === date && p.state !== "cancelled" && p.ipId === ip.id).forEach((p) => {
      const v = db.versions.find((x) => x.id === p.versionId);
      if (!v) return;
      const idea = ideaById(db, v.ideaId);
      if (!matchesStream(idea, stream)) return;
      const fc = formatCounts(idea.format);
      plannedPosts += fc.posts; plannedReels += fc.reels;
      const pub = publicationOf(db, v.id);
      if (pub) { confPosts += fc.posts; confReels += fc.reels; }
      else if (v.reviewStatus === "ready") { readyPosts += fc.posts; readyReels += fc.reels; }
    });
    return { ip, req, plannedPosts, plannedReels, confPosts, confReels, readyPosts, readyReels };
  });
}

// ---- performance classification ----
export function classify(views, target, thresholds) {
  if (target == null || views == null) return "unrated";
  const pct = (views / target) * 100;
  if (pct >= thresholds.good) return "good";
  if (pct >= thresholds.average) return "average";
  return "bad";
}

export function targetFor(db, ipId, format) {
  const ip = ipById(db, ipId);
  if (!ip) return null;
  return format === "Reel" ? ip.perfTarget?.reel ?? null : ip.perfTarget?.post ?? null;
}

// recent baseline: trailing measured pubs same ip+format, excluding this one & missing
export function recentBaseline(db, ipId, format, excludePubId, sample) {
  const items = db.publications
    .filter((p) => p.id !== excludePubId && p.ipIds.includes(ipId))
    .map((p) => ({ p, s: snapshotOf(db, p.id) }))
    .filter(({ p, s }) => {
      if (!s || s.views == null) return false;
      const vid = p.versionIds.find((id) => db.versions.find((v) => v.id === id)?.ipId === ipId);
      const v = db.versions.find((x) => x.id === vid);
      const idea = v && ideaById(db, v.ideaId);
      return idea && idea.format === format;
    })
    .sort((a, b) => (a.p.publishedAt < b.p.publishedAt ? 1 : -1))
    .slice(0, sample);
  if (!items.length) return { avg: null, n: 0 };
  const avg = Math.round(items.reduce((s, x) => s + x.s.views, 0) / items.length);
  return { avg, n: items.length };
}

// ---- six-day cycles ----
export function sixDayCycles(db, count = 6, stream = "All") {
  const today = db.meta.anchor;
  // The anchor fixes where the six-day cycles fall. Until someone sets one in Settings
  // it isn't configured, and a window ending on today is the honest stand-in: it's a
  // way of looking at real publications, not invented data. Once set, the boundaries
  // stop moving, which is the whole point of having an anchor.
  const anchor = db.settings.cycleAnchor || addDays(today, -6 * count + 1);
  // build cycles forward from anchor until covering today
  const cycles = [];
  let start = anchor;
  while (diffDays(today, start) >= 0) {
    const end = addDays(start, 5);
    cycles.push({ start, end });
    start = addDays(start, 6);
    if (cycles.length > 30) break;
  }
  const tail = cycles.slice(-count);
  return tail.map((c) => {
    const pubs = db.publications.filter((p) => p.publishedAt.slice(0, 10) >= c.start && p.publishedAt.slice(0, 10) <= c.end && pubMatchesStream(db, p, stream));
    let measured = 0, missing = 0, due = 0, sum = 0;
    const tiers = { good: 0, average: 0, bad: 0, unrated: 0 };
    pubs.forEach((p) => {
      const s = snapshotOf(db, p.id);
      if (!s || s.views == null) { if (s && new Date(s.dueAt) > new Date()) due += 1; else missing += 1; return; }
      measured += 1; sum += s.views;
      const vid = p.versionIds[0];
      const v = db.versions.find((x) => x.id === vid);
      const idea = v && ideaById(db, v.ideaId);
      const t = targetFor(db, p.ipIds[0], idea?.format);
      tiers[classify(s.views, t, db.settings.thresholds)] += 1;
    });
    const inProgress = c.end >= today;
    return { ...c, pubs: pubs.length, measured, missing, due, sum, mean: measured ? Math.round(sum / measured) : 0, tiers, inProgress };
  });
}

// per-IP within a cycle range
export function cyclePerIp(db, start, end, stream = "All") {
  return visibleIps(db).map((ip) => {
    const pubs = db.publications.filter((p) => p.ipIds.includes(ip.id) && p.publishedAt.slice(0, 10) >= start && p.publishedAt.slice(0, 10) <= end && pubMatchesStream(db, p, stream));
    let sum = 0, measured = 0, missing = 0;
    pubs.forEach((p) => { const s = snapshotOf(db, p.id); if (s && s.views != null) { sum += s.views; measured += 1; } else missing += 1; });
    return { ip, pubs: pubs.length, measured, missing, sum, mean: measured ? Math.round(sum / measured) : 0 };
  });
}

// ---- capture tasks ----
export function captureTasks(db, stream = "All") {
  return db.publications.filter((p) => pubMatchesStream(db, p, stream)).map((p) => {
    const s = snapshotOf(db, p.id);
    const done = s && s.views != null;
    const overdue = s && !done && new Date(s.dueAt) < new Date();
    return { pub: p, snap: s, done, overdue, dueAt: s?.dueAt };
  });
}

// ---- yesterday cohort ----
export function yesterdayCohort(db, stream = "All") {
  const y = addDays(db.meta.anchor, -1);
  const pubs = db.publications.filter((p) => p.publishedAt.slice(0, 10) === y && pubMatchesStream(db, p, stream));
  return pubs.map((p) => {
    const s = snapshotOf(db, p.id);
    const idea = ideaOfPublication(db, p);
    const t = targetFor(db, p.ipIds[0], idea?.format);
    const tier = s && s.views != null ? classify(s.views, t, db.settings.thresholds) : "unrated";
    const notDue = s && s.views == null && new Date(s.dueAt) > new Date();
    return { pub: p, idea, ip: ipById(db, p.ipIds[0]), views: s?.views ?? null, tier, notDue, ageHours: s?.ageHours };
  });
}

// ---- My Work ----
export function myWork(db, userId) {
  return db.ideas.filter((i) => i.productionOwnerId === userId).map((idea) => ({ idea, progress: ideaProgress(db, idea) }));
}

// unassigned approved ideas / overdue / awaiting review (production issues)
export function productionIssues(db, stream = "All") {
  const today = db.meta.anchor;
  const unassigned = db.ideas.filter((i) => matchesStream(i, stream) && i.approval.state === "approved" && !i.productionOwnerId && ideaProgress(db, i).published === 0);
  const overdue = db.ideas.filter((i) => matchesStream(i, stream) && i.deadline && i.deadline < today && ideaDerivedState(db, i) !== "published" && ideaDerivedState(db, i) !== "ready");
  const awaitingReview = db.versions.filter((v) => v.reviewStatus === "awaiting_review" && matchesStream(ideaById(db, v.ideaId), stream));
  return { unassigned, overdue, awaitingReview };
}

const NOTIFICATION_TABS = {
  review_request: "production",
  submitted: "production",
  assigned: "production",
  changes_requested: "versions",
  comment: "activity",
  capture_due: "performance",
  views_due: "performance",
  published: "performance",
};

export function notificationOpenTarget(db, n) {
  let ideaId = n?.ideaId || null;
  if (!ideaId && n?.publicationId) {
    const pub = db.publications.find((p) => p.id === n.publicationId);
    const v = pub && db.versions.find((x) => pub.versionIds.includes(x.id));
    ideaId = v?.ideaId || null;
  }
  return { ideaId, tab: NOTIFICATION_TABS[n?.type] || "brief" };
}

// global search
export function searchIdeas(db, q, streamFilter) {
  if (!q) return [];
  const s = q.toLowerCase();
  return db.ideas.filter((i) => {
    if (!matchesStream(i, streamFilter)) return false;
    return i.title.toLowerCase().includes(s) || i.code.toLowerCase().includes(s) ||
      i.destinations.some((ipId) => ipById(db, ipId)?.code.toLowerCase().includes(s)) ||
      db.batches.find((b) => b.id === i.batchId)?.name.toLowerCase().includes(s);
  }).slice(0, 12);
}

// same-day repetition: other active placements of the SAME idea on the SAME date (different version/IP)
export function sameDayConflict(db, placement) {
  if (!placement || placement.exceptionReason) return [];
  const v = db.versions.find((x) => x.id === placement.versionId);
  if (!v) return [];
  return db.placements.filter((p) => p.id !== placement.id && p.state !== "cancelled" && p.date === placement.date &&
    db.versions.find((vv) => vv.id === p.versionId)?.ideaId === v.ideaId);
}

// upcoming dates where an IP has spare capacity for a given format (planned < floor)
export function candidateGaps(db, ipId, format, fromDate, n = 10) {
  const ip = ipById(db, ipId);
  if (!ip) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(fromDate, i);
    let planned = 0;
    db.placements.filter((p) => p.ipId === ipId && p.date === date && p.state !== "cancelled").forEach((p) => {
      const v = db.versions.find((x) => x.id === p.versionId);
      const idea = v && ideaById(db, v.ideaId);
      if (idea) planned += (format === "Reel" ? formatCounts(idea.format).reels : formatCounts(idea.format).posts);
    });
    const floor = format === "Reel" ? ip.floors.reels : ip.floors.posts;
    if (planned < Math.max(floor, 1)) out.push({ date, planned, floor });
  }
  return out;
}
