// IST-aware date helpers. All calendar dates are 'YYYY-MM-DD' strings in Asia/Kolkata.
const IST = "Asia/Kolkata";

export function istDateStr(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

export function istTimeStr(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

export function istDateTimeLabel(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

// date string arithmetic (treat as calendar date, tz-neutral)
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db);
  return Math.round((ta - tb) / 86400000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short",
  }).format(dt);
}

export function fmtDateFull(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(dt);
}

export function weekdayShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(dt);
}

export function nowIso() {
  return new Date().toISOString();
}

// hours between two ISO timestamps
export function hoursBetween(aIso, bIso) {
  return (new Date(aIso).getTime() - new Date(bIso).getTime()) / 3600000;
}
