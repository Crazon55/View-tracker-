/** Lightweight localStorage cache for home dashboard queries (stale-while-revalidate). */

const PREFIX = "vt-home-cache:";
const MAX_AGE_MS = 24 * 60 * 60_000; // keep for 24h; React Query still refetches when stale

type CacheEnvelope<T> = { ts: number; data: T };

export function readHomeCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.ts !== "number") return undefined;
    if (Date.now() - parsed.ts > MAX_AGE_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function writeHomeCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // quota / private mode — ignore
  }
}
