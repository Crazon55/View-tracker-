// ─────────────────────────────────────────────────────────────────────────────
// Seeding API service for FramerHome bento. Shares fixtures with seeding/client.
// Mock is OPT-IN via VITE_SEEDING_MOCK=true — production hits the real backend.
// ─────────────────────────────────────────────────────────────────────────────
import { getAccessToken } from "./api";
import { buildOverviewReport, MOCK_DEALS, type SeedingDeal } from "./seeding/mockData";

function resolveSeedingBase(): string {
  const explicit = import.meta.env.VITE_SEEDING_API as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const apiRoot =
    (import.meta.env.VITE_API_URL as string | undefined) ||
    (import.meta.env.VITE_BASE_API_URL as string | undefined) ||
    "";
  if (apiRoot) return `${apiRoot.replace(/\/$/, "")}/api/seeding`;
  return "/api/seeding";
}

const BASE = resolveSeedingBase();
const USE_MOCK = import.meta.env.VITE_SEEDING_MOCK === "true";

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
