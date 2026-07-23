// ─────────────────────────────────────────────────────────────────────────────
// Seeding API service for FramerHome bento.
// Same-origin /api/seeding. Mock fixtures only when VITE_SEEDING_MOCK=true.
// On live failure return empty/zeroed data (never silent fixture swap).
// ─────────────────────────────────────────────────────────────────────────────
import { getAccessToken } from "./api";
import { buildOverviewReport, MOCK_DEALS, type SeedingDeal } from "./seeding/mockData";

const BASE = ((import.meta.env.VITE_SEEDING_API as string | undefined)?.trim() || "/api/seeding").replace(/\/$/, "");
const FORCE_MOCK = import.meta.env.VITE_SEEDING_MOCK === "true";

export type Deal = SeedingDeal;
export type Overview = ReturnType<typeof buildOverviewReport>;

const MOCK_OVERVIEW = buildOverviewReport();

/** Zeroed overview — used when live API fails (not mock fixtures). */
const EMPTY_OVERVIEW: Overview = {
  ...MOCK_OVERVIEW,
  revenue_closed: 0,
  collected: 0,
  outstanding: 0,
  collection_pct: 0,
  deals_approved: 0,
  deals_submitted_pending: 0,
  payment_pending_count: 0,
  deals_completed: 0,
  total_views: 0,
  blocked_deliverables: 0,
  deals_needs_info: 0,
  revenue_over_time: [],
  team_revenue: [],
  team_views: [],
  team_payments: [],
  revenue_by_team: [],
  pipeline: [],
};

async function get<T>(path: string, mockFallback: T, emptyFallback: T): Promise<T> {
  if (FORCE_MOCK) return mockFallback;
  try {
    const token = getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } catch {
    return emptyFallback;
  }
}

export const getOverview = () => get<Overview>("/reports/overview", MOCK_OVERVIEW, EMPTY_OVERVIEW);
export const getDeals = () => get<Deal[]>("/deals", MOCK_DEALS, []);

export const fmtINR = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString("en-IN")}`;
