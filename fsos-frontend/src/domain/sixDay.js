// Calendar maths for the 6-Day Tracker, and the per-IP fields the tools read.
//
// These used to live in the demo seed. They aren't demo data — the six cycles are how
// the team actually splits a month, and every screen that compares "cycle 3 this month
// vs cycle 3 last month" depends on them not moving.

export function monthOf(dateStr) {
  return (dateStr || "").slice(0, 7);
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The five fixed cycles of a month: 1–6, 7–12, 13–18, 19–24, 25–end.
 * Fixed calendar days, not rolling six-day windows — the last one is short in February
 * and long in March, and that is deliberate.
 */
export function sixDayCyclesFor(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
  return [
    { cycle: 1, start: `${ym}-01`, end: `${ym}-06`, deadline: `${ym}-07` },
    { cycle: 2, start: `${ym}-07`, end: `${ym}-12`, deadline: `${ym}-13` },
    { cycle: 3, start: `${ym}-13`, end: `${ym}-18`, deadline: `${ym}-19` },
    { cycle: 4, start: `${ym}-19`, end: `${ym}-24`, deadline: `${ym}-25` },
    { cycle: 5, start: `${ym}-25`, end: `${ym}-${last}`, deadline: `${ym}-${last}` },
  ];
}

/**
 * Handle, tracker group and stage for an IP. These are columns on the IP now, so this
 * only fills in sensible defaults for one that hasn't been configured yet — a new IP
 * shows up everywhere without anyone inventing history for it.
 */
export function ipMeta(ip) {
  return {
    handle: ip?.handle || String(ip?.code || ip?.name || "").toLowerCase().replace(/[^a-z0-9._]/g, ""),
    group: ip?.group || "none",
    stage: ip?.stage || 1,
  };
}
