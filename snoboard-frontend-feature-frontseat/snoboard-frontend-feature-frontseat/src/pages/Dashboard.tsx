import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, getAutoReels, getManualReels, getPosts, getSixDayMonth } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { addDaysISO } from "@/lib/workboardTypes";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

type BreakdownMode = "reels" | "views";
type TimePeriod = "all" | "monthly" | "custom";

const TRACKER_MONTH_KEY = "fs-dashboard-tracker-ym";

function readTrackerMonthFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TRACKER_MONTH_KEY) || "";
  } catch {
    return "";
  }
}

type SixDayTrackerWeek = { weekNum: number; start: string; end: string };

function daysInclusive(fromIso: string, toIso: string): number {
  const d1 = new Date(fromIso.slice(0, 10) + "T12:00:00").getTime();
  const d2 = new Date(toIso.slice(0, 10) + "T12:00:00").getTime();
  if (!isFinite(d1) || !isFinite(d2) || d2 < d1) return 0;
  return Math.round((d2 - d1) / 86400000) + 1;
}

/** Split [from, to] into consecutive 6-day blocks (inclusive): Week 1 = days 1–6, Week 2 = 7–12, … Last block may be shorter. */
function partitionRangeIntoSixDayWeeks(fromIso: string, toIso: string): SixDayTrackerWeek[] {
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  if (!from || !to || from > to) return [];
  const weeks: SixDayTrackerWeek[] = [];
  let cur = from;
  let weekNum = 1;
  while (cur <= to) {
    const segEnd = addDaysISO(cur, 5);
    const end = segEnd <= to ? segEnd : to;
    weeks.push({ weekNum, start: cur, end });
    cur = addDaysISO(end, 1);
    weekNum++;
    if (weekNum > 200) break;
  }
  return weeks;
}

/** Normalize month input (YYYY-MM, YYYY-M, YYYY-MM-DD) so parsing never silently fails. */
function normalizeTrackerMonth(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(t.slice(0, 7))) return t.slice(0, 7);
  const m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const mo = Math.min(12, Math.max(1, parseInt(m[2], 10)));
    return `${m[1]}-${String(mo).padStart(2, "0")}`;
  }
  return "";
}

/** `ym` = YYYY-MM from `<input type="month" />` → first/last calendar day. */
function monthRangeFromYYYYMM(ym: string): { from: string; to: string } | null {
  const s = normalizeTrackerMonth(ym);
  if (s.length < 7) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(5, 7), 10) - 1;
  if (!y || isNaN(mo) || mo < 0 || mo > 11) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(mo + 1)}-01`;
  const lastD = new Date(y, mo + 1, 0).getDate();
  const to = `${y}-${pad(mo + 1)}-${pad(lastD)}`;
  return { from, to };
}

function fmtShortRange(startIso: string, endIso: string): string {
  const o = { month: "short", day: "numeric" } as const;
  const a = new Date(startIso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", o);
  const b = new Date(endIso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", o);
  return `${a} – ${b}`;
}

function normIgHandle(h: unknown): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/_/g, "");
}

function growthRowMatchesPage(row: Record<string, unknown>, page: any): boolean {
  const pid = String(page.id ?? "");
  const rpid = String(row.page_id ?? (row as any).pageId ?? "");
  if (rpid && pid && rpid === pid) return true;
  const ph = normIgHandle(page.handle);
  const rh = normIgHandle(row.handle);
  if (!rh || rh === "total") return false;
  return ph === rh;
}

/** Allocate monthly growth totals by calendar days overlapping [rangeFrom, rangeTo] (fixes partial months vs summing full months). */
function sumGrowthProratedForPageInRange(
  page: any,
  rangeFrom: string,
  rangeTo: string,
  growthRows: unknown[],
): number {
  const rf = rangeFrom.slice(0, 10);
  const rt = rangeTo.slice(0, 10);
  if (!rf || !rt || rf > rt) return 0;

  let total = 0;
  for (const row of growthRows) {
    const r = row as Record<string, unknown>;
    if (!growthRowMatchesPage(r, page)) continue;
    const rawMonth = String(r.month || "");
    const y = parseInt(rawMonth.slice(0, 4), 10);
    const mo = parseInt(rawMonth.slice(5, 7), 10) - 1;
    if (!y || isNaN(mo) || mo < 0 || mo > 11) continue;

    const pad = (n: number) => String(n).padStart(2, "0");
    const monthStart = `${y}-${pad(mo + 1)}-01`;
    const lastD = new Date(y, mo + 1, 0).getDate();
    const monthEnd = `${y}-${pad(mo + 1)}-${pad(lastD)}`;
    const overlapStart = rf > monthStart ? rf : monthStart;
    const overlapEnd = rt < monthEnd ? rt : monthEnd;
    if (overlapStart > overlapEnd) continue;

    const monthViews = Number(r.views) || 0;
    const overlapDays = daysInclusive(overlapStart, overlapEnd);
    if (overlapDays <= 0 || lastD <= 0) continue;
    total += monthViews * (overlapDays / lastD);
  }
  return Math.round(total);
}

/** If proration under-counts, use a single growth row for that calendar month. */
function growthExactMonthRowTotal(page: any, monthPrefix: string, growthRows: unknown[]): number {
  const ym = monthPrefix.slice(0, 7);
  for (const row of growthRows) {
    const r = row as Record<string, unknown>;
    if (!growthRowMatchesPage(r, page)) continue;
    if (String(r.month || "").slice(0, 7) !== ym) continue;
    return Number(r.views) || 0;
  }
  return 0;
}

function getLinearViewsForPageInRange(
  page: any,
  from: string,
  to: string,
  allReels: any[],
  allPosts: any[],
): number {
  const pid = String(page.id ?? "");
  const pageReels = allReels.filter((r: any) => String(r.page_id ?? "") === pid);
  const pagePosts = allPosts.filter((p: any) => String(p.page_id ?? "") === pid);
  const filteredReels = pageReels.filter((r: any) => {
    const d = (r.posted_at || "")?.slice(0, 10);
    return d && d >= from && d <= to;
  });
  const filteredPosts = pagePosts.filter((p: any) => {
    const d = (p.posted_at || p.created_at || "")?.slice(0, 10);
    return d && d >= from && d <= to;
  });
  return (
    filteredReels.reduce((s: number, r: any) => s + (r.views ?? 0), 0) +
    filteredPosts.reduce((s: number, p: any) => s + (p.actual_views ?? 0), 0)
  );
}

type TrackerViewOpts = {
  dashboardMonthYm: string;
  trackerMonthYm: string;
  isFullCalendarMonth: boolean;
};

/** Per–date-range views: reel/post sums; growth (by page id + handle); dashboard month total when API month matches. */
function getCustomRangeViewsForPage(
  page: any,
  from: string,
  to: string,
  allReels: any[],
  allPosts: any[],
  growthRows: unknown[],
  opts?: TrackerViewOpts,
): number {
  const linear = getLinearViewsForPageInRange(page, from, to, allReels, allPosts);
  if (linear > 0) return linear;
  if (growthRows.length > 0) {
    const g = sumGrowthProratedForPageInRange(page, from, to, growthRows);
    if (g > 0) return g;
    if (from.slice(0, 7) === to.slice(0, 7)) {
      const exact = growthExactMonthRowTotal(page, from, growthRows);
      if (exact > 0) return exact;
    }
  }
  if (
    opts?.isFullCalendarMonth &&
    opts.dashboardMonthYm &&
    opts.trackerMonthYm &&
    opts.dashboardMonthYm === opts.trackerMonthYm
  ) {
    return Number(page.total_views) || 0;
  }
  return 0;
}

function splitMonthTotalAcrossWeeks(
  monthTotal: number,
  weeks: SixDayTrackerWeek[],
  monthFrom: string,
  monthTo: string,
): number[] {
  const dim = daysInclusive(monthFrom, monthTo);
  if (dim <= 0 || weeks.length === 0) return weeks.map(() => 0);
  const raw = weeks.map((w) => monthTotal * (daysInclusive(w.start, w.end) / dim));
  const rounded = raw.map((x) => Math.round(x));
  let drift = monthTotal - rounded.reduce((a, b) => a + b, 0);
  if (drift !== 0 && rounded.length) rounded[rounded.length - 1] += drift;
  return rounded;
}

function getSixDayTrackerBreakdownForPage(
  page: any,
  weeks: SixDayTrackerWeek[],
  allReels: any[],
  allPosts: any[],
  growthRows: unknown[],
  opts: TrackerViewOpts | undefined,
  monthFrom: string,
  monthTo: string,
): { weekNum: number; start: string; end: string; rangeLabel: string; views: number }[] {
  const rows = weeks.map((w) => ({
    weekNum: w.weekNum,
    start: w.start,
    end: w.end,
    rangeLabel: fmtShortRange(w.start, w.end),
    views: getCustomRangeViewsForPage(page, w.start, w.end, allReels, allPosts, growthRows, opts),
  }));
  const sumW = rows.reduce((s, r) => s + r.views, 0);
  if (sumW > 0) return rows;

  const monthTotal = getCustomRangeViewsForPage(page, monthFrom, monthTo, allReels, allPosts, growthRows, opts);
  if (monthTotal <= 0) return rows;

  const splits = splitMonthTotalAcrossWeeks(monthTotal, weeks, monthFrom, monthTo);
  return weeks.map((w, i) => ({
    weekNum: w.weekNum,
    start: w.start,
    end: w.end,
    rangeLabel: fmtShortRange(w.start, w.end),
    views: splits[i] ?? 0,
  }));
}

function TogglePill({ options, value, onChange }: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
          className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${
            value === opt.value
              ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function softWrapIdText(s: unknown): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  // Add soft wrap opportunities at separators so long handles/domains don't overflow
  // but also don't split in the middle of words.
  return t.replace(/[._-]/g, (m) => `${m}\u200B`);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("reels");
  const [rightCardView] = useState<"donut" | "pages">("pages");
  const [globalPeriod, setGlobalPeriod] = useState<TimePeriod>("monthly");
  /** YYYY-MM for 6-day tracker; range is always the full selected calendar month. */
  const [trackerMonth, setTrackerMonth] = useState(() => normalizeTrackerMonth(readTrackerMonthFromStorage()));
  const [ipFilter, setIpFilter] = useState<"all" | "main" | "stage1">("all");

  // Stage-based filtering (stage 3 = main/stage3, stage 1 = stage1)

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  // Fetch all reels + posts for charts and custom date filtering
  const { data: autoReels = [] } = useQuery({ queryKey: ["reels", "auto"], queryFn: getAutoReels });
  const { data: manualReels = [] } = useQuery({ queryKey: ["reels", "manual"], queryFn: getManualReels });
  const { data: allPosts = [] } = useQuery({ queryKey: ["posts"], queryFn: getPosts });

  const allReels = [...autoReels, ...manualReels];

  // Fetch growth data for the growth chart
  const { data: growthData = [] } = useQuery({
    queryKey: ["growth-data"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/v1/growth`, {
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();
      return data.data ?? [];
    },
    enabled: true,
  });

  /** Same per-page all-time definition as Growth page: sum of `views` across all months from /api/v1/growth.
   * Must run before any early return — hooks order must be stable (React #310). */
  const growthAllTimeByHandle = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of growthData) {
      const h = String((row as any).handle || "").trim().toLowerCase();
      if (!h || h === "total") continue;
      m.set(h, (m.get(h) ?? 0) + (Number((row as any).views) || 0));
    }
    return m;
  }, [growthData]);

  const trackerYmNormalized = useMemo(() => normalizeTrackerMonth(trackerMonth), [trackerMonth]);

  const sixDayMonthQueryEnabled =
    globalPeriod === "custom" && Boolean(trackerYmNormalized && trackerYmNormalized.length >= 7);

  const { data: sixDayMonthPayload, isPending: sixDayMonthPending } = useQuery({
    queryKey: ["six-day-month", trackerYmNormalized],
    queryFn: () => getSixDayMonth(trackerYmNormalized),
    enabled: sixDayMonthQueryEnabled,
    staleTime: 60_000,
  });

  /** Same source as the 6-Day Tracker page: entries + monthly actuals per page_id. */
  const sixDayByPageId = useMemo(() => {
    const m = new Map<
      string,
      {
        summary: any;
        cycles: { cycle: number; start: string; end: string; views: number }[];
      }
    >();
    const payload = sixDayMonthPayload as Record<string, unknown> | undefined;
    if (!payload) return m;
    const cycles = (payload.cycles as any[]) || [];
    const summaries = (payload.page_summaries as any[]) || [];
    for (const p of summaries) {
      const pid = String(p.page_id);
      const perCycle = cycles.map((c: any) => {
        const views = (c.entries || [])
          .filter((e: any) => String(e.page_id) === pid)
          .reduce((s: number, e: any) => s + (Number(e.views) || 0), 0);
        return {
          cycle: c.cycle as number,
          start: String(c.start || ""),
          end: String(c.end || ""),
          views,
        };
      });
      m.set(pid, { summary: p, cycles: perCycle });
    }
    return m;
  }, [sixDayMonthPayload]);

  const { customFrom, customTo } = useMemo(() => {
    const r = monthRangeFromYYYYMM(trackerYmNormalized || trackerMonth);
    return r ?? { from: "", to: "" };
  }, [trackerMonth, trackerYmNormalized]);

  const customTrackerWeeks = useMemo(() => {
    const a = (customFrom || "").trim().slice(0, 10);
    const b = (customTo || "").trim().slice(0, 10);
    if (!a || !b || a > b) return [] as SixDayTrackerWeek[];
    return partitionRangeIntoSixDayWeeks(a, b);
  }, [customFrom, customTo]);

  useEffect(() => {
    try {
      if (trackerMonth.trim()) localStorage.setItem(TRACKER_MONTH_KEY, trackerMonth.trim());
    } catch {
      /* ignore */
    }
  }, [trackerMonth]);

  /** Ensures a month is always set in tracker mode (never treat custom as “no range” / all-time). */
  useEffect(() => {
    if (globalPeriod !== "custom") return;
    if (trackerMonth.trim()) return;
    const now = new Date();
    setTrackerMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, [globalPeriod, trackerMonth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = data;
  const totalViews = stats?.total_views ?? 0;
  const allPagesRaw = stats?.pages ?? [];
  const allPages = [...allPagesRaw];
  const filteredByType = ipFilter === "all"
    ? allPages
    : ipFilter === "main"
      ? allPages.filter((p: any) => (p.stage ?? 1) === 3)
      : allPages.filter((p: any) => (p.stage ?? 1) === 1);

  const dashboardMonthYm = (stats?.current_month || "").slice(0, 7);
  const trackerMonthYm = (trackerYmNormalized || "").slice(0, 7);
  const monthBoundsForTracker = monthRangeFromYYYYMM(trackerYmNormalized);
  const isFullCalendarMonth =
    Boolean(monthBoundsForTracker) &&
    customFrom === monthBoundsForTracker?.from &&
    customTo === monthBoundsForTracker?.to;

  const trackerViewOpts: TrackerViewOpts | undefined =
    globalPeriod === "custom"
      ? {
          dashboardMonthYm,
          trackerMonthYm,
          isFullCalendarMonth: Boolean(isFullCalendarMonth && customFrom && customTo),
        }
      : undefined;

  function getPageViews(page: any, period: TimePeriod): number {
    switch (period) {
      case "all": {
        const h = String(page.handle || "").trim().toLowerCase();
        if (growthData.length > 0) {
          const fromGrowth = growthAllTimeByHandle.get(h);
          if (fromGrowth !== undefined) return fromGrowth;
        }
        return page.all_time_views ?? 0;
      }
      case "monthly": return page.total_views ?? 0;
      case "custom": {
        const sd = sixDayByPageId.get(String(page.id));
        if (sd?.summary) {
          const cvs = Number(sd.summary.cycle_views_sum);
          const avRaw = sd.summary.actual_views;
          const avNum =
            avRaw != null && avRaw !== "" && !Number.isNaN(Number(avRaw))
              ? Number(avRaw)
              : null;
          // DB often stores actual_views=0 before reconcile — trust cycle sum when it has entries.
          if (avNum != null && avNum > 0) return avNum;
          if (!Number.isNaN(cvs)) return cvs;
          if (avNum != null) return avNum;
        }
        if (!customFrom || !customTo) return 0;
        return getCustomRangeViewsForPage(
          page,
          customFrom,
          customTo,
          allReels,
          allPosts,
          growthData,
          trackerViewOpts,
        );
      }
    }
  }

  function getPageCounts(page: any, period: TimePeriod): { reelsCount: number; postsCount: number } {
    if (period !== "custom") {
      return {
        reelsCount: period === "all" ? (page.all_time_reels_count ?? page.reels_count ?? 0) : (page.reels_count ?? 0),
        postsCount: period === "all" ? (page.all_time_posts_count ?? page.posts_count ?? 0) : (page.posts_count ?? 0),
      };
    }
    if (!customFrom || !customTo) {
      return { reelsCount: 0, postsCount: 0 };
    }
    const from = customFrom || "0000-00-00";
    const to = customTo || "9999-99-99";
    const pid = String(page.id ?? "");
    const reelsCount = allReels.filter((r: any) => {
      const d = (r.posted_at || "")?.slice(0, 10);
      return String(r.page_id ?? "") === pid && d && d >= from && d <= to;
    }).length;
    const postsCount = allPosts.filter((p: any) => {
      const d = (p.posted_at || p.created_at || "")?.slice(0, 10);
      return String(p.page_id ?? "") === pid && d && d >= from && d <= to;
    }).length;
    return { reelsCount, postsCount };
  }

  const pages = (search.trim()
    ? filteredByType.filter((p: any) =>
        (p.handle ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : filteredByType
  ).sort((a: any, b: any) => getPageViews(b, globalPeriod) - getPageViews(a, globalPeriod));
  const currentMonth = stats?.current_month
    ? new Date(stats.current_month).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Banner */}
      <div className="relative w-full h-56 sm:h-72 -mt-[1px] overflow-hidden">
        <img
          src="/banner.png"
          alt=""
          className="w-full h-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-950" />
      </div>

      <div className="px-4 sm:px-6 -mt-16 sm:-mt-20 relative z-10 pb-8 sm:pb-10">
      <div className="max-w-6xl mx-auto">

        {/* Top Cards Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-8 sm:mb-10">
          {/* Total Ecosystem Reach + Distribution */}
          <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-semibold mb-3">
                Total Ecosystem Reach
              </p>
              <div className="flex items-center justify-between">
                <div className="space-y-3">
                  <p className="text-5xl sm:text-6xl lg:text-7xl font-black text-white tabular-nums tracking-tight leading-none">
                    {formatCompact(totalViews)}
                  </p>
                  <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {(() => {
                      const now = new Date();
                      const monthName = now.toLocaleString("default", { month: "long" });
                      const day = now.getDate();
                      const year = now.getFullYear();
                      return `${monthName} 1 — ${monthName} ${day}, ${year}`;
                    })()}
                  </span>
                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                      <span className="text-xs text-zinc-500">Reels</span>
                      <span className="text-sm font-bold text-white tabular-nums">{formatCompact(stats?.total_reel_views ?? 0)}</span>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {(() => {
                          const r = stats?.total_reel_views ?? 0;
                          const p = stats?.total_post_views ?? 0;
                          const t = r + p;
                          return t > 0 ? `(${Math.round((r / t) * 100)}%)` : "";
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-zinc-500">Posts</span>
                      <span className="text-sm font-bold text-white tabular-nums">{formatCompact(stats?.total_post_views ?? 0)}</span>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {(() => {
                          const r = stats?.total_reel_views ?? 0;
                          const p = stats?.total_post_views ?? 0;
                          const t = r + p;
                          return t > 0 ? `(${Math.round((p / t) * 100)}%)` : "";
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Donut chart */}
                {(() => {
                  const reelViews = stats?.total_reel_views ?? 0;
                  const postViews = stats?.total_post_views ?? 0;
                  const total = reelViews + postViews;
                  const size = 170;
                  const stroke = 16;
                  const radius = (size - stroke) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const gap = 0.02;
                  const reelFrac = total > 0 ? reelViews / total : 0;
                  const reelLen = reelFrac * circumference * (1 - gap);
                  const postFrac = total > 0 ? postViews / total : 0;
                  const postLen = postFrac * circumference * (1 - gap);
                  const gapLen = total > 0 && postViews > 0 ? circumference * gap : 0;
                  return (
                    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
                      <svg width={size} height={size} className="-rotate-90">
                        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} />
                        {reelViews > 0 && (
                          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#dash-reel-combined)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${reelLen} ${circumference - reelLen}`} strokeDashoffset={0} />
                        )}
                        {postViews > 0 && (
                          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#10b981" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${postLen} ${circumference - postLen}`} strokeDashoffset={-(reelLen + gapLen)} />
                        )}
                        <defs>
                          <linearGradient id="dash-reel-combined" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#d946ef" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-[8px] uppercase tracking-widest text-zinc-500">Total</p>
                        <p className="text-xl font-black text-white tabular-nums">{formatCompact(total)}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Monthly Growth — total / reels / posts line chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 overflow-hidden flex flex-col">
            {(() => {
              const allGrowth = growthData.filter((v: any) => v.handle !== "total");
              const months = [...new Set(allGrowth.map((v: any) => v.month?.slice(0, 7)))].sort();
              const chartData = months.map((month: string) => {
                const monthEntries = allGrowth.filter((v: any) => v.month?.slice(0, 7) === month);
                const totalViews = monthEntries.reduce((s: number, v: any) => s + (v.views ?? 0), 0);
                const reelViews = monthEntries.reduce((s: number, v: any) => s + (v.reel_views ?? 0), 0);
                const postViews = monthEntries.reduce((s: number, v: any) => s + (v.post_views ?? 0), 0);
                return {
                  name: new Date(month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
                  views: totalViews,
                  reels: reelViews,
                  posts: postViews,
                };
              });
              const allTimeTotal = chartData.reduce((s, d) => s + d.views, 0);

              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-semibold">
                      Monthly Growth
                    </p>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-widest text-zinc-500">All Time</p>
                      <p className="text-lg font-black text-violet-400 tabular-nums">{formatCompact(allTimeTotal)}</p>
                    </div>
                  </div>
                  {chartData.length > 0 ? (
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => formatCompact(v)} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                            labelStyle={{ color: "#d4d4d8", fontSize: 12 }}
                            formatter={(value: number, name: string) => [formatCompact(value) + " views", name]}
                          />
                          <Line name="Total" type="monotone" dataKey="views" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: "#a855f7", stroke: "#18181b", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                          <Line name="Reels" type="monotone" dataKey="reels" stroke="#d946ef" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#d946ef", stroke: "#18181b", strokeWidth: 2 }} />
                          <Line name="Posts" type="monotone" dataKey="posts" stroke="#10b981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#10b981", stroke: "#18181b", strokeWidth: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="text-center text-zinc-600 py-8 text-sm">No growth data yet</p>}
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500">Total</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-fuchsia-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500">Reels</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500">Posts</span></div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Leaderboard Podium */}
        {allPages.length >= 3 && (() => {
          const sortedForPodium = [...allPages].sort(
            (a: any, b: any) => getPageViews(b, globalPeriod) - getPageViews(a, globalPeriod),
          );
          const top3 = sortedForPodium.slice(0, 3);
          const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
          const heights = [140, 180, 110]; // podium step heights
          const medals = ["🥈", "🥇", "🥉"];
          const ranks = [2, 1, 3];
          // Solid podium colors to keep cards visible on dark background
          const podiumBg = ["bg-[#6f6f6f]", "bg-[#b58b1a]", "bg-[#6b3f1f]"]; // silver, gold, bronze
          const borderColors = ["border-white/10", "border-white/10", "border-white/10"];
          const glowColors = ["shadow-[0_12px_45px_-20px_rgba(255,255,255,0.25)]", "shadow-[0_18px_60px_-22px_rgba(181,139,26,0.55)]", "shadow-[0_12px_45px_-20px_rgba(107,63,31,0.5)]"];

          return (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🏆</span>
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">Leaderboard</h2>
              </div>
              <div className="flex items-end justify-center gap-3 sm:gap-5">
                {podiumOrder.map((page, i) => {
                  const views = getPageViews(page, globalPeriod);
                  const podiumCounts = getPageCounts(page, globalPeriod);
                  const displayName = softWrapIdText(page.name || page.handle);
                  const displayHandle = softWrapIdText(page.handle);
                  return (
                    <div
                      key={page.id}
                      onClick={() => navigate(`/page/${page.id}`)}
                      className={`cursor-pointer transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}
                    >
                      {/* Medal + Name */}
                      <span className={`text-3xl sm:text-4xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                        {medals[i]}
                      </span>
                      <div className="w-full text-center mb-2">
                        <p
                          className={`px-1 font-black text-white uppercase tracking-wide leading-snug whitespace-normal break-normal ${
                            ranks[i] === 1 ? "text-sm sm:text-base" : "text-xs sm:text-sm"
                          } min-h-[2.4rem] flex items-center justify-center`}
                          title={String(page.name || page.handle || "")}
                        >
                          {displayName}
                        </p>
                        <p
                          className="px-1 text-[10px] text-zinc-600 leading-tight min-h-[1rem] flex items-center justify-center"
                          title={`@${String(page.handle || "")}`}
                        >
                          @{displayHandle}
                        </p>
                      </div>

                      {/* Podium block */}
                      <div
                        className={`w-full rounded-t-xl border ${borderColors[i]} ${podiumBg[i]} ${glowColors[i]} flex flex-col items-center justify-center transition-all`}
                        style={{ height: heights[i] }}
                      >
                        <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
                          {formatCompact(views)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-white/80 mt-1">views</span>
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-white/70">
                          <span>{podiumCounts.reelsCount} reels</span>
                          <span>·</span>
                          <span>{podiumCounts.postsCount} posts</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Podium base */}
              <div className="max-w-md mx-auto h-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full mt-0" />
            </div>
          );
        })()}

        {/* YOUR IP'S header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">Your IP's</h2>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">
              {pages.length} total
            </Badge>
            <TogglePill
              options={[
                { label: "All", value: "all" },
                { label: "Stage 3", value: "main" },
                { label: "Stage 1", value: "stage1" },
              ]}
              value={ipFilter}
              onChange={(v) => setIpFilter(v as "all" | "main" | "stage1")}
            />
          </div>
          {/* Global period toggle */}
          <div className="flex items-center gap-3">
            <TogglePill
              options={[
                { label: "All Time", value: "all" },
                { label: "Monthly", value: "monthly" },
                { label: "6 day tracker wise", value: "custom" },
              ]}
              value={globalPeriod}
              onChange={(v) => {
                const next = v as TimePeriod;
                if (next === "custom" && !trackerMonth.trim()) {
                  const now = new Date();
                  setTrackerMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }
                setGlobalPeriod(next);
              }}
            />
            {globalPeriod === "custom" && (
              <div className="flex flex-col items-end gap-1">
                <label className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Month</span>
                  <input
                    type="month"
                    value={trackerYmNormalized || trackerMonth}
                    onChange={(e) => setTrackerMonth(normalizeTrackerMonth(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50 cursor-pointer min-w-[10rem]"
                  />
                </label>
                {customTrackerWeeks.length > 0 && (
                  <p className="text-[10px] text-zinc-500 max-w-[min(100vw-2rem,300px)] text-right leading-snug">
                    Same window as 6-Day Tracker: official cycles (e.g. Apr 1–6) and per-page views load from the tracker month API. Cards fall back to reels/growth only if that page has no tracker row.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-sm pb-4 sm:pb-5 -mx-5 sm:-mx-8 px-5 sm:px-8 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search pages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50 h-11"
            />
          </div>
        </div>

        {/* Page Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {pages.map((page: any) => {
            const viewsForPeriod = getPageViews(page, globalPeriod);
            const pageTotal = (page.reel_views ?? 0) + (page.post_views ?? 0);
            const reelPct = pageTotal > 0 ? ((page.reel_views ?? 0) / pageTotal * 100) : 0;
            const { reelsCount, postsCount } = getPageCounts(page, globalPeriod);
            const isTracker = globalPeriod === "custom" && Boolean(trackerMonth?.trim());
            const sdPage = sixDayByPageId.get(String(page.id));
            const hasApiCycleData =
              isTracker &&
              Boolean(sixDayMonthPayload) &&
              !sixDayMonthPending &&
              Boolean(sdPage?.cycles?.length);
            const apiCyclesForCard = hasApiCycleData
              ? (sdPage!.cycles as { cycle: number; start: string; end: string; views: number }[]).filter(
                  (c) => c.views > 0,
                )
              : [];
            const apiCyclesCombined = hasApiCycleData
              ? sdPage!.cycles.reduce((s, c) => s + c.views, 0)
              : 0;
            const legacyWeekBreakdown =
              isTracker &&
              !hasApiCycleData &&
              customTrackerWeeks.length > 0 &&
              customFrom &&
              customTo
                ? getSixDayTrackerBreakdownForPage(
                    page,
                    customTrackerWeeks,
                    allReels,
                    allPosts,
                    growthData,
                    trackerViewOpts,
                    customFrom,
                    customTo,
                  )
                : [];
            const weeksCombined = hasApiCycleData
              ? apiCyclesCombined
              : legacyWeekBreakdown.reduce((s, w) => s + w.views, 0);
            const sixDayBreakdown = legacyWeekBreakdown;

            return (
              <div
                key={page.id}
                onClick={() => navigate(`/page/${page.id}`)}
                className="group relative bg-zinc-950 border border-emerald-500/20 rounded-2xl p-5 sm:p-6 cursor-pointer transition-all duration-200 hover:border-emerald-500/40 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.15)] active:scale-[0.98]"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-wide leading-tight">
                    {page.name || page.handle}
                  </h3>
                  <MoreVertical className="w-5 h-5 text-zinc-700 shrink-0 mt-0.5" />
                </div>

                <a
                  href={`https://www.instagram.com/${page.handle}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-zinc-600 hover:text-violet-400 transition-colors mb-4 block"
                >@{page.handle}</a>

                {isTracker && trackerYmNormalized && (
                  <p className="text-[11px] text-zinc-500 mb-2 font-medium">
                    {new Date(trackerYmNormalized + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </p>
                )}

                {/* Total Views Label */}
                <p className="text-[10px] uppercase tracking-[0.15em] text-violet-400 font-bold mb-2">
                  {isTracker ? "Month total (6-day tracker)" : "Total Views"}
                </p>

                {/* Big View Number + Growth */}
                <div className="flex items-end justify-between">
                  <p className="text-3xl sm:text-4xl font-black text-white tabular-nums tracking-tight">
                    {formatCompact(viewsForPeriod)}
                  </p>

                  {reelPct > 0 && !isTracker && (
                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold px-2 py-1 rounded-full">
                      <TrendingUp className="w-3 h-3" />
                      {reelPct.toFixed(1)}%
                    </span>
                  )}
                </div>

                {isTracker && hasApiCycleData && apiCyclesForCard.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-emerald-400/90 font-bold">
                      6-day tracker (cycle-wise)
                    </p>
                    <ul className="space-y-1.5">
                      {apiCyclesForCard.map((c) => (
                        <li
                          key={`cycle-${c.cycle}-${c.start}`}
                          className="flex items-start justify-between gap-2 text-[11px] leading-tight"
                        >
                          <span className="text-zinc-500 min-w-0">
                            <span className="text-zinc-300 font-semibold">Cycle {c.cycle}</span>
                            <span className="block text-[10px] text-zinc-600 mt-0.5">
                              {fmtShortRange(c.start, c.end)}
                            </span>
                          </span>
                          <span className="text-zinc-100 tabular-nums font-semibold shrink-0">
                            {formatCompact(c.views)}
                          </span>
                        </li>
                      ))}
                      <li className="flex items-start justify-between gap-2 text-[11px] pt-2 mt-1 border-t border-zinc-800/90">
                        <span className="text-zinc-400 font-semibold">Cycles combined (entries)</span>
                        <span className="text-emerald-300/95 tabular-nums font-bold shrink-0">
                          {formatCompact(apiCyclesCombined)}
                        </span>
                      </li>
                    </ul>
                    {Math.abs(apiCyclesCombined - viewsForPeriod) > 2 && sdPage?.summary?.actual_views != null && (
                      <p className="text-[9px] text-zinc-600 leading-snug">
                        Month total uses monthly actual from the tracker when set; cycle rows sum entries only.
                      </p>
                    )}
                  </div>
                )}

                {isTracker && hasApiCycleData && apiCyclesForCard.length === 0 && (
                  <p className="mt-3 text-[11px] text-zinc-500">No per-cycle entries for this page this month.</p>
                )}

                {isTracker && sixDayBreakdown.length > 0 && !hasApiCycleData && (
                  <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-emerald-400/90 font-bold">
                      6-day tracker (estimated weeks)
                    </p>
                    <ul className="space-y-1.5">
                      {sixDayBreakdown.map((w) => (
                        <li
                          key={`${w.weekNum}-${w.start}`}
                          className="flex items-start justify-between gap-2 text-[11px] leading-tight"
                        >
                          <span className="text-zinc-500 min-w-0">
                            <span className="text-zinc-300 font-semibold">Week {w.weekNum}</span>
                            <span className="block text-[10px] text-zinc-600 mt-0.5">{w.rangeLabel}</span>
                          </span>
                          <span className="text-zinc-100 tabular-nums font-semibold shrink-0">
                            {formatCompact(w.views)}
                          </span>
                        </li>
                      ))}
                      <li className="flex items-start justify-between gap-2 text-[11px] pt-2 mt-1 border-t border-zinc-800/90">
                        <span className="text-zinc-400 font-semibold">All weeks combined</span>
                        <span className="text-emerald-300/95 tabular-nums font-bold shrink-0">
                          {formatCompact(weeksCombined)}
                        </span>
                      </li>
                    </ul>
                    {Math.abs(weeksCombined - viewsForPeriod) > 2 && (
                      <p className="text-[9px] text-zinc-600 leading-snug">
                        Month total uses the full range once; weeks may differ slightly from rounding.
                      </p>
                    )}
                  </div>
                )}

                {isTracker && sixDayMonthPending && sixDayMonthQueryEnabled && (
                  <p className="mt-3 text-[11px] text-zinc-500">Loading 6-day tracker data…</p>
                )}

                {isTracker &&
                  !sixDayMonthPending &&
                  sixDayMonthQueryEnabled &&
                  !sixDayMonthPayload && (
                    <p className="mt-3 text-[11px] text-amber-500/90">
                      Could not load 6-day tracker for this month. Check the API or try again.
                    </p>
                  )}

                {isTracker && !trackerYmNormalized && (
                  <p className="mt-3 text-[11px] text-amber-500/90">Pick a month above.</p>
                )}

                {isTracker &&
                  trackerYmNormalized &&
                  (!customFrom || !customTo || customFrom > customTo) &&
                  !sixDayMonthPending &&
                  !(sixDayMonthQueryEnabled && sixDayMonthPayload) && (
                    <p className="mt-3 text-[11px] text-amber-500/90">Invalid month — choose a valid calendar month.</p>
                  )}

                {/* Mini breakdown */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-900">
                  <span className="text-[10px] text-zinc-600">{reelsCount} reels</span>
                  <span className="text-[10px] text-zinc-600">{postsCount} posts</span>
                </div>
              </div>
            );
          })}
        </div>

        {pages.length === 0 && search && (
          <p className="text-center text-zinc-500 py-12">No pages matching "{search}"</p>
        )}
      </div>
      </div>
    </div>
  );
}
