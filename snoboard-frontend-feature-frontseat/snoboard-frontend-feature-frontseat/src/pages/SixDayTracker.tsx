import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSixDayMonth, bulkSaveSixDayEntries, upsertSixDayEntry,
  createSixDayTopContent, updateSixDayTopContent, deleteSixDayTopContent,
  upsertSixDayActual, getSixDayDeadlines,
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

  const { data: monthData, isLoading } = useQuery({
    queryKey: ["six-day-month", selectedMonth],
    queryFn: () => getSixDayMonth(selectedMonth),
  });

  const { data: deadlineData } = useQuery({
    queryKey: ["six-day-deadlines"],
    queryFn: getSixDayDeadlines,
    refetchInterval: 120_000,
  });

  const overdueCycles = deadlineData?.overdue_cycles || [];
  const pages = monthData?.pages || [];
  const pageSummaries = monthData?.page_summaries || [];
  const monthDate = monthData?.month_date || `${selectedMonth}-01`;

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

  const totalCycleViews = pageSummaries.reduce((s: number, p: any) => s + (p.cycle_views_sum || 0), 0);

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
                  {v === "cycles" ? "Cycles" : "Reconcile"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {overdueCycles.length > 0 && (
          <div className="mb-5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-300">
                {overdueCycles.length} cycle{overdueCycles.length > 1 ? "s" : ""} overdue
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                {overdueCycles.map((c: any) =>
                  `Cycle ${c.cycle} (${fmtShort(c.start)}–${fmtShort(c.end)}): ${c.missing_count} IPs unfilled`
                ).join(" · ")}
              </p>
            </div>
          </div>
        )}

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
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "cycles" ? (
          <div className="space-y-3">
            {cycles.map((cycle: any) => (
              <CycleCard
                key={cycle.cycle}
                cycle={cycle}
                pages={pages}
                monthDate={monthDate}
                expanded={expandedCycle === cycle.cycle}
                onToggle={() => setExpandedCycle(expandedCycle === cycle.cycle ? null : cycle.cycle)}
                qc={qc}
                userEmail={user?.email || ""}
                selectedMonth={selectedMonth}
              />
            ))}
          </div>
        ) : (
          <ReconcileView
            pageSummaries={pageSummaries}
            monthDate={monthDate}
            qc={qc}
            userEmail={user?.email || ""}
          />
        )}
      </div>
    </div>
  );
}

function fmtShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}


/* ──────── Cycle Card ──────── */
function CycleCard({
  cycle, pages, monthDate, expanded, onToggle, qc, userEmail, selectedMonth,
}: {
  cycle: any;
  pages: any[];
  monthDate: string;
  expanded: boolean;
  onToggle: () => void;
  qc: any;
  userEmail: string;
  selectedMonth: string;
}) {
  const allContent: any[] = cycle.top_content || [];
  const totalViews = allContent.reduce((s: number, t: any) => s + (t.views || 0), 0);
  const filledPages = new Set(allContent.map((t: any) => t.page_id).filter(Boolean));

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
              {filledPages.size}/{pages.length}
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
                  qc={qc}
                  userEmail={userEmail}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/* ──────── IP Dropdown (one per page inside a cycle) ──────── */
function IPDropdown({
  page, cycle, monthDate, qc, userEmail,
}: {
  page: any;
  cycle: any;
  monthDate: string;
  qc: any;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [newViews, setNewViews] = useState("");
  const [newType, setNewType] = useState("reel");

  const allContent: any[] = cycle.top_content || [];
  const items = allContent.filter((t: any) => t.page_id === page.id);
  const totalViews = items.reduce((s: number, t: any) => s + (t.views || 0), 0);

  const createMut = useMutation({
    mutationFn: createSixDayTopContent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["six-day-month"] });
      setNewLink("");
      setNewViews("");
      setNewType("reel");
      setAddMode(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      updateSixDayTopContent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSixDayTopContent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
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

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${items.length > 0 ? "bg-emerald-400" : "bg-zinc-700"}`} />
          <span className="text-white font-semibold text-sm truncate">{page.name || page.handle}</span>
          <span className="text-zinc-600 text-xs">@{page.handle}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <span className="text-white font-bold text-sm tabular-nums">{fmt(totalViews)}</span>
            <span className="text-zinc-600 text-xs ml-1.5">{items.length} item{items.length !== 1 ? "s" : ""}</span>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
              {items.length > 0 && (
                <div className="space-y-1.5">
                  {items
                    .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
                    .map((item: any) => (
                      <ContentItemRow
                        key={item.id}
                        item={item}
                        onUpdate={(data) => updateMut.mutate({ id: item.id, data })}
                        onDelete={() => deleteMut.mutate(item.id)}
                      />
                    ))}
                  <div className="flex justify-end pt-1">
                    <span className="text-xs text-zinc-500">Total: <span className="text-white font-bold">{fmt(totalViews)}</span></span>
                  </div>
                </div>
              )}

              {items.length === 0 && !addMode && (
                <p className="text-xs text-zinc-600 text-center py-2">No content added yet</p>
              )}

              {addMode ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                      placeholder="Instagram link..."
                      className="h-8 text-xs bg-zinc-800 border-zinc-700 text-white flex-1"
                    />
                    <Input
                      type="number"
                      value={newViews}
                      onChange={(e) => setNewViews(e.target.value)}
                      placeholder="Views"
                      className="h-8 w-24 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums"
                    />
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger className="h-8 w-20 text-xs bg-zinc-800 border-zinc-700 text-white">
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
                      {createMut.isPending ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddMode(true)}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors px-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add reel / post
                </button>
              )}
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

  function save() {
    onUpdate({ link, views: Number(views), content_type: type });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-2">
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white flex-1"
        />
        <Input
          type="number"
          value={views}
          onChange={(e) => setViews(e.target.value)}
          className="h-7 w-24 text-xs bg-zinc-800 border-zinc-700 text-white text-right tabular-nums"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-7 w-20 text-xs bg-zinc-800 border-zinc-700 text-white">
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
    );
  }

  return (
    <div className="flex items-center gap-3 group px-2 py-1.5 rounded-lg hover:bg-zinc-800/30 transition-colors">
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
  pageSummaries, monthDate, qc, userEmail,
}: {
  pageSummaries: any[];
  monthDate: string;
  qc: any;
  userEmail: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const p of pageSummaries) {
      d[p.page_id] = p.actual_views != null ? String(p.actual_views) : "";
    }
    return d;
  });

  const actualMut = useMutation({
    mutationFn: upsertSixDayActual,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
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
    for (const p of pageSummaries) {
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

  const totalCycle = pageSummaries.reduce((s: number, p: any) => s + (p.cycle_views_sum || 0), 0);
  const totalActual = pageSummaries.reduce((s: number, p: any) => s + (p.actual_views || 0), 0);
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
              {pageSummaries.map((p: any) => {
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
