// Derived views for the 6-Day Tracker and Growth. Growth is computed from 6-day
// cycle entries (the source of truth), so both screens always agree.
import { sixDayCyclesFor, monthOf, ipMeta } from "./sixDay";

export const TRACKER_GROUPS = [
  { key: "bizz_playbook", label: "Bizz playbook", emoji: "💼" },
  { key: "bizz", label: "BIZZ", emoji: "🏷️" },
  { key: "x101", label: "101x", emoji: "⭐" },
  { key: "news", label: "News playbook", emoji: "📰" },
  { key: "founders", label: "Founders", emoji: "🚀" },
  { key: "tech", label: "Tech playbook", emoji: "⚡" },
  { key: "inactive", label: "Inactive", emoji: "💤" },
];

/** Tracker group for an IP — paused IPs always land in Inactive. */
export function trackerGroup(ip) {
  if (!ip.active) return "inactive";
  return ipMeta(ip).group;
}

const meaningful = (e) =>
  !!e && ((e.views ?? 0) > 0 || e.reelPct != null || e.postPct != null || e.reelPerf != null || e.postPerf != null);

export function isIPFilled(db, month, cycle, ipId) {
  const e = db.sixDay.entries.find((x) => x.month === month && x.cycle === cycle && x.ipId === ipId);
  return meaningful(e) || db.sixDay.topContent.some((t) => t.month === month && t.cycle === cycle && t.ipId === ipId);
}

export function cycleStatus(c, today) {
  if (today < c.start) return "upcoming";
  if (today <= c.end) return "active";
  return "done";
}

export function sixDayMonth(db, month, today) {
  return sixDayCyclesFor(month).map((c) => ({
    ...c,
    status: cycleStatus(c, today),
    entries: db.sixDay.entries.filter((e) => e.month === month && e.cycle === c.cycle),
    topContent: db.sixDay.topContent.filter((t) => t.month === month && t.cycle === c.cycle),
  }));
}

/** Cycles in the current month whose deadline has passed with active IPs still unfilled. */
export function sixDayOverdue(db, today) {
  const month = monthOf(today);
  const active = db.ips.filter((i) => i.active);
  return sixDayCyclesFor(month)
    .filter((c) => today >= c.deadline)
    .map((c) => {
      const missing = active.filter((ip) => !isIPFilled(db, month, c.cycle, ip.id));
      return { ...c, missingCount: missing.length, missing };
    })
    .filter((c) => c.missingCount > 0);
}

export function pageSummaries(db, month) {
  return db.ips.map((ip) => {
    const cycleViews = db.sixDay.entries
      .filter((e) => e.month === month && e.ipId === ip.id)
      .reduce((s, e) => s + (e.views || 0), 0);
    const actual = db.sixDay.actuals.find((a) => a.month === month && a.ipId === ip.id);
    return { ip, cycleViewsSum: cycleViews, actualViews: actual?.actualViews ?? null };
  });
}

/** One row per IP per month that has 6-day data: views + reel/post split + followers. */
export function growthRows(db) {
  const map = new Map();
  db.sixDay.entries.forEach((e) => {
    const k = `${e.ipId}|${e.month}`;
    const row = map.get(k) || { ipId: e.ipId, month: e.month, views: 0, reelViews: 0, postViews: 0, followersGained: 0 };
    const v = e.views || 0;
    row.views += v;
    if (e.reelPct != null) row.reelViews += (v * e.reelPct) / 100;
    if (e.postPct != null) row.postViews += (v * e.postPct) / 100;
    map.set(k, row);
  });
  (db.growth?.followers || []).forEach((f) => {
    const k = `${f.ipId}|${f.month}`;
    const row = map.get(k) || { ipId: f.ipId, month: f.month, views: 0, reelViews: 0, postViews: 0, followersGained: 0 };
    row.followersGained = f.followersGained || 0;
    map.set(k, row);
  });
  return [...map.values()]
    .map((r) => {
      const ip = db.ips.find((i) => i.id === r.ipId);
      if (!ip) return null;
      const meta = ipMeta(ip);
      return { ...r, reelViews: Math.round(r.reelViews), postViews: Math.round(r.postViews), ip, handle: meta.handle, stage: meta.stage };
    })
    .filter(Boolean);
}

export function fmtCompact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toLocaleString();
}

export function monthLabel(ym, opts = { month: "long", year: "numeric" }) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, 1)));
}
