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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, TrendingUp, TrendingDown, ExternalLink,
  ChevronDown, ChevronUp, BarChart3, CheckCircle2, Clock,
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
  const cycles = monthData?.cycles || [];
  const pages = monthData?.pages || [];
  const pageSummaries = monthData?.page_summaries || [];
  const monthDate = monthData?.month_date || `${selectedMonth}-01`;

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
        {/* Header */}
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

        {/* Overdue deadline banner */}
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

        {/* Month navigator */}
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
  cycle, pages, monthDate, expanded, onToggle, qc, userEmail,
}: {
  cycle: any;
  pages: any[];
  monthDate: string;
  expanded: boolean;
  onToggle: () => void;
  qc: any;
  userEmail: string;
}) {
  const entries: any[] = cycle.entries || [];
  const topContent: any[] = cycle.top_content || [];

  const totalViews = entries.reduce((s: number, e: any) => s + (e.views || 0), 0);
  const filledCount = entries.length;

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
            <p className="text-xs text-zinc-500">Filled</p>
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
            <div className="border-t border-zinc-800 p-5 sm:p-6 space-y-6">
              {/* Entry fill form */}
              <CycleFillForm
                cycle={cycle}
                pages={pages}
                entries={entries}
                monthDate={monthDate}
                qc={qc}
                userEmail={userEmail}
              />

              {/* Top Content */}
              <TopContentSection
                topContent={topContent}
                monthDate={monthDate}
                cycleNumber={cycle.cycle}
                pages={pages}
                qc={qc}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/* ──────── Cycle Fill Form (all IPs at once) ──────── */
function CycleFillForm({
  cycle, pages, entries, monthDate, qc, userEmail,
}: {
  cycle: any;
  pages: any[];
  entries: any[];
  monthDate: string;
  qc: any;
  userEmail: string;
}) {
  const entryMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const e of entries) m[e.page_id] = e;
    return m;
  }, [entries]);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const p of pages) {
      const existing = entryMap[p.id];
      d[p.id] = existing ? String(existing.views || 0) : "";
    }
    return d;
  });

  const bulkMut = useMutation({
    mutationFn: bulkSaveSixDayEntries,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
  });

  function saveAll() {
    const items = pages
      .filter((p: any) => drafts[p.id] !== "")
      .map((p: any) => ({ page_id: p.id, views: Number(drafts[p.id]) || 0 }));
    if (items.length === 0) return;
    bulkMut.mutate({
      month: monthDate,
      cycle_number: cycle.cycle,
      filled_by: userEmail,
      entries: items,
    });
  }

  const singleMut = useMutation({
    mutationFn: upsertSixDayEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
  });

  function saveSingle(pageId: string) {
    const views = Number(drafts[pageId]) || 0;
    singleMut.mutate({
      month: monthDate,
      cycle_number: cycle.cycle,
      page_id: pageId,
      views,
      filled_by: userEmail,
    });
  }

  const hasChanges = pages.some((p: any) => {
    const existing = entryMap[p.id];
    const draft = drafts[p.id];
    if (!existing && draft !== "" && draft !== "0") return true;
    if (existing && String(existing.views || 0) !== draft) return true;
    return false;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Views per IP
        </h3>
        <Button
          size="sm"
          onClick={saveAll}
          disabled={!hasChanges || bulkMut.isPending}
          className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-40"
        >
          <Save className="w-3 h-3" />
          {bulkMut.isPending ? "Saving..." : "Save All"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-2 pr-3">IP</th>
              <th className="text-left py-2 px-2 w-32">Views (6 days)</th>
              <th className="text-left py-2 px-2">Status</th>
              <th className="py-2 pl-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p: any) => {
              const existing = entryMap[p.id];
              const isFilled = !!existing;
              return (
                <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                  <td className="py-2.5 pr-3">
                    <span className="text-white font-medium">{p.name || p.handle}</span>
                    <span className="text-zinc-600 text-xs ml-2">@{p.handle}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <Input
                      type="number"
                      value={drafts[p.id] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveSingle(p.id); }}
                      placeholder="0"
                      className="h-8 w-28 text-xs bg-zinc-800 border-zinc-700 text-white tabular-nums"
                    />
                  </td>
                  <td className="py-2.5 px-2">
                    {isFilled ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Filled
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => saveSingle(p.id)}
                      disabled={singleMut.isPending}
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
  );
}


/* ──────── Top Content Section ──────── */
function TopContentSection({
  topContent, monthDate, cycleNumber, pages, qc,
}: {
  topContent: any[];
  monthDate: string;
  cycleNumber: number;
  pages: any[];
  qc: any;
}) {
  const createMut = useMutation({
    mutationFn: createSixDayTopContent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["six-day-month"] }),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Top 5–10 Reels / Posts
        </h3>
        <AddTopContentDialog
          monthDate={monthDate}
          cycleNumber={cycleNumber}
          pages={pages}
          onAdd={(d) => createMut.mutate(d)}
        />
      </div>
      {topContent.length === 0 ? (
        <p className="text-xs text-zinc-600 py-4 text-center">No top content added yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-3">Link</th>
                <th className="text-right py-2 px-2">Views</th>
                <th className="text-left py-2 px-2">Page</th>
                <th className="text-left py-2 px-2">Type</th>
                <th className="py-2 pl-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {topContent
                .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
                .map((item: any) => (
                  <TopContentRow
                    key={item.id}
                    item={item}
                    onUpdate={(id, data) => updateMut.mutate({ id, data })}
                    onDelete={(id) => deleteMut.mutate(id)}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


/* ──────── Top Content Row ──────── */
function TopContentRow({ item, onUpdate, onDelete }: {
  item: any;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState(item.link || "");
  const [views, setViews] = useState(String(item.views || 0));
  const [handle, setHandle] = useState(item.page_handle || "");
  const [type, setType] = useState(item.content_type || "reel");

  function save() {
    onUpdate(item.id, { link, views: Number(views), page_handle: handle, content_type: type });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-zinc-800/50 bg-zinc-800/20">
        <td className="py-2 pr-3">
          <Input value={link} onChange={(e) => setLink(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700 text-white" />
        </td>
        <td className="py-2 px-1">
          <Input value={views} onChange={(e) => setViews(e.target.value)} className="h-7 w-20 text-xs bg-zinc-800 border-zinc-700 text-white text-right ml-auto" />
        </td>
        <td className="py-2 px-1">
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} className="h-7 w-24 text-xs bg-zinc-800 border-zinc-700 text-white" />
        </td>
        <td className="py-2 px-1">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-7 w-20 text-xs bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="reel" className="text-white">Reel</SelectItem>
              <SelectItem value="post" className="text-white">Post</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="py-2 pl-2 flex items-center gap-1">
          <Button size="sm" onClick={save} className="h-7 text-xs bg-violet-600 hover:bg-violet-700">Save</Button>
          <button onClick={() => setEditing(false)} className="text-zinc-600 hover:text-zinc-400 text-xs ml-1">x</button>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className="border-b border-zinc-800/50 hover:bg-zinc-800/20 cursor-pointer transition-colors group"
      onClick={() => setEditing(true)}
    >
      <td className="py-2.5 pr-3">
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-violet-400 hover:text-violet-300 text-xs flex items-center gap-1 max-w-[200px] truncate"
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          {item.link?.replace(/https?:\/\/(www\.)?instagram\.com\//, "").slice(0, 30)}
        </a>
      </td>
      <td className="py-2.5 px-2 text-right text-white tabular-nums font-semibold">{fmt(item.views || 0)}</td>
      <td className="py-2.5 px-2 text-zinc-400 text-xs">{item.page_handle ? `@${item.page_handle}` : "—"}</td>
      <td className="py-2.5 px-2">
        <Badge variant="outline" className={`text-[10px] ${
          item.content_type === "reel" ? "border-purple-500/30 text-purple-400" : "border-emerald-500/30 text-emerald-400"
        }`}>
          {item.content_type === "reel" ? "Reel" : "Post"}
        </Badge>
      </td>
      <td className="py-2.5 pl-2">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}


/* ──────── Add Top Content Dialog ──────── */
function AddTopContentDialog({
  monthDate, cycleNumber, pages, onAdd,
}: {
  monthDate: string;
  cycleNumber: number;
  pages: any[];
  onAdd: (d: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [views, setViews] = useState("0");
  const [handle, setHandle] = useState("");
  const [type, setType] = useState("reel");

  function handleAdd() {
    if (!link) return;
    onAdd({ month: monthDate, cycle_number: cycleNumber, link, views: Number(views), page_handle: handle, content_type: type });
    setOpen(false);
    setLink(""); setViews("0"); setHandle(""); setType("reel");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs border-zinc-700 text-zinc-400 hover:text-white hover:border-violet-500/50">
          <Plus className="w-3 h-3" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader><DialogTitle>Add Top Reel / Post</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Link</label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" placeholder="https://www.instagram.com/reel/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Views</label>
              <Input value={views} onChange={(e) => setViews(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Page</label>
              <Select value={handle} onValueChange={setHandle}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {pages.map((p: any) => (
                    <SelectItem key={p.id} value={p.handle} className="text-white">@{p.handle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="reel" className="text-white">Reel</SelectItem>
                <SelectItem value="post" className="text-white">Post</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!link} className="w-full bg-violet-600 hover:bg-violet-700">Add</Button>
        </div>
      </DialogContent>
    </Dialog>
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
      {/* Summary cards */}
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
