import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getSixDayMonth, upsertSixDayEntry,
  createSixDayTopContent, updateSixDayTopContent, deleteSixDayTopContent,
  upsertSixDayActual, getSixDayDeadlines, getPages,
  getTrackerNiches,
} from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, TrendingUp, TrendingDown, ExternalLink,
  ChevronDown, ChevronUp, CheckCircle2, Clock,
  AlertTriangle, Save, ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const normHandle = (h: string) => String(h || "").replace(/^@/, "").trim().toLowerCase();

/** Garfields — Swati (indiabusinesscom, entrepreneursindia.co, therealfoundr) + Deepak/Kaavya (startupbydog, bizzindia) */
const GARFIELD_WEEK4_HANDLES = [
  "bizzindia",
  "startupbydog",
  "indiabusinesscom",
  "entrepreneursindia.co",
  "therealfoundr",
] as const;

/** Goofies — Arohi + Harish */
const GOOFIES_ACTIVE_HANDLES = [
  "101xfounders",
  "foundersinindia",
  "startupcoded",
] as const;

/** Sherus — Sugam (thechangingorder) + Chaitanya (startupwtf, 101xtechnology) */
const SHERUS_ACTIVE_HANDLES = [
  "thechangingorder",
  "startupwtf",
  "101xtechnology",
] as const;

/** Experiment X — Pulkit */
const EXPERIMENT_X_HANDLES = [
  "indianfoundersco",
  "indiastartupstory",
  "indianbusinesscom",
  "indiafoundersscore",
  "indianfoundersdaily",
] as const;

// Hardcoded to preserve May 2026 (Week 3) history — do not derive from the above constants.
const ACTIVE_ROSTER_WEEK3 = new Set([
  "bizzindia",
  "indianfoundersco",
  "startupbydog",
  "indianbusinesscom",
  "entrepreneursindia.co",
  "101xfounders",
  "foundersinindia",
  "startupsinthelast24hrs",
  "startupcoded",
  "indiastartupstory",
  "entrepreneurial.india",
  "thechangingorder",
]);

const ACTIVE_ROSTER_WEEK4 = new Set([
  ...GARFIELD_WEEK4_HANDLES,
  ...GOOFIES_ACTIVE_HANDLES,
  ...SHERUS_ACTIVE_HANDLES,
  ...EXPERIMENT_X_HANDLES,
]);

const ROSTER_CUTOFF_CYCLE3 = "2026-05-13";
const ROSTER_CUTOFF_CYCLE4 = "2026-05-19";

type TabMode = "cycles" | "reconcile";

export default function SixDayTracker() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabMode>("cycles");
  const [expandedCycle, setExpandedCycle] = useState<number | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: monthData, isFetching: monthFetching, isPending: monthPending } = useQuery({
    queryKey: ["six-day-month", selectedMonth],
    queryFn: () => getSixDayMonth(selectedMonth),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: deadlineData } = useQuery({
    queryKey: ["six-day-deadlines"],
    queryFn: getSixDayDeadlines,
    staleTime: 5 * 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: allPagesRaw, isPending: pagesPending } = useQuery({
    queryKey: ["pages-list"],
    queryFn: async () => {
      const res = await getPages();
      return Array.isArray(res) ? res : (res as any)?.data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data: nichesRaw } = useQuery<any[]>({
    queryKey: ["tracker-niches"],
    queryFn: async () => {
      const res = await getTrackerNiches();
      return Array.isArray(res) ? res : ((res as any)?.data ?? []);
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const overdueCycles = deadlineData?.overdue_cycles || [];
  const pageSummaries = monthData?.page_summaries || [];
  const monthDate = monthData?.month_date || `${selectedMonth}-01`;

  /* Niche filter: map each page handle to a niche bucket (garfields / goofies / sheruses).
     Niches come from tracker_niches; we match by substring on the niche name.
     Multi-select: empty set == "All" (show everything). Otherwise show only
     pages whose niche is in the selected set. */
  type NicheKey = "garfields" | "goofies" | "sheruses" | "experimentx";
  const [nicheFilters, setNicheFilters] = useState<NicheKey[]>([]);
  const nicheFilterSet = useMemo(() => new Set(nicheFilters), [nicheFilters]);
  const isAllActive = nicheFilters.length === 0;
  const toggleNiche = (k: NicheKey) => {
    setNicheFilters((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };
  const clearNiche = () => setNicheFilters([]);

  const handleToNiche = useMemo(() => {
    const m = new Map<string, "garfields" | "goofies" | "sheruses" | "experimentx">();
    for (const n of nichesRaw || []) {
      const nm = String(n?.name || "").toLowerCase();
      let bucket: "garfields" | "goofies" | "sheruses" | "experimentx" | null = null;
      if (nm.includes("garfields")) bucket = "garfields";
      else if (nm.includes("goofies")) bucket = "goofies";
      else if (nm.includes("sheerus") || nm.includes("sheru") || nm.includes("changing order")) bucket = "sheruses";
      else if (nm.includes("experiment")) bucket = "experimentx";
      if (!bucket) continue;
      for (const h of n?.pages || []) {
        if (h) m.set(normHandle(h), bucket);
      }
    }
    // Hardcoded fallbacks so roster updates apply before Supabase niche sync.
    for (const h of GARFIELD_WEEK4_HANDLES) m.set(h, "garfields");
    for (const h of GOOFIES_ACTIVE_HANDLES) m.set(h, "goofies");
    for (const h of SHERUS_ACTIVE_HANDLES) m.set(h, "sheruses");
    for (const h of EXPERIMENT_X_HANDLES) m.set(h, "experimentx");
    return m;
  }, [nichesRaw]);

  /* Full server page list — used for pre-cutoff cycles so old page views remain visible. */
  const allServerPages = useMemo(() => {
    const sp = monthData?.pages || [];
    if (sp.length > 0) return sp;
    return (allPagesRaw || []).map((p: any) => ({ id: p.id, handle: p.handle, name: p.name, stage: p.stage ?? 1 }));
  }, [monthData, allPagesRaw]);

  /* Active roster pages — Week 4 list (hardcoded), not DB-dependent. */
  const nichePages = useMemo(() => {
    const rosterPages = allServerPages.filter((p: any) => ACTIVE_ROSTER_WEEK4.has(normHandle(p.handle)));
    if (rosterPages.length > 0) return rosterPages;
    if (handleToNiche.size === 0) return allServerPages;
    return allServerPages.filter((p: any) => handleToNiche.has(normHandle(p.handle)));
  }, [allServerPages, handleToNiche]);

  /* allPages drives the niche filter pill counts — always the niche list. */
  const allPages = nichePages;

  const nicheCounts = useMemo(() => {
    const c = { all: nichePages.length, garfields: 0, goofies: 0, sheruses: 0, experimentx: 0 };
    for (const p of nichePages) {
      const key = handleToNiche.get(String(p.handle || "").replace(/^@/, "").trim().toLowerCase());
      if (key === "garfields") c.garfields += 1;
      else if (key === "goofies") c.goofies += 1;
      else if (key === "sheruses") c.sheruses += 1;
      else if (key === "experimentx") c.experimentx += 1;
    }
    return c;
  }, [nichePages, handleToNiche]);

  /* pages = niche pages optionally filtered by active team pill (Garfields / Goofies / Sherus). */
  const pages = useMemo(() => {
    if (isAllActive) return nichePages;
    return nichePages.filter((p: any) => {
      const key = handleToNiche.get(String(p.handle || "").replace(/^@/, "").trim().toLowerCase());
      return !!key && nicheFilterSet.has(key);
    });
  }, [nichePages, handleToNiche, nicheFilterSet, isAllActive]);

  /* Per-cycle page list: historical → Week 3 roster → current niche roster. */
  const getCyclePages = useCallback((cycle: any): any[] => {
    const start = String(cycle?.start || "");
    const applyTeamFilter = (list: any[]) => {
      if (isAllActive) return list;
      return list.filter((p: any) => {
        const key = handleToNiche.get(normHandle(p.handle));
        return !!key && nicheFilterSet.has(key);
      });
    };

    if (start < ROSTER_CUTOFF_CYCLE3) {
      return applyTeamFilter(allServerPages);
    }
    if (start < ROSTER_CUTOFF_CYCLE4) {
      return applyTeamFilter(allServerPages.filter((p: any) => ACTIVE_ROSTER_WEEK3.has(normHandle(p.handle))));
    }
    return applyTeamFilter(allServerPages.filter((p: any) => ACTIVE_ROSTER_WEEK4.has(normHandle(p.handle))));
  }, [allServerPages, handleToNiche, nicheFilterSet, isAllActive]);

  /* allowedPageIds is only needed for the reconcile/summary filter — keep as niche-based. */
  const allowedPageIds = useMemo(
    () => (isAllActive ? null : new Set(pages.map((p: any) => p.id))),
    [pages, isAllActive],
  );

  const cycles = useMemo(() => {
    const serverCycles = monthData?.cycles || [];
    if (serverCycles.length === 5) return serverCycles;
    const [y, m] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const ranges = [
      { cycle: 1, start: `${selectedMonth}-01`, end: `${selectedMonth}-06` },
      { cycle: 2, start: `${selectedMonth}-07`, end: `${selectedMonth}-12` },
      { cycle: 3, start: `${selectedMonth}-13`, end: `${selectedMonth}-18` },
      { cycle: 4, start: `${selectedMonth}-19`, end: `${selectedMonth}-24` },
      { cycle: 5, start: `${selectedMonth}-25`, end: `${selectedMonth}-${String(lastDay).padStart(2, "0")}` },
    ];
    const today = new Date().toISOString().slice(0, 10);
    return ranges.map((r) => {
      const server = serverCycles.find((c: any) => c.cycle === r.cycle);
      return server || {
        ...r,
        status: today < r.start ? "upcoming" : today <= r.end ? "active" : "done",
        entries: [],
        top_content: [],
        page_content: {},
        filled_count: 0,
        total_pages: pages.length,
      };
    });
  }, [monthData, selectedMonth, pages.length]);

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [selectedMonth]);

  function shiftMonth(delta: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setExpandedCycle(null);
  }

  const totalCycleViews = useMemo(() => {
    const rows = allowedPageIds
      ? pageSummaries.filter((p: any) => allowedPageIds.has(p.page_id))
      : pageSummaries;
    return rows.reduce((s: number, p: any) => s + (p.cycle_views_sum || 0), 0);
  }, [pageSummaries, allowedPageIds]);

  const reconcileRows = useMemo(() => {
    const base = pageSummaries.length > 0
      ? pageSummaries
      : (pages || []).map((p: any) => ({
        page_id: p.id,
        handle: p.handle,
        name: p.name,
        cycle_views_sum: 0,
        actual_views: null as number | null,
      }));
    if (!allowedPageIds) return base;
    return base.filter((r: any) => allowedPageIds.has(r.page_id));
  }, [pageSummaries, pages, allowedPageIds]);

  function invalidateSixDayAndGrowth() {
    qc.invalidateQueries({ queryKey: ["six-day-month"] });
    qc.invalidateQueries({ queryKey: ["growth-data"] });
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <img
                src="/rabbit.webp"
                alt="late rabbit"
                className="w-20 h-20 rounded-2xl object-cover object-top"
              />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-tight leading-none">
                6-Day Tracker
              </h1>
              <p className="text-sm text-zinc-500 mt-1.5">Auto-cycles from the 1st of every month</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="inline-flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-0.5">
              {(["cycles", "reconcile"] as TabMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setTab(v)}
                  className={`text-[11px] uppercase tracking-wider px-4 py-2 rounded-lg font-semibold transition-all ${
                    tab === v
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {v === "cycles" ? "Cycles" : "Month-end fix"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Overdue warning ── */}
        {overdueCycles.length > 0 && (
          <div className="mb-5 bg-amber-500/8 border border-amber-500/25 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-300">
                {overdueCycles.length} cycle{overdueCycles.length > 1 ? "s" : ""} overdue
              </p>
              <p className="text-xs text-amber-500/70 mt-0.5">
                {overdueCycles.map((c: any) =>
                  `Cycle ${c.cycle} (${fmtShort(c.start)}–${fmtShort(c.end)}): ${c.missing_count} IPs unfilled`
                ).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Month nav + total views ── */}
        <div className="flex items-center gap-0 mb-6">
          <button onClick={() => shiftMonth(-1)} className="p-2.5 rounded-xl hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-bold text-white w-40 text-center">{monthLabel}</h2>
          <button onClick={() => shiftMonth(1)} className="p-2.5 rounded-xl hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="ml-4 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white tabular-nums">{fmt(totalCycleViews)}</span>
            <span className="text-xs text-zinc-500 font-medium">total views</span>
            {monthFetching && <span className="text-[10px] text-zinc-600 ml-2">updating…</span>}
          </div>
          {/* Month-end action — right side */}
          <button
            onClick={() => setTab("reconcile")}
            className={`ml-auto text-xs font-semibold px-4 py-2 rounded-xl border transition-all ${
              tab === "reconcile"
                ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            Month-end correction
          </button>
        </div>

        {/* ── Niche filter ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mr-1">
            Filter by niche
          </span>
          <button
            onClick={clearNiche}
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold transition-all ${
              isAllActive
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All <span className={`tabular-nums text-[10px] ${isAllActive ? "opacity-75" : "text-zinc-600"}`}>{nicheCounts.all}</span>
          </button>
          {([
            { key: "garfields", label: "Garfields", emoji: "🐱", count: nicheCounts.garfields, active: "bg-gradient-to-r from-orange-500 to-amber-500 text-zinc-900 shadow-md shadow-orange-500/30" },
            { key: "goofies", label: "Goofies", emoji: "🐶", count: nicheCounts.goofies, active: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-md shadow-indigo-500/30" },
            { key: "sheruses", label: "The Sherus", emoji: "🦁", count: nicheCounts.sheruses, active: "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30" },
            { key: "experimentx", label: "Experiment X", emoji: "🧪", count: nicheCounts.experimentx, active: "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/30" },
          ] as const).map((opt) => {
            const isActive = nicheFilterSet.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggleNiche(opt.key)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold transition-all ${
                  isActive ? opt.active : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                <span aria-hidden>{opt.emoji}</span>
                {opt.label}
                <span className={`tabular-nums text-[10px] ${isActive ? "opacity-75" : "text-zinc-600"}`}>{opt.count}</span>
              </button>
            );
          })}
          {nicheCounts.none > 0 && isAllActive && (
            <span className="text-[10px] text-zinc-700 ml-auto">
              {nicheCounts.none} not in a niche yet
            </span>
          )}
        </div>

        {pagesPending && pages.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-16 text-zinc-500 text-sm">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            Loading page list…
          </div>
        ) : tab === "cycles" ? (
          <div className="space-y-3">
            {monthPending && !monthData && (
              <p className="text-xs text-zinc-500 text-center py-1">Loading saved cycle data…</p>
            )}
            {pages.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
                No accounts in this niche yet. Switch the filter above or add handles to the niche.
              </div>
            ) : null}
            {pages.length > 0 && cycles.map((cycle: any) => {
              const cyclePages = getCyclePages(cycle);
              const cycleAllowedIds = String(cycle?.start || "") >= ROSTER_CUTOFF_CYCLE3 && isAllActive
                ? new Set<string>(cyclePages.map((p: any) => p.id))
                : allowedPageIds;
              return (
              <CycleCard
                key={cycle.cycle}
                cycle={cycle}
                pages={cyclePages}
                allowedPageIds={cycleAllowedIds}
                monthDate={monthDate}
                expanded={expandedCycle === cycle.cycle}
                onToggle={() => setExpandedCycle(expandedCycle === cycle.cycle ? null : cycle.cycle)}
                qc={qc}
                userEmail={user?.email || ""}
                selectedMonth={selectedMonth}
                onDataChange={invalidateSixDayAndGrowth}
              />
              );
            })}
          </div>
        ) : (
          <ReconcileView
            reconcileRows={reconcileRows}
            monthDate={monthDate}
            qc={qc}
            userEmail={user?.email || ""}
            onSaved={invalidateSixDayAndGrowth}
          />
        )}
      </div>
    </div>
  );
}

function fmtShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Merge a saved `six_day_entries` row into the month query cache — avoids refetch races that clear IP inputs. */
function patchSixDayEntryInCache(
  qc: { setQueryData: (key: unknown, updater: (old: unknown) => unknown) => void },
  monthYm: string,
  saved: Record<string, unknown> | null | undefined,
) {
  if (!saved || !monthYm) return;
  const cycleNumber = Number((saved as any).cycle_number);
  const pageId = String((saved as any).page_id);
  if (Number.isNaN(cycleNumber) || !pageId) return;
  qc.setQueryData(["six-day-month", monthYm], (old: any) => {
    if (!old?.cycles) return old;
    const cycles = old.cycles.map((c: any) => {
      if (Number(c.cycle) !== cycleNumber) return c;
      const list = [...(c.entries || [])];
      const idx = list.findIndex((e: any) => String(e.page_id) === pageId);
      const row = { ...(idx >= 0 ? list[idx] : {}), ...(saved as object) };
      if (idx >= 0) list[idx] = row;
      else list.push(row);
      return { ...c, entries: list };
    });
    return { ...old, cycles };
  });
}


/* ──────── Cycle Card ──────── */
function CycleCard({
  cycle, pages, allowedPageIds, monthDate, expanded, onToggle, qc, userEmail, selectedMonth, onDataChange,
}: {
  cycle: any;
  pages: any[];
  allowedPageIds: Set<string> | null;
  monthDate: string;
  expanded: boolean;
  onToggle: () => void;
  qc: any;
  userEmail: string;
  selectedMonth: string;
  onDataChange: () => void;
}) {
  const allEntries: any[] = cycle.entries || [];
  const allTopContent: any[] = cycle.top_content || [];
  const entries = allowedPageIds
    ? allEntries.filter((e: any) => allowedPageIds.has(e.page_id))
    : allEntries;
  const totalViews = entries.reduce((s: number, e: any) => s + (e.views || 0), 0);
  const filledCount = (() => {
    // An entry only counts as "filled" if it has actual data — same rule as the green dot
    const meaningful = (e: any) =>
      (e.views ?? 0) > 0 || e.reel_pct != null || e.post_pct != null || e.reel_perf != null || e.post_perf != null;

    const filled = new Set<string>();
    for (const e of allEntries) {
      if (e.page_id && meaningful(e) && (!allowedPageIds || allowedPageIds.has(e.page_id))) {
        filled.add(e.page_id);
      }
    }
    for (const t of allTopContent) {
      if (t.page_id && (!allowedPageIds || allowedPageIds.has(t.page_id))) filled.add(t.page_id);
    }
    return filled.size;
  })();

  const accent = cycle.status === "done"
    ? { bar: "bg-emerald-500", glow: "shadow-emerald-500/10", border: "border-emerald-500/15", badge: "bg-emerald-500/15 text-emerald-400", progress: "bg-emerald-500" }
    : cycle.status === "active"
      ? { bar: "bg-amber-500", glow: "shadow-amber-500/10", border: "border-amber-500/20", badge: "bg-amber-500/15 text-amber-400", progress: "bg-amber-500" }
      : { bar: "bg-zinc-700", glow: "", border: "border-zinc-800", badge: "bg-zinc-800 text-zinc-500", progress: "bg-zinc-700" };

  const fillPct = pages.length > 0 ? Math.round((filledCount / pages.length) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-zinc-900 border ${accent.border} rounded-2xl overflow-hidden shadow-lg ${accent.glow}`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accent.bar}`} />

      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between pl-6 pr-5 py-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          {cycle.status === "done"
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            : cycle.status === "active"
              ? <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              : <Clock className="w-4 h-4 text-zinc-600 shrink-0" />}
          <div>
            <span className="text-white font-bold text-base">Cycle {cycle.cycle}</span>
            <span className="text-zinc-500 text-xs ml-3">{fmtShort(cycle.start)} — {fmtShort(cycle.end)}</span>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${accent.badge}`}>
            {cycle.status === "done" ? "Done" : cycle.status === "active" ? "Active" : "Upcoming"}
          </span>
        </div>

        <div className="flex items-center gap-8">
          {/* Views */}
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Views</p>
            <p className="text-xl font-black text-white tabular-nums leading-none">{fmt(totalViews)}</p>
          </div>

          {/* IPs Filled + progress bar */}
          <div className="hidden sm:block text-right min-w-[80px]">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">IPs Filled</p>
            <p className="text-sm font-bold text-white leading-none">
              {filledCount}<span className="text-zinc-600">/{pages.length}</span>
            </p>
            <div className="mt-2 h-1 w-20 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${accent.progress}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {expanded
            ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 p-5 sm:p-6 space-y-2">
              {pages.map((p: any) => (
                <IPDropdown
                  key={p.id}
                  page={p}
                  cycle={cycle}
                  monthDate={monthDate}
                  selectedMonth={selectedMonth}
                  qc={qc}
                  userEmail={userEmail}
                  onDataChange={onDataChange}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/* ──────── IP row: collapsible accordion per page ──────── */
function IPDropdown({
  page, cycle, monthDate, selectedMonth, qc, userEmail, onDataChange,
}: {
  page: any;
  cycle: any;
  monthDate: string;
  selectedMonth: string;
  qc: any;
  userEmail: string;
  onDataChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [newViews, setNewViews] = useState("");
  const [newType, setNewType] = useState("reel");

  const entry = (cycle.entries || []).find((e: any) => String(e.page_id) === String(page.id));
  const allContent: any[] = cycle.top_content || [];
  const toplineItems = allContent.filter((t: any) => t.page_id === page.id);
  const toplineViewsSum = toplineItems.reduce((s: number, t: any) => s + (t.views || 0), 0);

  const [weekViews, setWeekViews] = useState("");
  const [reelPctStr, setReelPctStr] = useState("");
  const [postPctStr, setPostPctStr] = useState("");
  const [reelPerfStr, setReelPerfStr] = useState("");
  const [postPerfStr, setPostPerfStr] = useState("");

  const rowKey = `${selectedMonth}|${cycle.cycle}|${page.id}`;
  const rowKeyRef = useRef("");
  const sawServerEntryRef = useRef(false);
  // Track last-hydrated values so we can detect unsaved changes on collapse
  const savedValRef = useRef({ weekViews: "0", reelPctStr: "", postPctStr: "", reelPerfStr: "", postPerfStr: "" });

  useEffect(() => {
    if (rowKeyRef.current !== rowKey) {
      rowKeyRef.current = rowKey;
      sawServerEntryRef.current = false;
    }
    if (sawServerEntryRef.current && !entry) return;
    if (entry) sawServerEntryRef.current = true;

    const vals = {
      weekViews: String((entry?.views as number | undefined) ?? 0),
      reelPctStr: entry?.reel_pct != null && entry.reel_pct !== "" ? String(entry.reel_pct) : "",
      postPctStr: entry?.post_pct != null && entry.post_pct !== "" ? String(entry.post_pct) : "",
      reelPerfStr: entry?.reel_perf != null && entry.reel_perf !== "" ? String(entry.reel_perf) : "",
      postPerfStr: entry?.post_perf != null && entry.post_perf !== "" ? String(entry.post_perf) : "",
    };
    setWeekViews(vals.weekViews);
    setReelPctStr(vals.reelPctStr);
    setPostPctStr(vals.postPctStr);
    setReelPerfStr(vals.reelPerfStr);
    setPostPerfStr(vals.postPerfStr);
    savedValRef.current = vals;
  }, [rowKey, entry, page.id, cycle.cycle, selectedMonth]);

  function parseOptionalPct(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function parseOptionalNumber(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    if (Number.isNaN(n)) return null;
    return n;
  }

  const upsertEntryMut = useMutation({
    mutationFn: (data: Record<string, any>) => upsertSixDayEntry(data),
    onSuccess: (saved: any) => {
      patchSixDayEntryInCache(qc, selectedMonth, saved);
      onDataChange();
    },
  });

  function entryPayload(overrides: Record<string, any> = {}) {
    return {
      month: monthDate,
      cycle_number: cycle.cycle,
      page_id: page.id,
      views: Math.max(0, Number(weekViews) || 0),
      reel_pct: parseOptionalPct(reelPctStr),
      post_pct: parseOptionalPct(postPctStr),
      reel_perf: parseOptionalNumber(reelPerfStr),
      post_perf: parseOptionalNumber(postPerfStr),
      filled_by: userEmail || "",
      ...overrides,
    };
  }

  function saveEntry(overrides: Record<string, any> = {}) {
    upsertEntryMut.mutate(entryPayload(overrides));
  }

  /** Detect if local state diverges from last-saved server state */
  function isDirty() {
    const s = savedValRef.current;
    return (
      weekViews !== s.weekViews ||
      reelPctStr !== s.reelPctStr ||
      postPctStr !== s.postPctStr ||
      reelPerfStr !== s.reelPerfStr ||
      postPerfStr !== s.postPerfStr
    );
  }

  /** Auto-save on collapse — only if dirty AND there's actual data worth persisting */
  function handleToggle() {
    if (open && isDirty()) {
      const hasActualData = Number(weekViews) > 0 || reelPctStr !== "" || postPctStr !== "" || reelPerfStr !== "" || postPerfStr !== "";
      if (hasActualData) saveEntry();
    }
    setOpen(!open);
  }

  const createMut = useMutation({
    mutationFn: createSixDayTopContent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      onDataChange();
      setNewLink(""); setNewViews(""); setNewType("reel"); setAddMode(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) => updateSixDayTopContent(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["six-day-month"] }); onDataChange(); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSixDayTopContent,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["six-day-month"] }); onDataChange(); },
  });

  function handleAdd() {
    if (!newLink) return;
    createMut.mutate({
      month: monthDate, cycle_number: cycle.cycle, link: newLink,
      views: Number(newViews) || 0, page_id: page.id, page_handle: page.handle, content_type: newType,
    });
  }

  const hasData = (
    !!entry && ((entry.views ?? 0) > 0 || entry.reel_pct != null || entry.post_pct != null || entry.reel_perf != null || entry.post_perf != null)
  ) || toplineItems.length > 0;
  const views = entry?.views || 0;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      open ? "border-zinc-700" : hasData ? "border-zinc-800/80" : "border-zinc-800/40"
    } bg-zinc-900/40`}>

      {/* ── Collapsed header row ── */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors group"
      >
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
          hasData ? "bg-emerald-400" : "bg-zinc-700 group-hover:bg-zinc-600"
        }`} />

        {/* Name + handle */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <span className="text-white font-semibold text-sm truncate">{page.name || page.handle}</span>
          <span className="text-zinc-600 text-xs shrink-0">@{page.handle}</span>
        </div>

        {/* Summary stats (only when collapsed) */}
        {!open && (
          <div className="flex items-center gap-3 shrink-0">
            {views > 0 && (
              <span className="text-white font-bold text-sm tabular-nums">{fmt(views)}</span>
            )}
            {reelPctStr && (
              <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full tabular-nums">
                R {reelPctStr}%
              </span>
            )}
            {postPctStr && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full tabular-nums">
                P {postPctStr}%
              </span>
            )}
            {toplineItems.length > 0 && (
              <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">
                {toplineItems.length} link{toplineItems.length !== 1 ? "s" : ""}
              </span>
            )}
            {upsertEntryMut.isPending && (
              <span className="text-[10px] text-violet-400">saving…</span>
            )}
          </div>
        )}

        <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* ── Expanded content ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 px-4 py-4 space-y-4">

              {/* Input grid */}
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="w-[7.5rem] shrink-0">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Total</p>
                  <Input type="number" min={0} value={weekViews}
                    onChange={(e) => setWeekViews(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={upsertEntryMut.isPending}
                    className="h-8 text-xs bg-zinc-800 border-zinc-600 text-white tabular-nums px-2 focus:border-violet-500"
                  />
                </div>
                <div className="w-[3.75rem] shrink-0">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Reel %</p>
                  <Input type="number" min={0} max={100} value={reelPctStr}
                    onChange={(e) => setReelPctStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={upsertEntryMut.isPending}
                    className="h-8 text-xs bg-zinc-800 border-zinc-600 text-purple-300 tabular-nums px-2 focus:border-purple-500"
                  />
                </div>
                <div className="w-[3.75rem] shrink-0">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Post %</p>
                  <Input type="number" min={0} max={100} value={postPctStr}
                    onChange={(e) => setPostPctStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={upsertEntryMut.isPending}
                    className="h-8 text-xs bg-zinc-800 border-zinc-600 text-emerald-300 tabular-nums px-2 focus:border-emerald-500"
                  />
                </div>
                <div className="w-[5.5rem] shrink-0">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Reel baseline</p>
                  <Input type="number" step="0.01" value={reelPerfStr}
                    onChange={(e) => setReelPerfStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={upsertEntryMut.isPending}
                    className="h-8 text-xs bg-zinc-800 border-zinc-600 text-white tabular-nums px-2 focus:border-violet-500"
                  />
                </div>
                <div className="w-[5.5rem] shrink-0">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">Post baseline</p>
                  <Input type="number" step="0.01" value={postPerfStr}
                    onChange={(e) => setPostPerfStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={upsertEntryMut.isPending}
                    className="h-8 text-xs bg-zinc-800 border-zinc-600 text-white tabular-nums px-2 focus:border-violet-500"
                  />
                </div>
                {upsertEntryMut.isPending && (
                  <span className="text-[10px] text-violet-400 self-end pb-1">saving…</span>
                )}
              </div>

              {/* Topline links */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">Topline posts / reels</p>
                  {toplineItems.length > 0 && (
                    <span className="text-[10px] text-zinc-500">
                      Sum: <span className="text-zinc-300 font-bold tabular-nums">{fmt(toplineViewsSum)}</span>
                    </span>
                  )}
                </div>

                {toplineItems.length > 0 && (
                  <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2 space-y-1.5">
                    {toplineItems.slice().sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).map((item: any) => (
                      <ContentItemRow key={item.id} item={item}
                        onUpdate={(data) => updateMut.mutate({ id: item.id, data })}
                        onDelete={() => deleteMut.mutate(item.id)}
                      />
                    ))}
                  </div>
                )}

                {addMode ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Input value={newLink} onChange={(e) => setNewLink(e.target.value)}
                        placeholder="Instagram link…"
                        className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white flex-1 min-w-[160px]"
                      />
                      <Input type="number" min={0} value={newViews} onChange={(e) => setNewViews(e.target.value)}
                        placeholder="Views"
                        className="h-8 w-32 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums"
                      />
                      <Select value={newType} onValueChange={setNewType}>
                        <SelectTrigger className="h-8 w-[5.5rem] text-xs bg-zinc-800 border-zinc-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-800 border-zinc-700">
                          <SelectItem value="reel" className="text-white text-xs">Reel</SelectItem>
                          <SelectItem value="post" className="text-white text-xs">Post</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost"
                        onClick={() => { setAddMode(false); setNewLink(""); setNewViews(""); }}
                        className="h-7 text-xs text-zinc-400"
                      >Cancel</Button>
                      <Button size="sm" onClick={handleAdd}
                        disabled={!newLink || createMut.isPending}
                        className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                      >
                        {createMut.isPending ? "Adding…" : "Add link"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddMode(true)}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add topline link
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


/* ──────── Content Item Row ──────── */
function ContentItemRow({ item, onUpdate, onDelete }: {
  item: any;
  onUpdate: (data: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState(item.link || "");
  const [views, setViews] = useState(String(item.views || 0));
  const [type, setType] = useState(item.content_type || "reel");

  useEffect(() => {
    setLink(item.link || "");
    setViews(String(item.views || 0));
    setType(item.content_type || "reel");
  }, [item.id, item.link, item.views, item.content_type]);

  function save() {
    onUpdate({ link, views: Number(views), content_type: type });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white flex-1"
          />
          <Input
            type="number"
            value={views}
            onChange={(e) => setViews(e.target.value)}
            className="h-7 w-32 text-xs bg-zinc-800 border-zinc-700 text-white text-right tabular-nums"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-7 w-24 text-xs bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="reel" className="text-white text-xs">Reel</SelectItem>
              <SelectItem value="post" className="text-white text-xs">Post</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={save} className="h-7 text-xs bg-violet-600 hover:bg-violet-700 px-2">
            <Save className="w-3 h-3" />
          </Button>
          <button onClick={() => setEditing(false)} className="text-zinc-600 hover:text-zinc-400 text-xs px-1">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-zinc-800/30 transition-colors">
      <Badge variant="outline" className={`text-[9px] shrink-0 ${
        item.content_type === "reel" ? "border-purple-500/30 text-purple-400" : "border-emerald-500/30 text-emerald-400"
      }`}>
        {item.content_type === "reel" ? "Reel" : "Post"}
      </Badge>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-1 min-w-0 truncate flex-1"
      >
        <ExternalLink className="w-3 h-3 shrink-0" />
        <span className="truncate">{item.link?.replace(/https?:\/\/(www\.)?instagram\.com\//, "").slice(0, 40)}</span>
      </a>
      <span className="text-white font-bold text-xs tabular-nums shrink-0">{fmt(item.views || 0)}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-white text-xs px-1">Edit</button>
        <button onClick={onDelete} className="text-red-400/60 hover:text-red-400">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}


/* ──────── Reconcile View (month-end actuals) ──────── */
function ReconcileView({
  reconcileRows, monthDate, qc, userEmail, onSaved,
}: {
  reconcileRows: any[];
  monthDate: string;
  qc: any;
  userEmail: string;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const d: Record<string, string> = {};
    for (const p of reconcileRows) {
      d[p.page_id] = p.actual_views != null ? String(p.actual_views) : "";
    }
    setDrafts(d);
  }, [monthDate, reconcileRows]);

  const actualMut = useMutation({
    mutationFn: upsertSixDayActual,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      onSaved();
    },
  });

  function saveSingle(pageId: string) {
    const val = drafts[pageId];
    if (val === "") return;
    actualMut.mutate({
      month: monthDate,
      page_id: pageId,
      actual_views: Number(val) || 0,
      filled_by: userEmail,
    });
  }

  function saveAll() {
    for (const p of reconcileRows) {
      const val = drafts[p.page_id];
      if (val !== "" && val !== String(p.actual_views ?? "")) {
        actualMut.mutate({
          month: monthDate,
          page_id: p.page_id,
          actual_views: Number(val) || 0,
          filled_by: userEmail,
        });
      }
    }
  }

  const totalCycle = reconcileRows.reduce((s: number, p: any) => s + (p.cycle_views_sum || 0), 0);
  const totalActual = reconcileRows.reduce((s: number, p: any) => {
    const d = drafts[p.page_id];
    if (d !== undefined && d !== "") return s + (Number(d) || 0);
    return s + (p.actual_views ?? 0);
  }, 0);
  const totalDrift = totalActual - totalCycle;

  return (
    <div className="space-y-5">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-5 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-zinc-600" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Cycle Sum</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none">{fmt(totalCycle)}</p>
          <p className="text-xs text-zinc-600 mt-2">from all 5 cycles</p>
        </div>
        <div className="relative bg-zinc-900 border border-violet-500/20 rounded-2xl p-5 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-500" />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">IG Dashboard</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none">{totalActual > 0 ? fmt(totalActual) : "—"}</p>
          <p className="text-xs text-zinc-600 mt-2">actual monthly views</p>
        </div>
        <div className={`relative bg-zinc-900 rounded-2xl p-5 overflow-hidden border ${
          totalActual === 0 ? "border-zinc-800" : totalDrift > 0 ? "border-emerald-500/20" : totalDrift < 0 ? "border-red-500/20" : "border-zinc-800"
        }`}>
          <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
            totalActual === 0 ? "bg-zinc-700" : totalDrift > 0 ? "bg-emerald-500" : totalDrift < 0 ? "bg-red-500" : "bg-zinc-600"
          }`} />
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Drift</p>
          <p className={`text-3xl font-black tabular-nums leading-none ${
            totalActual === 0 ? "text-zinc-600" : totalDrift > 0 ? "text-emerald-400" : totalDrift < 0 ? "text-red-400" : "text-zinc-400"
          }`}>
            {totalActual > 0 ? (totalDrift > 0 ? "+" : "") + fmt(totalDrift) : "—"}
          </p>
          <p className="text-xs text-zinc-600 mt-2">dashboard vs cycles</p>
        </div>
      </div>

      {/* ── Reconciliation rows ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Monthly Reconciliation</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Enter actual IG dashboard totals — drift feeds the Growth chart</p>
          </div>
          <Button
            size="sm"
            onClick={saveAll}
            disabled={actualMut.isPending}
            className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20"
          >
            <Save className="w-3 h-3" /> Save All
          </Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-2.5 border-b border-zinc-800/60">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600">Page</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 text-right w-20">Cycle Sum</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 w-44">IG Dashboard</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 text-right w-24">Drift</p>
        </div>

        <div className="divide-y divide-zinc-800/50">
          {reconcileRows.map((p: any) => {
            const actual = drafts[p.page_id] !== "" ? Number(drafts[p.page_id]) : null;
            const drift = actual != null ? actual - (p.cycle_views_sum || 0) : null;
            const hasDraft = drafts[p.page_id] !== "" && drafts[p.page_id] !== undefined;

            return (
              <div key={p.page_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                {/* Page name */}
                <div className="min-w-0">
                  <span className="text-white font-semibold text-sm">{p.name || p.handle}</span>
                  <span className="text-zinc-600 text-xs ml-2">@{p.handle}</span>
                </div>

                {/* Cycle sum */}
                <div className="w-20 text-right">
                  <span className="text-zinc-400 text-sm tabular-nums font-medium">{fmt(p.cycle_views_sum || 0)}</span>
                </div>

                {/* Actual input */}
                <div className="w-44">
                  <Input
                    type="number"
                    value={drafts[p.page_id] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p.page_id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") saveSingle(p.page_id); }}
                    onBlur={() => { if (hasDraft) saveSingle(p.page_id); }}
                    placeholder="Enter views…"
                    className="h-8 w-full text-xs bg-zinc-800 border-zinc-600 text-white tabular-nums placeholder-zinc-600 focus:border-violet-500"
                  />
                </div>

                {/* Drift */}
                <div className="w-24 text-right">
                  {drift != null ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums px-2.5 py-1 rounded-full ${
                      drift > 0 ? "bg-emerald-500/10 text-emerald-400"
                      : drift < 0 ? "bg-red-500/10 text-red-400"
                      : "text-zinc-500"
                    }`}>
                      {drift > 0 ? <TrendingUp className="w-3 h-3" /> : drift < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                      {drift > 0 ? "+" : ""}{fmt(drift)}
                    </span>
                  ) : (
                    <span className="text-zinc-700 text-xs">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
