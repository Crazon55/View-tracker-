import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSixDayMonth, upsertSixDayEntry,
  createSixDayTopContent, updateSixDayTopContent, deleteSixDayTopContent,
  upsertSixDayActual, getSixDayDeadlines, getPages,
} from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditSixDayTracker } from "@/lib/permissions";
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

/** Active IP groups (replaces Garfields / Goofies / Sherus). */
/** Tech playbook (Chaithanya). */
const TECH_ACTIVE_HANDLES = ["indiantechdaily", "101xtechnology", "ai.cracked"] as const;
/** Bizz playbook (Pulkit). */
const BIZZ_PLAYBOOK_HANDLES = [
  "indiabusinesscom",
  "indiafounderscore",
  "indianfoundersco",
  "indiastartupstory",
] as const;
/** BIZZ brand page. */
const BIZZ_HANDLES = ["bizzindia"] as const;
const X101_HANDLES = ["101xfounders"] as const;
/** News playbook. */
const NEWS_PLAYBOOK_HANDLES = ["thechangingorder", "indiahappeningnow"] as const;
const FOUNDERS_HANDLES = ["foundersinindia", "foundersindex", "startupcoded"] as const;
/** Everything else still tracked, but filtered under Inactive. */
const INACTIVE_HANDLES = [
  "startupbydog",
  "indianbusinesscom",
  "entrepreneursindia.co",
  "therealfoundr",
  "elitefoundrs",
  "indiafounderbrief",
  "startupswtf",
] as const;

/** Legacy Garfields list — kept for historical Week 4 roster union only. */
const GARFIELD_WEEK4_HANDLES = [
  "indianfoundersco",
  "bizzindia",
  "startupbydog",
  "indianbusinesscom",
  "entrepreneursindia.co",
  "therealfoundr",
  "elitefoundrs",
  "foundersindex",
] as const;

/** Legacy Goofies — historical roster union only. */
const GOOFIES_ACTIVE_HANDLES = [
  "101xfounders",
  "foundersinindia",
  "startupcoded",
] as const;

/** Legacy Sherus — historical roster union only. */
const SHERUS_ACTIVE_HANDLES = [
  "thechangingorder",
  "101xtechnology",
  "startupswtf",
] as const;

const TECH_ROSTER_HANDLES = new Set<string>(TECH_ACTIVE_HANDLES.map((h) => normHandle(h)));

/** First month Tech IPs appear (Jun 2026, cycle 3 onward). */
const TECH_ROSTER_START_MONTH = "2026-06";
const TECH_ROSTER_FIRST_CYCLE_START = "2026-06-13";

function isOnOrAfterTechRosterStart(monthYm: string): boolean {
  return monthYm >= TECH_ROSTER_START_MONTH;
}

/** Jun 2026: cycles 3–5 only. Jul 2026+: all cycles every month. */
function techPagesVisible(monthYm: string, cycleStart: string): boolean {
  if (monthYm < TECH_ROSTER_START_MONTH) return false;
  if (monthYm === TECH_ROSTER_START_MONTH) {
    return cycleStart >= TECH_ROSTER_FIRST_CYCLE_START;
  }
  return true;
}

/** Legacy Experiment X handles — historical roster + inactive group. */
const EXPERIMENT_X_HANDLES = [
  "indianfoundersco",
  "indiastartupstory",
  "indiabusinesscom",
  "indiafounderscore",
  "indiafounderbrief",
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
  ...TECH_ACTIVE_HANDLES,
  ...BIZZ_PLAYBOOK_HANDLES,
  ...BIZZ_HANDLES,
  ...X101_HANDLES,
  ...NEWS_PLAYBOOK_HANDLES,
  ...FOUNDERS_HANDLES,
  ...INACTIVE_HANDLES,
]);

const ROSTER_CUTOFF_CYCLE3 = "2026-05-13";
const ROSTER_CUTOFF_CYCLE4 = "2026-05-19";

type TabMode = "cycles" | "reconcile";

export default function SixDayTracker() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role } = usePermissions();
  const canEdit = canEditSixDayTracker(role);
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

  const overdueCycles = deadlineData?.overdue_cycles || [];
  const pageSummaries = monthData?.page_summaries || [];
  const monthDate = monthData?.month_date || `${selectedMonth}-01`;

  /* Niche filter: map each page handle to a group bucket.
     Multi-select: empty set == "All". */
  type NicheKey = "tech" | "bizz_playbook" | "bizz" | "x101" | "news" | "founders" | "inactive";
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
    const m = new Map<string, NicheKey>();
    // Curated group assignment (source of truth for filters).
    for (const h of TECH_ACTIVE_HANDLES) m.set(h, "tech");
    for (const h of BIZZ_PLAYBOOK_HANDLES) m.set(h, "bizz_playbook");
    for (const h of BIZZ_HANDLES) m.set(h, "bizz");
    for (const h of X101_HANDLES) m.set(h, "x101");
    for (const h of NEWS_PLAYBOOK_HANDLES) m.set(h, "news");
    for (const h of FOUNDERS_HANDLES) m.set(h, "founders");
    for (const h of INACTIVE_HANDLES) m.set(h, "inactive");
    // Any other roster page without an explicit group lands in inactive.
    for (const h of ACTIVE_ROSTER_WEEK4) {
      if (!m.has(h)) m.set(h, "inactive");
    }
    return m;
  }, []);

  /* Full server page list — used for pre-cutoff cycles so old page views remain visible. */
  const allServerPages = useMemo(() => {
    const sp = monthData?.pages || [];
    if (sp.length > 0) return sp;
    return (allPagesRaw || []).map((p: any) => ({ id: p.id, handle: p.handle, name: p.name, stage: p.stage ?? 1 }));
  }, [monthData, allPagesRaw]);

  /* Active roster pages — Week 4 list (hardcoded), not DB-dependent. */
  const nichePages = useMemo(() => {
    let rosterPages = allServerPages.filter((p: any) => ACTIVE_ROSTER_WEEK4.has(normHandle(p.handle)));
    if (rosterPages.length === 0) {
      rosterPages = handleToNiche.size === 0
        ? allServerPages
        : allServerPages.filter((p: any) => handleToNiche.has(normHandle(p.handle)));
    }
    if (!isOnOrAfterTechRosterStart(selectedMonth)) {
      rosterPages = rosterPages.filter((p: any) => !TECH_ROSTER_HANDLES.has(normHandle(p.handle)));
    }
    return rosterPages;
  }, [allServerPages, handleToNiche, selectedMonth]);

  /* allPages drives the niche filter pill counts — always the niche list. */
  const allPages = nichePages;

  const nicheCounts = useMemo(() => {
    const c = {
      all: nichePages.length,
      tech: 0,
      bizz_playbook: 0,
      bizz: 0,
      x101: 0,
      news: 0,
      founders: 0,
      inactive: 0,
      none: 0,
    };
    for (const p of nichePages) {
      const key = handleToNiche.get(normHandle(p.handle));
      if (key === "tech") c.tech += 1;
      else if (key === "bizz_playbook") c.bizz_playbook += 1;
      else if (key === "bizz") c.bizz += 1;
      else if (key === "x101") c.x101 += 1;
      else if (key === "news") c.news += 1;
      else if (key === "founders") c.founders += 1;
      else if (key === "inactive") c.inactive += 1;
      else c.none += 1;
    }
    return c;
  }, [nichePages, handleToNiche]);

  /* pages = niche pages optionally filtered by active group pill. */
  const pages = useMemo(() => {
    if (isAllActive) return nichePages;
    return nichePages.filter((p: any) => {
      const key = handleToNiche.get(normHandle(p.handle));
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
    let list = applyTeamFilter(allServerPages.filter((p: any) => ACTIVE_ROSTER_WEEK4.has(normHandle(p.handle))));
    list = list.filter((p: any) => {
      if (!TECH_ROSTER_HANDLES.has(normHandle(p.handle))) return true;
      return techPagesVisible(selectedMonth, start);
    });
    return list;
  }, [allServerPages, handleToNiche, nicheFilterSet, isAllActive, selectedMonth]);

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
    <div className="min-h-screen six-day-page">
      <div className="six-day-page-inner">

        {/* ── Header ── */}
        <div className="six-day-header">
          <div>
            <div className="six-day-eyebrow">Content · Cycle tracking</div>
            <h1 className="six-day-title">6-Day Tracker</h1>
            <p className="six-day-lead">Auto-cycles from the 1st of every month</p>
          </div>
          <div className="six-day-seg shrink-0">
            {(["cycles", "reconcile"] as TabMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                className={tab === v ? "is-on" : ""}
              >
                {v === "cycles" ? "Cycles" : "Month-end fix"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overdue warning ── */}
        {overdueCycles.length > 0 && (
          <div className="six-day-alert">
            <div className="relative shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-200">
                {overdueCycles.length} cycle{overdueCycles.length > 1 ? "s" : ""} overdue
              </p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                {overdueCycles.map((c: any) =>
                  `Cycle ${c.cycle} (${fmtShort(c.start)}–${fmtShort(c.end)}): ${c.missing_count} IPs unfilled`
                ).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Month nav + total views ── */}
        <div className="six-day-toolbar six-day-glass-bar">
          <button type="button" onClick={() => shiftMonth(-1)} className="six-day-icon-btn" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-white w-36 text-center tracking-tight">{monthLabel}</h2>
          <button type="button" onClick={() => shiftMonth(1)} className="six-day-icon-btn" aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="flex items-baseline gap-1.5 pl-1">
            <span className="text-xl font-bold text-white tabular-nums tracking-tight">{fmt(totalCycleViews)}</span>
            <span className="text-[11px] fglass-muted font-medium">total views</span>
            {monthFetching && <span className="text-[10px] fglass-meta ml-1">updating…</span>}
          </div>
          <button
            type="button"
            onClick={() => setTab("reconcile")}
            className={`ml-auto fglass-filter-pill h-8 ${tab === "reconcile" ? "is-on" : ""}`}
          >
            Month-end correction
          </button>
        </div>

        {/* ── Niche filter ── */}
        <div className="six-day-filters six-day-glass-bar">
          <span className="six-day-filters-label">Filter by group</span>
          <button
            type="button"
            onClick={clearNiche}
            className={`fglass-filter-pill${isAllActive ? " is-on" : ""}`}
          >
            All <span className={`tabular-nums text-[10px] ${isAllActive ? "opacity-90" : "fglass-meta"}`}>{nicheCounts.all}</span>
          </button>
          {([
            { key: "tech", label: "Tech playbook", emoji: "⚡", count: nicheCounts.tech, on: "is-on-cyan" },
            { key: "bizz_playbook", label: "Bizz playbook", emoji: "💼", count: nicheCounts.bizz_playbook, on: "is-on-orange" },
            { key: "bizz", label: "BIZZ", emoji: "🏷️", count: nicheCounts.bizz, on: "is-on-amber" },
            { key: "x101", label: "101x", emoji: "⭐", count: nicheCounts.x101, on: "is-on-violet" },
            { key: "news", label: "News playbook", emoji: "📰", count: nicheCounts.news, on: "is-on-rose" },
            { key: "founders", label: "Founders", emoji: "🚀", count: nicheCounts.founders, on: "is-on-sky" },
            { key: "inactive", label: "Inactive", emoji: "💤", count: nicheCounts.inactive, on: "is-on" },
          ] as const).map((opt) => {
            const isActive = nicheFilterSet.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleNiche(opt.key)}
                aria-pressed={isActive}
                className={`fglass-filter-pill${isActive ? ` ${opt.on}` : ""}`}
              >
                <span aria-hidden>{opt.emoji}</span>
                {opt.label}
                <span className={`tabular-nums text-[10px] ${isActive ? "opacity-90" : "fglass-meta"}`}>{opt.count}</span>
              </button>
            );
          })}
          {nicheCounts.none > 0 && isAllActive && (
            <span className="text-[10px] fglass-meta ml-auto">
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
              <div className="rounded-2xl fglass-panel border-0 p-8 text-center text-sm text-zinc-500">
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
                canEdit={canEdit}
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
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}

function fmtShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const GALLERY_COLS = 3;
function galleryRows<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += GALLERY_COLS) rows.push(items.slice(i, i + GALLERY_COLS));
  return rows;
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
  cycle, pages, allowedPageIds, monthDate, expanded, onToggle, qc, userEmail, selectedMonth, onDataChange, canEdit,
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
  canEdit: boolean;
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
    ? { bar: "bg-emerald-500/70", border: "border-white/[0.04]", badge: "bg-emerald-500/10 text-emerald-400/90", progress: "bg-emerald-500/80" }
    : cycle.status === "active"
      ? { bar: "bg-amber-500/70", border: "border-white/[0.04]", badge: "bg-amber-500/10 text-amber-400/90", progress: "bg-amber-500/80" }
      : { bar: "bg-white/10", border: "border-white/[0.04]", badge: "bg-white/5 text-zinc-500", progress: "bg-white/15" };

  const fillPct = pages.length > 0 ? Math.round((filledCount / pages.length) * 100) : 0;
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const openPage = openPageId ? pages.find((p: any) => String(p.id) === openPageId) : null;

  useEffect(() => {
    if (!expanded) setOpenPageId(null);
  }, [expanded]);

  function togglePage(pageId: string) {
    setOpenPageId((prev) => (prev === pageId ? null : pageId));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative fglass-cycle border ${accent.border} overflow-hidden`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accent.bar}`} />

      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between pl-6 pr-5 py-5 text-left hover:bg-black/20 transition-colors"
      >
        <div className="flex items-center gap-4">
          {cycle.status === "done"
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            : cycle.status === "active"
              ? <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              : <Clock className="w-4 h-4 text-zinc-600 shrink-0" />}
          <div>
            <span className="text-white font-bold text-base">Cycle {cycle.cycle}</span>
            <span className="fglass-muted text-xs ml-3">{fmtShort(cycle.start)} — {fmtShort(cycle.end)}</span>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${accent.badge}`}>
            {cycle.status === "done" ? "Done" : cycle.status === "active" ? "Active" : "Upcoming"}
          </span>
        </div>

        <div className="flex items-center gap-8">
          {/* Views */}
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider fglass-label mb-0.5">Views</p>
            <p className="text-xl font-black text-white tabular-nums leading-none">{fmt(totalViews)}</p>
          </div>

          {/* IPs Filled + progress bar */}
          <div className="hidden sm:block text-right min-w-[80px]">
            <p className="text-[10px] uppercase tracking-wider fglass-label mb-0.5">IPs Filled</p>
            <p className="text-sm font-bold text-white leading-none">
              {filledCount}<span className="fglass-meta">/{pages.length}</span>
            </p>
            <div className="mt-2 h-1 w-20 bg-white/8 rounded-full overflow-hidden">
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
            <div className="border-t fglass-divider">
              <div className="six-day-gallery">
                {galleryRows(pages).map((row, rowIdx) => {
                  const rowHasOpen = openPageId != null && row.some((p: any) => String(p.id) === openPageId);
                  return (
                    <Fragment key={rowIdx}>
                      <div className="six-day-gallery-row">
                        {row.map((p: any) => (
                          <IPGalleryChip
                            key={p.id}
                            page={p}
                            cycle={cycle}
                            selected={openPageId === String(p.id)}
                            onSelect={() => togglePage(String(p.id))}
                          />
                        ))}
                      </div>
                      <AnimatePresence>
                        {rowHasOpen && openPage && (
                          <motion.div
                            key={openPage.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.16 }}
                            className="six-day-gallery-sheet"
                          >
                            <IPDetailSheet
                              page={openPage}
                              cycle={cycle}
                              monthDate={monthDate}
                              selectedMonth={selectedMonth}
                              qc={qc}
                              userEmail={userEmail}
                              onDataChange={onDataChange}
                              canEdit={canEdit}
                              onClose={() => setOpenPageId(null)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/* ──────── Gallery chip (collapsed tile in grid) ──────── */
function IPGalleryChip({
  page, cycle, selected, onSelect,
}: {
  page: any;
  cycle: any;
  selected: boolean;
  onSelect: () => void;
}) {
  const entry = (cycle.entries || []).find((e: any) => String(e.page_id) === String(page.id));
  const toplineItems = (cycle.top_content || []).filter((t: any) => t.page_id === page.id);
  const hasData =
    (!!entry && ((entry.views ?? 0) > 0 || entry.reel_pct != null || entry.post_pct != null || entry.reel_perf != null || entry.post_perf != null))
    || toplineItems.length > 0;

  const views = Number(entry?.views ?? 0);
  const reelPct = entry?.reel_pct != null && entry.reel_pct !== "" ? entry.reel_pct : null;
  const postPct = entry?.post_pct != null && entry.post_pct !== "" ? entry.post_pct : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`fglass-chip${selected ? " fglass-chip-on" : ""}`}
    >
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasData ? "bg-emerald-400/75" : "bg-zinc-500/55"}`} />
      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-white/88 truncate leading-tight">
          {page.name || page.handle}
        </span>
        <span className="block text-[11px] fglass-muted truncate">@{page.handle}</span>
      </div>
      {(views > 0 || reelPct != null || postPct != null) && (
        <div className="flex flex-col items-end gap-1 shrink-0 mr-0.5">
          {views > 0 && (
            <span className="text-[12px] font-bold text-white tabular-nums leading-none">{fmt(views)}</span>
          )}
          {(reelPct != null || postPct != null) && (
            <div className="flex items-center gap-1">
              {reelPct != null && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 leading-none tabular-nums">R {reelPct}%</span>
              )}
              {postPct != null && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 leading-none tabular-nums">P {postPct}%</span>
              )}
            </div>
          )}
        </div>
      )}
      <ChevronDown className={`w-3.5 h-3.5 shrink-0 fglass-muted opacity-80 transition-transform duration-200 ${selected ? "rotate-180" : ""}`} />
    </button>
  );
}


/* ──────── IP detail sheet (opens below gallery) ──────── */
function IPDetailSheet({
  page, cycle, monthDate, selectedMonth, qc, userEmail, onDataChange, canEdit, onClose,
}: {
  page: any;
  cycle: any;
  monthDate: string;
  selectedMonth: string;
  qc: any;
  userEmail: string;
  onDataChange: () => void;
  canEdit: boolean;
  onClose: () => void;
}) {
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

  /** Auto-save on close — only if dirty AND there's actual data worth persisting */
  function saveIfDirty() {
    if (!isDirty()) return;
    const hasActualData = Number(weekViews) > 0 || reelPctStr !== "" || postPctStr !== "" || reelPerfStr !== "" || postPerfStr !== "";
    if (hasActualData) saveEntry();
  }

  useEffect(() => () => saveIfDirty(), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const views = entry?.views || 0;

  return (
    <div className="fglass-sheet overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b fglass-divider">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white/90 truncate">{page.name || page.handle}</div>
          <div className="text-xs fglass-muted truncate">@{page.handle}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {views > 0 && <span className="text-sm font-bold text-white/80 tabular-nums">{fmt(views)}</span>}
          <button
            type="button"
            onClick={() => { saveIfDirty(); onClose(); }}
            className="p-1.5 rounded-lg fglass-muted hover:text-white/75 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <ChevronDown className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

              {/* Input grid */}
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="w-[7.5rem] shrink-0">
                  <p className="text-[9px] uppercase fglass-label mb-1">Total</p>
                  <Input type="number" min={0} value={weekViews}
                    onChange={(e) => setWeekViews(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={!canEdit || upsertEntryMut.isPending}
                    className="h-8 text-xs fglass-input tabular-nums px-2"
                  />
                </div>
                <div className="w-[3.75rem] shrink-0">
                  <p className="text-[9px] uppercase fglass-label mb-1">Reel %</p>
                  <Input type="number" min={0} max={100} value={reelPctStr}
                    onChange={(e) => setReelPctStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={!canEdit || upsertEntryMut.isPending}
                    className="h-8 text-xs fglass-input tabular-nums px-2"
                  />
                </div>
                <div className="w-[3.75rem] shrink-0">
                  <p className="text-[9px] uppercase fglass-label mb-1">Post %</p>
                  <Input type="number" min={0} max={100} value={postPctStr}
                    onChange={(e) => setPostPctStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={!canEdit || upsertEntryMut.isPending}
                    className="h-8 text-xs fglass-input tabular-nums px-2"
                  />
                </div>
                <div className="w-[5.5rem] shrink-0">
                  <p className="text-[9px] uppercase fglass-label mb-1">Reel baseline</p>
                  <Input type="number" step="0.01" value={reelPerfStr}
                    onChange={(e) => setReelPerfStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={!canEdit || upsertEntryMut.isPending}
                    className="h-8 text-xs fglass-input tabular-nums px-2"
                  />
                </div>
                <div className="w-[5.5rem] shrink-0">
                  <p className="text-[9px] uppercase fglass-label mb-1">Post baseline</p>
                  <Input type="number" step="0.01" value={postPerfStr}
                    onChange={(e) => setPostPerfStr(e.target.value)}
                    onBlur={() => saveEntry()}
                    disabled={!canEdit || upsertEntryMut.isPending}
                    className="h-8 text-xs fglass-input tabular-nums px-2"
                  />
                </div>
                {upsertEntryMut.isPending && (
                  <span className="text-[10px] fglass-muted self-end pb-1">saving…</span>
                )}
              </div>

              {/* Topline links */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase fglass-label font-semibold">Topline posts / reels</p>
                  {toplineItems.length > 0 && (
                    <span className="text-[10px] fglass-muted">
                      Sum: <span className="text-zinc-300 font-bold tabular-nums">{fmt(toplineViewsSum)}</span>
                    </span>
                  )}
                </div>

                {toplineItems.length > 0 && (
                  <div className="rounded-lg border border-white/12 bg-white/[0.02] backdrop-blur-sm p-2 space-y-1.5">
                    {toplineItems.slice().sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).map((item: any) => (
                      <ContentItemRow key={item.id} item={item} canEdit={canEdit}
                        onUpdate={(data) => updateMut.mutate({ id: item.id, data })}
                        onDelete={() => deleteMut.mutate(item.id)}
                      />
                    ))}
                  </div>
                )}

                {canEdit && (addMode ? (
                  <div className="fglass rounded-lg p-3 space-y-2 border-0">
                    <div className="flex flex-wrap gap-2">
                      <Input value={newLink} onChange={(e) => setNewLink(e.target.value)}
                        placeholder="Instagram link…"
                        className="h-8 text-xs fglass-input flex-1 min-w-[160px]"
                      />
                      <Input type="number" min={0} value={newViews} onChange={(e) => setNewViews(e.target.value)}
                        placeholder="Views"
                        className="h-8 w-32 text-xs fglass-input tabular-nums"
                      />
                      <Select value={newType} onValueChange={setNewType}>
                        <SelectTrigger className="h-8 w-[5.5rem] text-xs fglass-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#121218]/95 border-white/10 backdrop-blur-xl">
                          <SelectItem value="reel" className="text-white text-xs">Reel</SelectItem>
                          <SelectItem value="post" className="text-white text-xs">Post</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost"
                        onClick={() => { setAddMode(false); setNewLink(""); setNewViews(""); }}
                        className="h-7 text-xs text-zinc-500 hover:text-zinc-300"
                      >Cancel</Button>
                      <Button size="sm" onClick={handleAdd}
                        disabled={!newLink || createMut.isPending}
                        className="h-7 text-xs bg-white/10 hover:bg-white/15 text-white border border-white/12"
                      >
                        {createMut.isPending ? "Adding…" : "Add link"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddMode(true)}
                    className="flex items-center gap-1.5 text-xs fglass-muted hover:text-zinc-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add topline link
                  </button>
                ))}
              </div>
      </div>
    </div>
  );
}


/* ──────── Content Item Row ──────── */
function ContentItemRow({ item, onUpdate, onDelete, canEdit }: {
  item: any;
  onUpdate: (data: Record<string, any>) => void;
  onDelete: () => void;
  canEdit?: boolean;
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
        {canEdit && (
          <>
        <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-white text-xs px-1">Edit</button>
        <button onClick={onDelete} className="text-red-400/60 hover:text-red-400">
          <Trash2 className="w-3 h-3" />
        </button>
          </>
        )}
      </div>
    </div>
  );
}


/* ──────── Reconcile View (month-end actuals) ──────── */
function ReconcileView({
  reconcileRows, monthDate, qc, userEmail, onSaved, canEdit,
}: {
  reconcileRows: any[];
  monthDate: string;
  qc: any;
  userEmail: string;
  onSaved: () => void;
  canEdit: boolean;
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
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const togglePage = (id: string) => setOpenPageId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-4">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="six-day-stat-card">
          <p className="six-day-stat-label">Cycle Sum</p>
          <p className="six-day-stat-value">{fmt(totalCycle)}</p>
          <p className="six-day-stat-sub">from all 5 cycles</p>
        </div>
        <div className="six-day-stat-card six-day-stat-card--accent">
          <p className="six-day-stat-label">IG Dashboard</p>
          <p className="six-day-stat-value">{totalActual > 0 ? fmt(totalActual) : "—"}</p>
          <p className="six-day-stat-sub">actual monthly views</p>
        </div>
        <div className={`six-day-stat-card${
          totalActual === 0 ? "" : totalDrift > 0 ? " six-day-stat-card--up" : totalDrift < 0 ? " six-day-stat-card--down" : ""
        }`}>
          <p className="six-day-stat-label">Drift</p>
          <p className={`six-day-stat-value ${
            totalActual === 0 ? "fglass-meta" : totalDrift > 0 ? "text-emerald-400" : totalDrift < 0 ? "text-red-400" : "text-zinc-300"
          }`}>
            {totalActual > 0 ? (totalDrift > 0 ? "+" : "") + fmt(totalDrift) : "—"}
          </p>
          <p className="six-day-stat-sub">dashboard vs cycles</p>
        </div>
      </div>

      {/* ── Gallery header ── */}
      <div className="six-day-glass-bar flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight">Monthly Reconciliation</h3>
          <p className="text-xs fglass-muted mt-0.5">Enter actual IG dashboard totals — drift feeds the Growth chart</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={saveAll}
            disabled={actualMut.isPending}
            className="fglass-filter-pill is-on h-8 shrink-0"
          >
            <Save className="w-3 h-3" />
            Save All
          </button>
        )}
      </div>

      {/* ── Page gallery ── */}
      <div className="six-day-reconcile-gallery">
        {galleryRows(reconcileRows).map((row, rowIdx) => {
          const rowHasOpen = openPageId != null && row.some((p: any) => String(p.page_id) === openPageId);
          const openPage = rowHasOpen ? row.find((p: any) => String(p.page_id) === openPageId) : null;
          return (
            <Fragment key={rowIdx}>
              <div className="six-day-gallery-row">
                {row.map((p: any) => {
                  const raw = drafts[p.page_id];
                  const actual = raw !== "" && raw !== undefined ? Number(raw) : null;
                  const drift = actual != null && !Number.isNaN(actual) ? actual - (p.cycle_views_sum || 0) : null;
                  return (
                    <ReconcileGalleryChip
                      key={p.page_id}
                      page={p}
                      cycleSum={p.cycle_views_sum || 0}
                      drift={drift}
                      selected={openPageId === String(p.page_id)}
                      onSelect={() => togglePage(String(p.page_id))}
                    />
                  );
                })}
              </div>
              <AnimatePresence>
                {rowHasOpen && openPage && (
                  <motion.div
                    key={openPage.page_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16 }}
                    className="six-day-gallery-sheet"
                  >
                    <ReconcileDetailSheet
                      page={openPage}
                      draft={drafts[openPage.page_id] ?? ""}
                      onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [openPage.page_id]: v }))}
                      onSave={() => saveSingle(openPage.page_id)}
                      canEdit={canEdit}
                      isSaving={actualMut.isPending}
                      onClose={() => setOpenPageId(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ReconcileGalleryChip({
  page, cycleSum, drift, selected, onSelect,
}: {
  page: any;
  cycleSum: number;
  drift: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasActual = drift != null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`fglass-chip${selected ? " fglass-chip-on" : ""}`}
    >
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasActual ? "bg-violet-400/80" : "bg-zinc-500/55"}`} />
      <div className="flex-1 min-w-0 text-left">
        <span className="block text-[13px] font-medium text-white/88 truncate leading-tight">
          {page.name || page.handle}
        </span>
        <span className="block text-[11px] fglass-muted truncate">@{page.handle}</span>
        <span className="block text-[10px] fglass-muted mt-1 tabular-nums">
          Cycle {fmt(cycleSum)}
          {drift != null && (
            <span className={drift > 0 ? " text-emerald-400/90" : drift < 0 ? " text-red-400/90" : ""}>
              {" · "}{drift > 0 ? "+" : ""}{fmt(drift)} drift
            </span>
          )}
        </span>
      </div>
      <ChevronDown className={`w-3.5 h-3.5 shrink-0 fglass-muted opacity-80 transition-transform duration-200 ${selected ? "rotate-180" : ""}`} />
    </button>
  );
}

function ReconcileDetailSheet({
  page, draft, onDraftChange, onSave, canEdit, isSaving, onClose,
}: {
  page: any;
  draft: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  canEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
}) {
  const cycleSum = page.cycle_views_sum || 0;
  const actual = draft !== "" && draft !== undefined ? Number(draft) : null;
  const drift = actual != null && !Number.isNaN(actual) ? actual - cycleSum : null;
  const hasDraft = draft !== "" && draft !== undefined;

  return (
    <div className="fglass-sheet overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b fglass-divider">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{page.name || page.handle}</div>
          <div className="text-xs fglass-muted truncate">@{page.handle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg fglass-muted hover:text-white/75 hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <p className="text-[9px] uppercase fglass-label mb-1">Cycle sum</p>
          <p className="text-lg font-bold text-white tabular-nums">{fmt(cycleSum)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <p className="text-[9px] uppercase fglass-label mb-1">IG dashboard</p>
          <Input
            type="number"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (canEdit && e.key === "Enter") onSave(); }}
            onBlur={() => { if (canEdit && hasDraft) onSave(); }}
            disabled={!canEdit || isSaving}
            placeholder="Enter views…"
            className="h-9 w-full text-sm fglass-input tabular-nums mt-0.5"
          />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 flex flex-col justify-center">
          <p className="text-[9px] uppercase fglass-label mb-1">Drift</p>
          {drift != null ? (
            <span className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${
              drift > 0 ? "text-emerald-400" : drift < 0 ? "text-red-400" : "text-zinc-400"
            }`}>
              {drift > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : drift < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
              {drift > 0 ? "+" : ""}{fmt(drift)}
            </span>
          ) : (
            <span className="text-sm fglass-meta">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
