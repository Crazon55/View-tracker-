/**
 * "Monthly wrap" — end-of-month recap (Spotify Wrapped–style) for the tracker.
 * Rollout: **5pm local** on the **1st** of each month, with **2nd–3rd** as full days (same 3-day window).
 * Report = **previous** calendar month (e.g. 1–3 Apr → March wrap).
 */

const TEAM_ORDER = ["garfields", "goofies"] as const;
export type TeamKey = (typeof TEAM_ORDER)[number];

const TEAM_META: Record<
  TeamKey,
  { label: string; emoji: string; members: string[]; nicheMatch: string[] }
> = {
  garfields: {
    label: "Garfields",
    emoji: "🐱",
    members: ["Deepak", "Kaavya", "Swati"],
    nicheMatch: ["garfields"],
  },
  goofies: {
    label: "Goofies",
    emoji: "🐶",
    members: ["Arohi", "Harish", "Pulkit"],
    nicheMatch: ["goofies"],
  },
};

const MS_PER_DAY = 86_400_000;
const TAB_RETENTION_DAYS = 3;

/** Local hour (0–23) when the wrap window opens on the 1st of each month (~5pm). */
export const ROLLOUT_START_HOUR = 17;

/**
 * When the *calendar* wrap first goes live: **May 1, 2026, 5pm in the user’s local timezone.**
 * Before this instant, `getActiveReportMonth` and the nav chip’s calendar logic stay inactive.
 * Dev/QA: use `?wrap=1` in development or `VITE_ALLOW_WRAP_TEST` + `?wrap=YYYY-MM` to preview.
 */
export const WRAP_FEATURE_LIVE_AT_MS = +new Date(2026, 4, 1, ROLLOUT_START_HOUR, 0, 0, 0);

/**
 * In-app copy: rollout window and nav chip. Shown on intro + outro.
 * (1st 5pm local through 3rd; chip 3 days after first open; schedule repeats monthly after go-live.)
 */
export const WRAP_ROLLOUT_EXPLAINER =
  "Each month: unlocks 5pm on the 1st (your time), open through the 3rd. The “wrap” chip can stay 3 days after you first open it.";

function isWrapCalendarLive(now: Date): boolean {
  return now.getTime() >= WRAP_FEATURE_LIVE_AT_MS;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * YYYY-MM for the report in the *calendar rollout* window (autoplay + tab chip), or null.
 * The report is always the **previous** calendar month. Window: **1st (from 5pm local)**
 * through **3rd** inclusive.
 */
export function getActiveReportMonth(now: Date = new Date()): string | null {
  if (!isWrapCalendarLive(now)) return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const h = now.getHours();

  if (d < 1 || d > 3) return null;
  if (d === 1 && h < ROLLOUT_START_HOUR) return null;

  const prev = new Date(y, m, 0);
  return `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
}

/**
 * **Local dev / QA only** (`import.meta.env.DEV`): open the real in-app wrap without waiting
 * for the 1st-of-month rollout.
 * - `?wrap=1` or `?wrap=true` → report month = **previous** calendar month (good default for data).
 * - `?wrap=2025-04` → that exact `YYYY-MM`.
 * Stripped from the URL after the modal opens (see `MonthlyWrapRoot`).
 * In production builds this always returns `null` unless you set `VITE_ALLOW_WRAP_TEST=true`.
 */
export function getTestWrapMonthFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const allow =
    import.meta.env.DEV || String(import.meta.env.VITE_ALLOW_WRAP_TEST || "").toLowerCase() === "true";
  if (!allow) return null;
  const w = new URLSearchParams(window.location.search).get("wrap");
  if (!w) return null;
  if (w === "1" || w === "true") {
    const d = new Date();
    d.setDate(0);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  if (/^\d{4}-\d{2}$/.test(w)) return w;
  return null;
}

export function monthLabel(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  if (!y || !mo) return ym;
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function wrapStateKey(userId: string, reportMonth: string) {
  return `fsboard-mwrap-v1:${userId}:${reportMonth}`;
}

export type MonthlyWrapUserState = {
  firstOpenedAt: number;
  autoModalShown: boolean;
  completed: boolean;
};

export function readWrapState(userId: string, reportMonth: string): MonthlyWrapUserState | null {
  try {
    const raw = localStorage.getItem(wrapStateKey(userId, reportMonth));
    if (!raw) return null;
    return JSON.parse(raw) as MonthlyWrapUserState;
  } catch {
    return null;
  }
}

export function writeWrapState(userId: string, reportMonth: string, patch: Partial<MonthlyWrapUserState>) {
  const prev = readWrapState(userId, reportMonth) || {
    firstOpenedAt: 0,
    autoModalShown: false,
    completed: false,
  };
  const next: MonthlyWrapUserState = { ...prev, ...patch };
  localStorage.setItem(wrapStateKey(userId, reportMonth), JSON.stringify(next));
}

export function isTabVisible(state: MonthlyWrapUserState | null, now: number = Date.now()): boolean {
  if (!state || state.completed) return false;
  if (!state.firstOpenedAt) return false;
  return now - state.firstOpenedAt < TAB_RETENTION_DAYS * MS_PER_DAY;
}

/** Which report month should the nav tab use (3-day window after first open), if any. */
export function findTabReportMonth(userId: string, now: Date = new Date()): string | null {
  if (!isWrapCalendarLive(now)) return null;
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const st = readWrapState(userId, ym);
    if (isTabVisible(st, now.getTime())) return ym;
  }
  return null;
}

export function shouldAutoOpenModal(
  inCalendarWindow: boolean,
  state: MonthlyWrapUserState | null,
): boolean {
  if (!inCalendarWindow) return false;
  if (state?.autoModalShown) return false;
  if (state?.completed) return false;
  return true;
}

function normCreator(raw: unknown): string {
  if (!raw) return "";
  return String(raw).trim();
}

/** YYYY-MM for a tracker posting `date` (ISO string, YYYY-MM-DD, or timestamp). */
function postingReportMonth(dateRaw: unknown): string | null {
  const s = String(dateRaw ?? "").trim();
  if (!s) return null;
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head.slice(0, 7);
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}`;
}

const PROVEN_STAGES = new Set(["proven_ideas", "scheduled", "posted", "uploaded"]);

export type MonthlyWrapPageRow = { pageId: string; handle: string; name: string; views: number };
export type MonthlyWrapData = {
  reportMonth: string;
  monthLabel: string;
  totalViews: number;
  topPage: MonthlyWrapPageRow | null;
  topPages: MonthlyWrapPageRow[];
  winningTeam: {
    key: TeamKey;
    label: string;
    emoji: string;
    members: string[];
    views: number;
  } | null;
  teamViews: Record<TeamKey, number>;
  individuals: {
    mostIdeasCreated: { name: string; count: number } | null;
    mostProven: { name: string; count: number } | null;
    mostKilled: { name: string; count: number } | null;
    /** Tracker posting rows dated in this month, by idea creator */
    mostPosts: { name: string; count: number } | null;
  };
};

/**
 * Build wrap payload from 6-day month payload + tracker ideas.
 * - Views: all entry views in `sixDayMonth.cycles` for that month.
 * - Ideas: filter by `created_at` / `updated_at` YYYY-MM vs report month.
 * - Posts: count `tracker_postings` rows whose `date` falls in the report month (per idea `created_by`).
 */
export function buildMonthlyWrapData(
  reportMonth: string, // "YYYY-MM"
  ideas: any[],
  niches: any[],
  sixDayMonth: any | null | undefined,
): MonthlyWrapData {
  const monthLabelOut = monthLabel(reportMonth);
  const nicheIdToTeam = new Map<string, TeamKey>();
  for (const n of niches || []) {
    const nid = n.id;
    const nm = String(n.name || "").toLowerCase();
    if (!nid) continue;
    for (const key of TEAM_ORDER) {
      if (TEAM_META[key].nicheMatch.some((sub) => nm.includes(sub))) {
        nicheIdToTeam.set(nid, key);
        break;
      }
    }
  }

  const teamAccounts: Record<TeamKey, Set<string>> = {
    garfields: new Set(),
    goofies: new Set(),
  };
  for (const n of niches || []) {
    const tid = nicheIdToTeam.get(n.id);
    if (!tid) continue;
    for (const h of n?.pages || []) {
      if (h) teamAccounts[tid].add(String(h).replace(/^@/, "").trim().toLowerCase());
    }
  }

  const pageIdToHandle = new Map<string, string>();
  const pageIdToName = new Map<string, string>();
  for (const p of sixDayMonth?.pages || []) {
    if (!p?.id) continue;
    const h = String(p.handle || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    pageIdToHandle.set(String(p.id), h);
    if (p.name) pageIdToName.set(String(p.id), String(p.name));
  }

  const handleToTeam = (h: string): TeamKey | null => {
    const handle = h.replace(/^@/, "").trim().toLowerCase();
    for (const k of TEAM_ORDER) {
      if (teamAccounts[k].has(handle)) return k;
    }
    return null;
  };

  const viewsByPage = new Map<string, number>();
  const teamViews: Record<TeamKey, number> = { garfields: 0, goofies: 0 };
  let totalViews = 0;

  for (const c of sixDayMonth?.cycles || []) {
    for (const e of c?.entries || []) {
      const pid = String(e?.page_id || "");
      const v = Number(e?.views || 0) || 0;
      if (!pid || v <= 0) continue;
      totalViews += v;
      viewsByPage.set(pid, (viewsByPage.get(pid) || 0) + v);
      const h = pageIdToHandle.get(pid) || "";
      const tk = h ? handleToTeam(h) : null;
      if (tk) teamViews[tk] += v;
    }
  }

  const pageRows: MonthlyWrapPageRow[] = Array.from(viewsByPage.entries())
    .map(([pageId, views]) => ({
      pageId,
      handle: pageIdToHandle.get(pageId) || "—",
      name: pageIdToName.get(pageId) || "",
      views,
    }))
    .filter((r) => r.views > 0)
    .sort((a, b) => b.views - a.views);

  const topPages = pageRows.slice(0, 5);
  const topPage = topPages[0] || null;

  let winningTeam: MonthlyWrapData["winningTeam"] = null;
  if (totalViews > 0 || pageRows.length) {
    const [a, b] = TEAM_ORDER;
    const wx: TeamKey = teamViews[b] > teamViews[a] ? b : a;
    const meta = TEAM_META[wx];
    winningTeam = {
      key: wx,
      label: meta.label,
      emoji: meta.emoji,
      members: [...meta.members],
      views: teamViews[wx],
    };
  }

  const created = new Map<string, number>();
  const proven = new Map<string, number>();
  const killed = new Map<string, number>();
  const postsByCreator = new Map<string, number>();

  for (const idea of ideas || []) {
    const creator = normCreator(idea?.created_by);
    const cAt = String(idea?.created_at || "").slice(0, 7);
    if (creator && cAt === reportMonth) {
      created.set(creator, (created.get(creator) || 0) + 1);
    }
    const uAt = String(idea?.updated_at || "").slice(0, 7);
    const st = String(idea?.stage || "").toLowerCase();
    if (creator && uAt === reportMonth) {
      if (PROVEN_STAGES.has(st)) {
        proven.set(creator, (proven.get(creator) || 0) + 1);
      }
      if (st === "kill") {
        killed.set(creator, (killed.get(creator) || 0) + 1);
      }
    }

    if (creator) {
      const postings = (idea as { tracker_postings?: { date?: unknown }[] }).tracker_postings || [];
      for (const p of postings) {
        if (postingReportMonth(p?.date) === reportMonth) {
          postsByCreator.set(creator, (postsByCreator.get(creator) || 0) + 1);
        }
      }
    }
  }

  const maxEntry = (m: Map<string, number>) => {
    if (!m.size) return null;
    let name = "";
    let count = 0;
    for (const [k, v] of m) {
      if (v > count) {
        count = v;
        name = k;
      }
    }
    return count > 0 ? { name, count } : null;
  };

  return {
    reportMonth,
    monthLabel: monthLabelOut,
    totalViews,
    topPage,
    topPages,
    winningTeam,
    teamViews,
    individuals: {
      mostIdeasCreated: maxEntry(created),
      mostProven: maxEntry(proven),
      mostKilled: maxEntry(killed),
      mostPosts: maxEntry(postsByCreator),
    },
  };
}

export function formatViewsShort(n: number | undefined | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return `${v}`;
}

export { TEAM_META, TEAM_ORDER };
