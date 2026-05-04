import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getSixDayMonth, upsertSixDayEntry,
  createSixDayTopContent, updateSixDayTopContent, deleteSixDayTopContent,
  upsertSixDayActual, getSixDayDeadlines, getPages,
  getSixDayConfig, setSixDayConfig, getTrackerNiches,
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
  const serverPages = monthData?.pages || [];
  const allPages = serverPages.length > 0
    ? serverPages
    : (allPagesRaw || []).map((p: any) => ({ id: p.id, handle: p.handle, name: p.name, stage: p.stage ?? 1 }));
  const pageSummaries = monthData?.page_summaries || [];
  const monthDate = monthData?.month_date || `${selectedMonth}-01`;

  /* Niche filter: map each page handle to a niche bucket (garfields / goofies / tech).
     Niches come from tracker_niches; we match by substring on the niche name.
     Multi-select: empty set == "All" (show everything). Otherwise show only
     pages whose niche is in the selected set. */
  type NicheKey = "garfields" | "goofies" | "tech";
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
    const m = new Map<string, "garfields" | "goofies" | "tech">();
    for (const n of nichesRaw || []) {
      const nm = String(n?.name || "").toLowerCase();
      let bucket: "garfields" | "goofies" | "tech" | null = null;
      if (nm.includes("garfields")) bucket = "garfields";
      else if (nm.includes("goofies")) bucket = "goofies";
      else if (nm.includes("tech")) bucket = "tech";
      if (!bucket) continue;
      for (const h of n?.pages || []) {
        if (h) m.set(String(h).replace(/^@/, "").trim().toLowerCase(), bucket);
      }
    }
    return m;
  }, [nichesRaw]);

  const nicheCounts = useMemo(() => {
    const c = { all: allPages.length, garfields: 0, goofies: 0, tech: 0, none: 0 };
    for (const p of allPages) {
      const key = handleToNiche.get(String(p.handle || "").replace(/^@/, "").trim().toLowerCase());
      if (key === "garfields") c.garfields += 1;
      else if (key === "goofies") c.goofies += 1;
      else if (key === "tech") c.tech += 1;
      else c.none += 1;
    }
    return c;
  }, [allPages, handleToNiche]);

  const pages = useMemo(() => {
    if (isAllActive) return allPages;
    return allPages.filter((p: any) => {
      const key = handleToNiche.get(String(p.handle || "").replace(/^@/, "").trim().toLowerCase());
      return !!key && nicheFilterSet.has(key);
    });
  }, [allPages, handleToNiche, nicheFilterSet, isAllActive]);

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

  const { data: configData } = useQuery<any>({
    queryKey: ["six-day-config"],
    queryFn: getSixDayConfig,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const assignedEmailSaved: string = configData?.data?.assigned_email || "";
  const [assignedEmailInput, setAssignedEmailInput] = useState("");
  useEffect(() => {
    setAssignedEmailInput(assignedEmailSaved || "");
  }, [assignedEmailSaved]);
  const configMut = useMutation({
    mutationFn: setSixDayConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-config"] });
    },
  });
  function saveAssignee() {
    const email = assignedEmailInput.trim().toLowerCase();
    if (email === (assignedEmailSaved || "").toLowerCase()) return;
    configMut.mutate({ assigned_email: email, assigned_role: configData?.data?.assigned_role || "" });
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
              6-Day Tracker
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Auto-cycles from the 1st of every month
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
              {(["cycles", "reconcile"] as TabMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setTab(v)}
                  className={`text-[10px] uppercase tracking-wider px-4 py-1.5 rounded-full font-medium transition-all ${
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

        {overdueCycles.length > 0 && (
          <div className="mb-5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-300">
                {overdueCycles.length} cycle{overdueCycles.length > 1 ? "s" : ""} overdue
                {assignedEmailSaved && (
                  <span className="ml-2 text-[10px] font-medium text-amber-400/80 uppercase tracking-wider">
                    · pinging {assignedEmailSaved}
                  </span>
                )}
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                {overdueCycles.map((c: any) =>
                  `Cycle ${c.cycle} (${fmtShort(c.start)}–${fmtShort(c.end)}): ${c.missing_count} IPs unfilled`
                ).join(" · ")}
              </p>
            </div>
          </div>
        )}

        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold shrink-0">
            Overdue pings to
          </span>
          <Input
            type="email"
            placeholder="e.g. aditi@owledmedia.com"
            value={assignedEmailInput}
            onChange={(e) => setAssignedEmailInput(e.target.value)}
            onBlur={saveAssignee}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white max-w-xs"
          />
          {assignedEmailSaved && (
            <span className="text-[10px] text-zinc-500">
              Saved — her notifications panel will show overdue cycles.
            </span>
          )}
          {configMut.isPending && <span className="text-[10px] text-zinc-500">Saving…</span>}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-white min-w-[180px] text-center">{monthLabel}</h2>
          <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs ml-2">
            {fmt(totalCycleViews)} total views
          </Badge>
          {monthFetching && (
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Updating…</span>
          )}
        </div>

        {/* Niche filter (multi-select: click to toggle, All clears) */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mr-1">
            Filter by niche
          </span>
          <button
            onClick={clearNiche}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold transition-all ${
              isAllActive
                ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            <span>All</span>
            <span className={`text-[10px] tabular-nums ${isAllActive ? "opacity-80" : "text-zinc-500"}`}>
              {nicheCounts.all}
            </span>
          </button>
          {([
            { key: "garfields", label: "Garfields", emoji: "🐱", count: nicheCounts.garfields, active: "bg-gradient-to-r from-orange-500 to-amber-500 text-zinc-900 border-orange-400 shadow-lg shadow-orange-500/25" },
            { key: "goofies", label: "Goofies", emoji: "🐶", count: nicheCounts.goofies, active: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/25" },
            { key: "tech", label: "Tech", emoji: "💻", count: nicheCounts.tech, active: "bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-900 border-emerald-400 shadow-lg shadow-emerald-500/25" },
          ] as const).map((opt) => {
            const isActive = nicheFilterSet.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggleNiche(opt.key)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold transition-all ${
                  isActive
                    ? opt.active
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
              >
                {opt.emoji && <span aria-hidden>{opt.emoji}</span>}
                <span>{opt.label}</span>
                <span className={`text-[10px] tabular-nums ${isActive ? "opacity-80" : "text-zinc-500"}`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
          {!isAllActive && (
            <span className="text-[11px] text-zinc-500 ml-1">
              Showing <span className="text-white font-semibold">{pages.length}</span> account{pages.length === 1 ? "" : "s"}
              <button
                onClick={clearNiche}
                className="ml-2 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white underline-offset-2 hover:underline"
              >
                Clear
              </button>
            </span>
          )}
          {nicheCounts.none > 0 && isAllActive && (
            <span className="text-[10px] text-zinc-600 ml-auto italic">
              {nicheCounts.none} account{nicheCounts.none === 1 ? "" : "s"} not in a niche yet
            </span>
          )}
        </div>

        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-zinc-400">
            <span className="text-white font-medium">Month-end:</span> Enter Instagram dashboard totals to fix drift vs cycle sums. Same numbers feed the <span className="text-violet-400">Growth</span> chart after you save.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            className={`shrink-0 border-0 bg-violet-600 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700 ${
              tab === "reconcile" ? "ring-2 ring-violet-400/40" : ""
            }`}
            onClick={() => setTab("reconcile")}
          >
            Open month-end correction
          </Button>
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
            {pages.length > 0 && cycles.map((cycle: any) => (
              <CycleCard
                key={cycle.cycle}
                cycle={cycle}
                pages={pages}
                allowedPageIds={allowedPageIds}
                monthDate={monthDate}
                expanded={expandedCycle === cycle.cycle}
                onToggle={() => setExpandedCycle(expandedCycle === cycle.cycle ? null : cycle.cycle)}
                qc={qc}
                userEmail={user?.email || ""}
                selectedMonth={selectedMonth}
                onDataChange={invalidateSixDayAndGrowth}
              />
            ))}
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
    if (!allowedPageIds) {
      return typeof cycle.filled_count === "number" ? cycle.filled_count : allEntries.length;
    }
    // Filtered view: an IP is "filled" if it has an entry OR any top-content row in this cycle
    const filled = new Set<string>();
    for (const e of entries) if (e.page_id) filled.add(e.page_id);
    for (const t of allTopContent) {
      if (t.page_id && allowedPageIds.has(t.page_id)) filled.add(t.page_id);
    }
    return filled.size;
  })();

  const statusIcon = cycle.status === "done"
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    : cycle.status === "active"
      ? <Clock className="w-4 h-4 text-amber-400" />
      : <Clock className="w-4 h-4 text-zinc-600" />;

  const statusColor = cycle.status === "done"
    ? "border-emerald-500/20"
    : cycle.status === "active"
      ? "border-amber-500/30"
      : "border-zinc-800";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-zinc-900 border ${statusColor} rounded-2xl overflow-hidden`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {statusIcon}
          <div>
            <span className="text-white font-bold text-sm sm:text-base">
              Cycle {cycle.cycle}
            </span>
            <span className="text-zinc-500 text-sm ml-3">
              {fmtShort(cycle.start)} — {fmtShort(cycle.end)}
            </span>
          </div>
          <Badge variant="outline" className={`text-[10px] ml-2 ${
            cycle.status === "done" ? "border-emerald-500/30 text-emerald-400"
              : cycle.status === "active" ? "border-amber-500/30 text-amber-400"
                : "border-zinc-700 text-zinc-500"
          }`}>
            {cycle.status === "done" ? "Done" : cycle.status === "active" ? "Active" : "Upcoming"}
          </Badge>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-zinc-500">Views</p>
            <p className="text-lg font-black text-white tabular-nums">{fmt(totalViews)}</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-zinc-500">IPs Filled</p>
            <p className="text-sm font-bold text-zinc-300">
              {filledCount}/{pages.length}
            </p>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
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


/* ──────── IP row: weekly inputs + topline links (same card) ──────── */
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
  /** True once we've seen a server row for this IP/cycle — used to ignore brief `entry === undefined` during refetch. */
  const sawServerEntryRef = useRef(false);

  /**
   * Hydrate inputs from `entry` when switching IP/cycle/month, or when a row first appears.
   * Do not reset when `entry` flickers undefined mid-refetch (same row) — that was clearing Reel/Post %.
   */
  useEffect(() => {
    if (rowKeyRef.current !== rowKey) {
      rowKeyRef.current = rowKey;
      sawServerEntryRef.current = false;
    }

    if (sawServerEntryRef.current && !entry) {
      return;
    }
    if (entry) sawServerEntryRef.current = true;

    setWeekViews(String((entry?.views as number | undefined) ?? 0));
    setReelPctStr(entry?.reel_pct != null && entry.reel_pct !== "" ? String(entry.reel_pct) : "");
    setPostPctStr(entry?.post_pct != null && entry.post_pct !== "" ? String(entry.post_pct) : "");
    setReelPerfStr(entry?.reel_perf != null && entry.reel_perf !== "" ? String(entry.reel_perf) : "");
    setPostPerfStr(entry?.post_perf != null && entry.post_perf !== "" ? String(entry.post_perf) : "");
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
      qc.invalidateQueries({ queryKey: ["growth-data"] });
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

  const createMut = useMutation({
    mutationFn: createSixDayTopContent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      onDataChange();
      setNewLink("");
      setNewViews("");
      setNewType("reel");
      setAddMode(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      updateSixDayTopContent(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      onDataChange();
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSixDayTopContent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      onDataChange();
    },
  });

  function handleAdd() {
    if (!newLink) return;
    createMut.mutate({
      month: monthDate,
      cycle_number: cycle.cycle,
      link: newLink,
      views: Number(newViews) || 0,
      page_id: page.id,
      page_handle: page.handle,
      content_type: newType,
    });
  }

  const hasData = !!entry || toplineItems.length > 0;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
      <div className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3 xl:gap-2">
          <div className="flex items-center gap-2 min-w-0 xl:w-[200px] shrink-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${hasData ? "bg-emerald-400" : "bg-zinc-700"}`} />
            <div className="min-w-0">
              <span className="text-white font-semibold text-sm truncate block">{page.name || page.handle}</span>
              <span className="text-zinc-600 text-[10px]">@{page.handle}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-2 gap-y-2 flex-1 xl:justify-end">
            <div className="w-[7.5rem] shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">Total</p>
              <Input
                type="number"
                min={0}
                value={weekViews}
                onChange={(e) => setWeekViews(e.target.value)}
                onBlur={() => saveEntry()}
                disabled={upsertEntryMut.isPending}
                className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums px-2"
              />
            </div>
            <div className="w-[3.75rem] shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">Reel %</p>
              <Input
                type="number"
                min={0}
                max={100}
                value={reelPctStr}
                onChange={(e) => setReelPctStr(e.target.value)}
                onBlur={() => saveEntry()}
                disabled={upsertEntryMut.isPending}
                className="h-7 text-xs bg-zinc-800 border-zinc-700 text-purple-300 tabular-nums px-2"
              />
            </div>
            <div className="w-[3.75rem] shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">Post %</p>
              <Input
                type="number"
                min={0}
                max={100}
                value={postPctStr}
                onChange={(e) => setPostPctStr(e.target.value)}
                onBlur={() => saveEntry()}
                disabled={upsertEntryMut.isPending}
                className="h-7 text-xs bg-zinc-800 border-zinc-700 text-emerald-300 tabular-nums px-2"
              />
            </div>
            <div className="w-[5.5rem] shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">Reel baseline</p>
              <Input
                type="number"
                step="0.01"
                value={reelPerfStr}
                onChange={(e) => setReelPerfStr(e.target.value)}
                onBlur={() => saveEntry()}
                disabled={upsertEntryMut.isPending}
                className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums px-2"
              />
            </div>
            <div className="w-[5.5rem] shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">Post baseline</p>
              <Input
                type="number"
                step="0.01"
                value={postPerfStr}
                onChange={(e) => setPostPerfStr(e.target.value)}
                onBlur={() => saveEntry()}
                disabled={upsertEntryMut.isPending}
                className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums px-2"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800/90 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Topline posts / reels
            </p>
            {toplineItems.length > 0 && (
              <span className="text-[10px] text-zinc-500">
                Sum of link views: <span className="text-zinc-300 font-bold tabular-nums">{fmt(toplineViewsSum)}</span>
              </span>
            )}
          </div>

          {toplineItems.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2">
              {toplineItems
                .slice()
                .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
                .map((item: any) => (
                  <ContentItemRow
                    key={item.id}
                    item={item}
                    onUpdate={(data) => updateMut.mutate({ id: item.id, data })}
                    onDelete={() => deleteMut.mutate(item.id)}
                  />
                ))}
            </div>
          )}

          {toplineItems.length === 0 && !addMode && (
            <p className="text-xs text-zinc-600 text-center py-1">No topline links yet — add Instagram URLs below.</p>
          )}

          {addMode ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="Instagram link…"
                  className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white flex-1 min-w-[160px]"
                />
                <Input
                  type="number"
                  min={0}
                  value={newViews}
                  onChange={(e) => setNewViews(e.target.value)}
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddMode(false); setNewLink(""); setNewViews(""); }}
                  className="h-7 text-xs text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newLink || createMut.isPending}
                  className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                >
                  {createMut.isPending ? "Adding…" : "Add link"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddMode(true)}
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add topline link
            </button>
          )}
        </div>
      </div>
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
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Cycle Sum</p>
          <p className="text-2xl font-black text-white tabular-nums">{fmt(totalCycle)}</p>
          <p className="text-xs text-zinc-600 mt-1">from all 5 cycles</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">IG Dashboard</p>
          <p className="text-2xl font-black text-white tabular-nums">{totalActual > 0 ? fmt(totalActual) : "—"}</p>
          <p className="text-xs text-zinc-600 mt-1">actual monthly views</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Drift</p>
          <p className={`text-2xl font-black tabular-nums ${
            totalDrift > 0 ? "text-emerald-400" : totalDrift < 0 ? "text-red-400" : "text-zinc-500"
          }`}>
            {totalActual > 0 ? (totalDrift > 0 ? "+" : "") + fmt(totalDrift) : "—"}
          </p>
          <p className="text-xs text-zinc-600 mt-1">dashboard vs cycles</p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Monthly Reconciliation</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Enter the actual IG dashboard views to correct any drift from viral content
            </p>
          </div>
          <Button
            size="sm"
            onClick={saveAll}
            disabled={actualMut.isPending}
            className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700"
          >
            <Save className="w-3 h-3" /> Save All
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-3">IP</th>
                <th className="text-right py-2 px-2">Cycle Sum</th>
                <th className="text-left py-2 px-2 w-36">Actual (IG Dashboard)</th>
                <th className="text-right py-2 px-2">Drift</th>
                <th className="py-2 pl-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {reconcileRows.map((p: any) => {
                const actual = drafts[p.page_id] !== "" ? Number(drafts[p.page_id]) : null;
                const drift = actual != null ? actual - (p.cycle_views_sum || 0) : null;
                return (
                  <tr key={p.page_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="text-white font-medium">{p.name || p.handle}</span>
                      <span className="text-zinc-600 text-xs ml-2">@{p.handle}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-400 tabular-nums">
                      {fmt(p.cycle_views_sum || 0)}
                    </td>
                    <td className="py-2.5 px-2">
                      <Input
                        type="number"
                        value={drafts[p.page_id] ?? ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [p.page_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") saveSingle(p.page_id); }}
                        placeholder="Enter actual views"
                        className="h-8 w-32 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {drift != null ? (
                        <span className={`text-xs font-bold flex items-center justify-end gap-1 ${
                          drift > 0 ? "text-emerald-400" : drift < 0 ? "text-red-400" : "text-zinc-500"
                        }`}>
                          {drift > 0 ? <TrendingUp className="w-3 h-3" /> : drift < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {drift > 0 ? "+" : ""}{fmt(drift)}
                        </span>
                      ) : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                    <td className="py-2.5 pl-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => saveSingle(p.page_id)}
                        disabled={actualMut.isPending}
                        className="h-7 text-[10px] text-zinc-400 hover:text-white"
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
