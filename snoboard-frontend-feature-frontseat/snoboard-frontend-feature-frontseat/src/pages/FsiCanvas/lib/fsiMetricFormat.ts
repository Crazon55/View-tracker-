/**
 * Compact metric formatting for FSI Performance fields (views, likes, etc.).
 * Accepts "31k", "1.5m", "31000" on input; displays with k/m suffixes.
 */

/** Format a stored numeric value for display (31000 → "31k"). */
export function formatMetricDisplay(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const n = typeof raw === "number" ? raw : parseMetricInput(String(raw));
  if (n === null || !Number.isFinite(n)) return String(raw).trim();
  return formatCompactMetric(n);
}

/** Parse user input that may include k/m suffixes into a finite number, or null. */
export function parseMetricInput(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "").toLowerCase();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([km])?$/i);
  if (!m) {
    const plain = Number(s);
    return Number.isFinite(plain) ? plain : null;
  }
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") n *= 1_000;
  if (suffix === "m") n *= 1_000_000;
  return Math.round(n);
}

/** Normalize input to a stored numeric string (or "" if empty/invalid). */
export function normalizeMetricStorage(raw: string): string {
  const n = parseMetricInput(raw);
  if (n === null) return raw.trim() === "" ? "" : raw.trim();
  return String(n);
}

function formatCompactMetric(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return trimOneDecimal(v) + "m";
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return trimOneDecimal(v) + "k";
  }
  return String(Math.round(n));
}

function trimOneDecimal(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
