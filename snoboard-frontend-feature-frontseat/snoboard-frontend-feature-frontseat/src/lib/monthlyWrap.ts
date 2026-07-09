/**
 * Monthly wrap — end-of-month recap (Spotify Wrapped-style) for the tracker.
 * Rollout: **5:00pm IST (Asia/Kolkata)** on the **1st** of each month, with **2nd–3rd** full days in IST
 * (3 calendar days in that zone). Report = **previous** calendar month in IST.
 */

import { lookupPerson, normalizeName, PEOPLE_SEED } from "./peopleSeed";

const TEAM_ORDER = ["garfields", "goofies", "sheruses"] as const;
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
  sheruses: {
    label: "The Sherus",
    emoji: "🦁",
    members: ["Sugam", "Nitesh"],
    nicheMatch: ["sheruses"],
  },
};

const MS_PER_DAY = 86_400_000;
const TAB_RETENTION_DAYS = 3;

/** Hour (0–23) in IST when the window opens on the 1st (5:00pm IST). */
export const ROLLOUT_START_HOUR = 17;

/** All rollout calendar logic uses this zone (5pm 1st = 5pm here). */
export const ROLLOUT_TIMEZONE = "Asia/Kolkata" as const;

/**
 * When the *calendar* wrap first goes live: **May 1, 2026, 5:00pm IST.**
 * Before this instant, `getActiveReportMonth` and the nav chip's calendar logic stay inactive.
 * Dev/QA: use `?wrap=1` in development or `VITE_ALLOW_WRAP_TEST` + `?wrap=YYYY-MM` to preview.
 */
export const WRAP_FEATURE_LIVE_AT_MS = +new Date("2026-05-01T17:00:00+05:30");

/**
 * Report months (`YYYY-MM`) with no official wrap — e.g. no tracker activity that month.
 * Suppresses banner, nav chip, autoload, and `/wrap?month=…` for these months.
 */
export const SKIPPED_WRAP_MONTHS: readonly string[] = ["2026-06"];

export function isWrapMonthSkipped(reportMonth: string | null | undefined): boolean {
  if (!reportMonth) return false;
  return SKIPPED_WRAP_MONTHS.includes(reportMonth);
}

/**
 * In-app copy: rollout window and nav chip. Shown on intro + outro.
 * (1st 5pm IST through 3rd; chip 3 days after first open; repeats monthly after go-live.)
 */
export const WRAP_ROLLOUT_EXPLAINER =
  "Each month: the full recap unlocks 5pm IST on the 1st (for the previous month) and stays easy to find on the dashboard through the 3rd.";

/** Wrap UI is always available for signed-in users. */
export function isWrapFeatureAvailable(_now: Date = new Date()): boolean {
  return true;
}

/** Calendar autoplay / official window (after first go-live). */
function isWrapCalendarLive(now: Date): boolean {
  return now.getTime() >= WRAP_FEATURE_LIVE_AT_MS;
}

/** True during the official drop window (1st 5pm IST – 3rd). */
export function isOfficialWrapWindow(now: Date = new Date()): boolean {
  return getActiveReportMonth(now) !== null;
}

/** Calendar Y/M/D and hour in `ROLLOUT_TIMEZONE` (IST), `month` 1–12, `hour` 0–23. */
export function getZonedRolloutCalendarParts(d: Date = new Date()): { y: number; m: number; d: number; h: number } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROLLOUT_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const x of f.formatToParts(d)) {
    if (x.type !== "literal") parts[x.type] = x.value;
  }
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * YYYY-MM for the report in the *calendar rollout* window (autoplay + tab chip), or null.
 * The report is always the **previous** calendar month in IST. Window: **1st from 5pm IST**
 * through **3rd** (IST) inclusive.
 */
export function getActiveReportMonth(now: Date = new Date()): string | null {
  if (!isWrapCalendarLive(now)) return null;
  const { y, m, d, h } = getZonedRolloutCalendarParts(now);

  if (d < 1 || d > 3) return null;
  if (d === 1 && h < ROLLOUT_START_HOUR) return null;

  let pr = m - 1;
  let py = y;
  if (pr < 1) {
    pr = 12;
    py -= 1;
  }
  const ym = `${py}-${pad2(pr)}`;
  return isWrapMonthSkipped(ym) ? null : ym;
}

/**
 * Resolve `?wrap=` query values to a report month (`YYYY-MM`).
 * - `?wrap=now` / `?wrap=current` → **this** calendar month (IST)
 * - `?wrap=1` / `?wrap=true` → **previous** calendar month (official rollout default)
 * - `?wrap=2026-05` → that exact month
 */
function resolveWrapParam(w: string): string | null {
  if (w === "1" || w === "true") {
    const d = new Date();
    d.setDate(0);
    const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    return isWrapMonthSkipped(ym) ? null : ym;
  }
  if (w === "now" || w === "current") {
    const { y, m } = getZonedRolloutCalendarParts();
    const ym = `${y}-${pad2(m)}`;
    return isWrapMonthSkipped(ym) ? null : ym;
  }
  if (/^\d{4}-\d{2}$/.test(w)) {
    const ym = w;
    return isWrapMonthSkipped(ym) ? null : ym;
  }
  return null;
}

const WRAP_PENDING_KEY = "fsboard-wrap-pending";

/** Call on app boot (before auth) so Google OAuth does not drop `?wrap=`. */
export function stashWrapMonthFromUrl(): void {
  if (typeof window === "undefined") return;
  const w = new URLSearchParams(window.location.search).get("wrap");
  if (!w) return;
  const resolved = resolveWrapParam(w);
  if (!resolved) return;
  try {
    sessionStorage.setItem(WRAP_PENDING_KEY, resolved);
  } catch {
    /* ignore */
  }
}

function consumePendingWrapMonth(): string | null {
  try {
    const raw = sessionStorage.getItem(WRAP_PENDING_KEY);
    if (raw) sessionStorage.removeItem(WRAP_PENDING_KEY);
    return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Read stashed wrap month without removing (OAuth return may need multiple reads). */
export function peekPendingWrapMonth(): string | null {
  try {
    const raw = sessionStorage.getItem(WRAP_PENDING_KEY);
    return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearPendingWrapMonth(): void {
  try {
    sessionStorage.removeItem(WRAP_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Manual wrap open from URL or stashed pre-login intent. */
export function getWrapMonthFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const w = new URLSearchParams(window.location.search).get("wrap");
  if (w) {
    const resolved = resolveWrapParam(w);
    if (resolved) return resolved;
  }
  return peekPendingWrapMonth();
}

/** @deprecated use getWrapMonthFromUrl */
export function getTestWrapMonthFromUrl(): string | null {
  return getWrapMonthFromUrl();
}

/** Current calendar month in IST as `YYYY-MM`. */
export function getCurrentCalendarMonth(now: Date = new Date()): string {
  const { y, m } = getZonedRolloutCalendarParts(now);
  return `${y}-${pad2(m)}`;
}

/** Default month for banner/chip: official month in the 1st–3rd window, else live preview of this month. */
export function getDefaultWrapMonth(now: Date = new Date()): string | null {
  const official = getActiveReportMonth(now);
  if (official) return official;
  const current = getCurrentCalendarMonth(now);
  return isWrapMonthSkipped(current) ? null : current;
}

/** Human hint for the next official drop (for preview banner copy). */
export function getNextOfficialWrapHint(now: Date = new Date()): string {
  const { y, m } = getZonedRolloutCalendarParts(now);
  const recapName = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long" });
  let dropM = m + 1;
  let dropY = y;
  if (dropM > 12) {
    dropM = 1;
    dropY += 1;
  }
  const dropName = new Date(dropY, dropM - 1, 1).toLocaleString(undefined, { month: "long" });
  return `Full ${recapName} recap drops ${dropName} 1, 5pm IST`;
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

/** Canonical display name for a tracker actor (merges aliases / email local-parts). */
function resolvePersonName(raw: unknown): string {
  const n = normalizeName(String(raw ?? ""));
  if (!n) return "";
  return lookupPerson(n)?.name || n;
}

function normHandle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

/** YYYY-MM in IST for timestamps / ISO strings. */
function isoMonthInTimezone(raw: unknown, tz: string = ROLLOUT_TIMEZONE): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const head = s.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(head) && s.length <= 7) return head;
  const headDate = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(headDate) && !s.includes("T")) return headDate.slice(0, 7);
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(t);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return y && m ? `${y}-${m}` : null;
}

/** YYYY-MM for a tracker posting `date` (ISO string, YYYY-MM-DD, or timestamp). */
function postingReportMonth(dateRaw: unknown): string | null {
  return isoMonthInTimezone(dateRaw);
}

function viewsFromPageSummary(summary: any): number {
  const cvs = Number(summary?.cycle_views_sum ?? 0);
  return Number.isNaN(cvs) ? 0 : cvs;
}

function buildPageOwnerByHandle(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PEOPLE_SEED) {
    for (const h of p.pages || []) {
      const key = normHandle(h);
      if (key) out[key] = p.name;
    }
  }
  return out;
}

const SHIPPED_STAGES = new Set(["proven_ideas", "scheduled", "posted", "uploaded", "batch_production"]);

export type WrapSlideKind =
  | "intro"
  | "total"
  | "topPage"
  | "top5"
  | "team"
  | "created"
  | "proven"
  | "killed"
  | "posts"
  | "reels"
  | "topReel"
  | "personStatsGarfields"
  | "personStatsGoofies"
  | "personStatsSherus"
  | "outro";

/** Only slides with real data — avoids empty "No data for this stat" cards. */
export function getWrapSlidePlan(data: MonthlyWrapData): WrapSlideKind[] {
  const slides: WrapSlideKind[] = ["intro"];
  if (data.totalViews > 0) slides.push("total");
  if (data.topPage) slides.push("topPage");
  if (data.topPages.length > 0) slides.push("top5");
  if (data.winningTeam && data.winningTeam.views > 0) slides.push("team");
  if (data.individuals.mostIdeasCreated) slides.push("created");
  if (data.individuals.mostProven) slides.push("proven");
  if (data.individuals.mostKilled) slides.push("killed");
  if (data.individuals.mostPosts) slides.push("posts");
  if (data.individuals.mostReels) slides.push("reels");
  if (data.topReelPage) slides.push("topReel");
  if (data.personStats.some(p => p.team === "garfields")) slides.push("personStatsGarfields");
  if (data.personStats.some(p => p.team === "goofies")) slides.push("personStatsGoofies");
  // Sherus slide omitted — shown only when they have page data
  slides.push("outro");
  return slides;
}

export type MonthlyWrapPageRow = { pageId: string; handle: string; name: string; views: number };

export type PersonStat = {
  name: string;
  emoji?: string;
  team: TeamKey;
  ideasCreated: number;
  posts: number;
  proven: number;
  killed: number;
};

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
    mostPosts: { name: string; count: number } | null;
    mostReels: { name: string; count: number } | null;
  };
  topReelPage: MonthlyWrapPageRow | null;
  personStats: PersonStat[];
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
  const pageOwnerByHandle = buildPageOwnerByHandle();

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
    sheruses: new Set(),
  };
  for (const n of niches || []) {
    const tid = nicheIdToTeam.get(n.id);
    if (!tid) continue;
    for (const h of n?.pages || []) {
      if (h) teamAccounts[tid].add(normHandle(h));
    }
  }

  const pageIdToHandle = new Map<string, string>();
  const pageIdToName = new Map<string, string>();
  const handleToPageId = new Map<string, string>();
  for (const p of sixDayMonth?.pages || []) {
    if (!p?.id) continue;
    const h = normHandle(p.handle);
    pageIdToHandle.set(String(p.id), h);
    handleToPageId.set(h, String(p.id));
    if (p.name) pageIdToName.set(String(p.id), String(p.name));
  }
  for (const s of sixDayMonth?.page_summaries || []) {
    const pid = String(s?.page_id || "");
    if (!pid) continue;
    const h = normHandle(s.handle);
    if (h && !pageIdToHandle.has(pid)) pageIdToHandle.set(pid, h);
    if (h) handleToPageId.set(h, pid);
    if (s.name) pageIdToName.set(pid, String(s.name));
  }

  const handleToTeam = (h: string): TeamKey | null => {
    const handle = normHandle(h);
    for (const k of TEAM_ORDER) {
      if (teamAccounts[k].has(handle)) return k;
    }
    return null;
  };

  const viewsByPage = new Map<string, number>();
  const teamViews: Record<TeamKey, number> = { garfields: 0, goofies: 0, sheruses: 0 };
  let totalViews = 0;

  const addPageViews = (pageId: string, handle: string, v: number) => {
    if (!pageId || v <= 0) return;
    totalViews += v;
    viewsByPage.set(pageId, (viewsByPage.get(pageId) || 0) + v);
    const tk = handle ? handleToTeam(handle) : null;
    if (tk) teamViews[tk] += v;
  };

  // Prefer page_summaries (same source as Dashboard / 6-Day Tracker).
  const summaries = sixDayMonth?.page_summaries || [];
  if (summaries.length > 0) {
    for (const s of summaries) {
      const pid = String(s?.page_id || "");
      const h = normHandle(s?.handle) || pageIdToHandle.get(pid) || "";
      addPageViews(pid, h, viewsFromPageSummary(s));
    }
  } else {
    for (const c of sixDayMonth?.cycles || []) {
      for (const e of c?.entries || []) {
        const pid = String(e?.page_id || "");
        const v = Number(e?.views || 0) || 0;
        const h = pageIdToHandle.get(pid) || "";
        addPageViews(pid, h, v);
      }
    }
  }

  // Fallback: tracker posting views for the report month (when six-day month is empty).
  if (totalViews === 0) {
    const byHandle = new Map<string, number>();
    for (const idea of ideas || []) {
      for (const p of (idea as { tracker_postings?: any[] }).tracker_postings || []) {
        if (postingReportMonth(p?.date) !== reportMonth) continue;
        const v = Number(p?.views || 0) || 0;
        if (v <= 0) continue;
        const h = normHandle(p?.page);
        if (!h) continue;
        byHandle.set(h, (byHandle.get(h) || 0) + v);
      }
    }
    for (const [h, v] of byHandle) {
      const pid = handleToPageId.get(h) || `handle:${h}`;
      if (!pageIdToHandle.has(pid)) pageIdToHandle.set(pid, h);
      addPageViews(pid, h, v);
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
  const totalTeamViews = TEAM_ORDER.reduce((s, k) => s + teamViews[k], 0);
  if (totalTeamViews > 0) {
    const wx = TEAM_ORDER.reduce((best, k) => teamViews[k] > teamViews[best] ? k : best, TEAM_ORDER[0]);
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
  const provenIdeas = new Map<string, Set<string>>();
  const killed = new Map<string, number>();
  const postsByCreator = new Map<string, number>();

  for (const idea of ideas || []) {
    const creator = resolvePersonName(idea?.created_by);
    const ideaId = String(idea?.id || "");
    const cMonth = isoMonthInTimezone(idea?.created_at);
    if (creator && cMonth === reportMonth) {
      created.set(creator, (created.get(creator) || 0) + 1);
    }

    const st = String(idea?.stage || "").toLowerCase();
    const uMonth = isoMonthInTimezone(idea?.updated_at);
    if (creator && uMonth === reportMonth && (st === "kill" || st === "killed")) {
      killed.set(creator, (killed.get(creator) || 0) + 1);
    }

    if (creator && uMonth === reportMonth && SHIPPED_STAGES.has(st)) {
      if (!provenIdeas.has(creator)) provenIdeas.set(creator, new Set());
      if (ideaId) provenIdeas.get(creator)!.add(ideaId);
    }

    const postings = (idea as { tracker_postings?: { date?: unknown; page?: unknown }[] }).tracker_postings || [];
    for (const p of postings) {
      if (postingReportMonth(p?.date) !== reportMonth) continue;
      const pageHandle = normHandle(p?.page);
      const attributed = resolvePersonName(pageOwnerByHandle[pageHandle] || creator);
      if (attributed) {
        postsByCreator.set(attributed, (postsByCreator.get(attributed) || 0) + 1);
      }
      if (creator && ideaId) {
        if (!provenIdeas.has(creator)) provenIdeas.set(creator, new Set());
        provenIdeas.get(creator)!.add(ideaId);
      }
    }
  }

  const proven = new Map<string, number>();
  for (const [name, ids] of provenIdeas) {
    if (ids.size > 0) proven.set(name, ids.size);
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

  // Reel views per page from six-day cycle entries (reel_pct gives reel fraction)
  const reelViewsByPage = new Map<string, number>();
  for (const c of sixDayMonth?.cycles || []) {
    for (const e of c?.entries || []) {
      const pid = String(e?.page_id || "");
      const v = Number(e?.views || 0);
      const rp = Number(e?.reel_pct ?? 0) / 100;
      if (v > 0 && rp > 0) {
        reelViewsByPage.set(pid, (reelViewsByPage.get(pid) || 0) + Math.round(v * rp));
      }
    }
  }
  const topReelPage = Array.from(reelViewsByPage.entries())
    .map(([pid, views]) => ({
      pageId: pid,
      handle: pageIdToHandle.get(pid) || "—",
      name: pageIdToName.get(pid) || "",
      views,
    }))
    .filter(r => r.views > 0)
    .sort((a, b) => b.views - a.views)[0] ?? null;

  // Most reels: person whose ideas had the most postings in "uploaded" stage (reel uploads)
  const reelsByCreator = new Map<string, number>();
  for (const idea of ideas || []) {
    const creator = resolvePersonName(idea?.created_by);
    const st = String(idea?.stage || "").toLowerCase();
    const uMonth = isoMonthInTimezone(idea?.updated_at);
    if (creator && uMonth === reportMonth && st === "uploaded") {
      reelsByCreator.set(creator, (reelsByCreator.get(creator) || 0) + 1);
    }
  }

  const personStats: PersonStat[] = PEOPLE_SEED
    .filter(p => p.niche === "garfields" || p.niche === "goofies" || p.niche === "sheruses")
    .map(p => ({
      name: p.name,
      emoji: p.emoji,
      team: p.niche as TeamKey,
      ideasCreated: created.get(p.name) ?? 0,
      posts: postsByCreator.get(p.name) ?? 0,
      proven: proven.get(p.name) ?? 0,
      killed: killed.get(p.name) ?? 0,
    }));

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
      mostReels: maxEntry(reelsByCreator),
    },
    topReelPage,
    personStats,
  };
}

export function formatViewsShort(n: number | undefined | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return `${v}`;
}

export { TEAM_META, TEAM_ORDER };
