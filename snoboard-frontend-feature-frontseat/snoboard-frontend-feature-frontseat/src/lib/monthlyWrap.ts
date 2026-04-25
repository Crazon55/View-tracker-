/**
 * "Monthly wrap" — end-of-month recap (Spotify Wrapped–style) for the tracker.
 * Reveal window: last calendar day of month M, plus 1st and 2nd of M+1 (3 days).
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM for the month that has an active *reveal calendar window* today, or null. */
export function getActiveReportMonth(now: Date = new Date()): string | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const lastDayThisMonth = new Date(y, m + 1, 0).getDate();

  if (d === lastDayThisMonth) {
    return `${y}-${pad2(m + 1)}`;
  }
  if (d === 1 || d === 2) {
    const prev = new Date(y, m, 0);
    return `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
  }
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
  };
};

/**
 * Build wrap payload from 6-day month payload + tracker ideas.
 * - Views: all entry views in `sixDayMonth.cycles` for that month.
 * - Ideas: filter by `created_at` / `updated_at` YYYY-MM vs report month.
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
