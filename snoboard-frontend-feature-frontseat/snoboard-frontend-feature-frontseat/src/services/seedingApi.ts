// ─────────────────────────────────────────────────────────────────────────────
// Seeding API service for FramerHome bento.
// Same-origin /api/seeding. Mock fixtures only when VITE_SEEDING_MOCK=true.
// On live failure return empty/zeroed data (never silent fixture swap).
// ─────────────────────────────────────────────────────────────────────────────
import { getAccessToken } from "./api";
import { overviewRangeParams } from "./seeding/constants";
import { buildOverviewReport, MOCK_DEALS, type SeedingDeal } from "./seeding/mockData";

const BASE = ((import.meta.env.VITE_SEEDING_API as string | undefined)?.trim() || "/api/seeding").replace(/\/$/, "");
const FORCE_MOCK = import.meta.env.VITE_SEEDING_MOCK === "true";

export type Deal = SeedingDeal;
export type Overview = ReturnType<typeof buildOverviewReport>;

const overviewParams = () => overviewRangeParams();

/** Zeroed overview — used when live API fails (not mock fixtures). */
const EMPTY_OVERVIEW: Overview = {
  ...buildOverviewReport(),
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

function normalizeOverview(raw: Record<string, unknown>, params: Record<string, string>): Overview {
  const revenueClosed = Number(raw.revenue_closed) || 0;
  const collected = Number(raw.collected) || 0;
  const teamRevenue = Array.isArray(raw.team_revenue) ? raw.team_revenue : [];
  return {
    ...buildOverviewReport(params),
    ...raw,
    revenue_closed: revenueClosed,
    collected,
    outstanding: Number(raw.outstanding) || Math.max(0, revenueClosed - collected),
    collection_pct: revenueClosed
      ? Math.round((collected / revenueClosed) * 100)
      : 0,
    revenue_by_team: Array.isArray(raw.revenue_by_team)
      ? (raw.revenue_by_team as Overview["revenue_by_team"])
      : teamRevenue.map((t: { team_name?: string; revenue?: number }) => ({
          team: String(t.team_name ?? ""),
          value: Number(t.revenue) || 0,
        })),
  };
}

export const getOverview = async () => {
  const params = overviewParams();
  const qs = new URLSearchParams(params).toString();
  if (FORCE_MOCK) return buildOverviewReport(params);
  try {
    const token = getAccessToken();
    const res = await fetch(`${BASE}/reports/overview?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return normalizeOverview((await res.json()) as Record<string, unknown>, params);
  } catch {
    return EMPTY_OVERVIEW;
  }
};
export const getDeals = () => get<Deal[]>("/deals", MOCK_DEALS, []);

export const fmtINR = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString("en-IN")}`;
