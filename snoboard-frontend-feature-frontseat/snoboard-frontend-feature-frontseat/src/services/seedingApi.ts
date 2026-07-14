// ─────────────────────────────────────────────────────────────────────────────
// Seeding API service for FramerHome bento. Shares mock fixtures with seeding/client.
// Set VITE_SEEDING_MOCK=false once the merged backend is live.
// ─────────────────────────────────────────────────────────────────────────────
import { getAccessToken } from "./api";
import { buildOverviewReport, MOCK_DEALS, type SeedingDeal } from "./seeding/mockData";

const BASE = (import.meta.env.VITE_SEEDING_API as string) || "/api/seeding";
const USE_MOCK = (import.meta.env.VITE_SEEDING_MOCK ?? "true") === "true";

async function get<T>(path: string, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    const token = getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export type Deal = SeedingDeal;
export type Overview = ReturnType<typeof buildOverviewReport>;

const MOCK_OVERVIEW = buildOverviewReport();

export const getOverview = () => get<Overview>("/reports/overview", MOCK_OVERVIEW);
export const getDeals = () => get<Deal[]>("/deals", MOCK_DEALS);

export const fmtINR = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString("en-IN")}`;
