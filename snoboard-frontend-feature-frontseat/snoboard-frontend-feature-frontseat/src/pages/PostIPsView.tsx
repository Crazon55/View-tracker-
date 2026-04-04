import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllContentEntries, createContentEntry, updateContentEntry, deleteContentEntry, getPages } from "@/services/api";
import type { Page } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { ExternalLink, Plus, Trash2, Pencil, Check, X, Calendar, Table2, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const IDEA_STATUSES = [
  { value: "idea", label: "Idea", color: "bg-zinc-600/30 text-zinc-300" },
  { value: "approved", label: "Approved", color: "bg-amber-700/30 text-amber-400" },
  { value: "edited", label: "Edited", color: "bg-zinc-500/30 text-zinc-300" },
  { value: "ready_to_upload", label: "Ready to upload", color: "bg-yellow-500/30 text-yellow-400" },
  { value: "scheduled", label: "Scheduled", color: "bg-green-500/30 text-green-400" },
  { value: "uploaded", label: "Uploaded", color: "bg-purple-500/30 text-purple-400" },
  { value: "skipped", label: "Skipped", color: "bg-red-500/30 text-red-400" },
  { value: "posted", label: "Posted", color: "bg-emerald-500/20 text-emerald-400" },
];

const STATUS_COLORS: Record<string, string> = Object.fromEntries(IDEA_STATUSES.map((s) => [s.value, s.color]));

export default function PostIPsView() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [filterPage, setFilterPage] = useState("all");

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // Chart month filter
  const [chartMonth, setChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Table month filter
  const [tableMonthDate, setTableMonthDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const tableMonth = `${tableMonthDate.year}-${String(tableMonthDate.month + 1).padStart(2, "0")}`;

  // Form state
  const [form, setForm] = useState({
    idea_name: "", content_type: "carousel", idea_status: "idea",
    upload_date: "", frame_link: "", comp_link: "",
    views: "", url: "", notes: "", ips: "", page_id: "",
  });

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ["content-entries", "posts"],
    queryFn: () => getAllContentEntries("carousel,static"),
  });

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const stage3Pages = allPages.filter((p) => (p.stage ?? 1) === 3);

  // Filter entries by selected page
  const entries = filterPage === "all"
    ? allEntries
    : allEntries.filter((e: any) => e.ips?.toLowerCase() === filterPage || allPages.find((p) => p.id === e.page_id)?.handle?.toLowerCase() === filterPage);

  const createMut = useMutation({
    mutationFn: createContentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", "posts"] });
      toast.success("Entry added");
      setAddOpen(false);
      setForm({ idea_name: "", content_type: "carousel", idea_status: "idea", upload_date: "", frame_link: "", comp_link: "", views: "", url: "", notes: "", ips: "", page_id: "" });
    },
    onError: () => toast.error("Failed to add entry"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateContentEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", "posts"] });
      toast.success("Updated");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteContentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", "posts"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.idea_name.trim()) return;
    if (!form.page_id) { toast.error("Please select a page"); return; }
    createMut.mutate({
      page_id: form.page_id,
      idea_name: form.idea_name.trim(),
      content_type: form.content_type,
      idea_status: form.idea_status,
      upload_date: form.upload_date || undefined,
      created_by: userName,
      frame_link: form.frame_link || undefined,
      comp_link: form.comp_link || undefined,
      views: form.views ? Number(form.views) : 0,
      url: form.url || undefined,
      notes: form.notes || undefined,
      ips: form.ips || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalViews = entries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);

  // Top 3 for chart month
  const chartMonthEntries = entries.filter((e: any) => (e.upload_date || "")?.slice(0, 7) === chartMonth);
  const top3 = [...chartMonthEntries].sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 3);

  // Calendar helpers
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const monthName = new Date(calYear, calMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  function getEntriesForDay(day: number) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return entries.filter((e: any) => (e.upload_date || "")?.slice(0, 10) === dateStr);
  }

  function getPageHandle(entry: any): string {
    if (entry.ips) return entry.ips;
    const page = allPages.find((p) => p.id === entry.page_id);
    return page?.handle || "—";
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Post IPs</h1>
            <p className="text-zinc-500 mt-1">Carousel & static posts across all main IPs — ideas, calendar, and performance</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Page filter */}
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="All IPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All IPs</SelectItem>
                {stage3Pages.map((p) => (
                  <SelectItem key={p.id} value={p.handle.toLowerCase()}>@{p.handle}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View toggle */}
            <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
              <button onClick={() => setViewMode("table")} className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${viewMode === "table" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                <Table2 className="w-3.5 h-3.5" /> Table
              </button>
              <button onClick={() => setViewMode("calendar")} className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${viewMode === "calendar" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                <Calendar className="w-3.5 h-3.5" /> Calendar
              </button>
            </div>

            {/* Add new */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                  <Plus className="w-4 h-4 mr-2" /> New Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Post Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3 mt-2">
                  <div className="space-y-1.5">
                    <Label>Page (IP)</Label>
                    <Select value={form.page_id} onValueChange={(v) => {
                      const page = allPages.find((p) => p.id === v);
                      setForm({ ...form, page_id: v, ips: page?.handle || "" });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select IP" /></SelectTrigger>
                      <SelectContent>
                        {stage3Pages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>@{p.handle} {p.name ? `(${p.name})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Idea Name</Label>
                    <Input value={form.idea_name} onChange={(e) => setForm({ ...form, idea_name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Content Type</Label>
                      <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="carousel">Carousel</SelectItem>
                          <SelectItem value="static">Static</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={form.idea_status} onValueChange={(v) => setForm({ ...form, idea_status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {IDEA_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Upload Date</Label>
                    <Input type="date" value={form.upload_date} onChange={(e) => setForm({ ...form, upload_date: e.target.value })} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="cursor-pointer" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Frame Link</Label>
                      <Input value={form.frame_link} onChange={(e) => setForm({ ...form, frame_link: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Comp Link</Label>
                      <Input value={form.comp_link} onChange={(e) => setForm({ ...form, comp_link: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Views</Label>
                      <Input type="number" value={form.views} onChange={(e) => setForm({ ...form, views: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Instagram URL</Label>
                      <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createMut.isPending}>
                    {createMut.isPending ? "Adding..." : "Add Entry"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-3 mb-8">
          <Badge className="bg-zinc-800 text-zinc-400">{entries.length} entries</Badge>
          <Badge className="bg-violet-500/20 text-violet-400">{formatCompact(totalViews)} views</Badge>
          <Badge className="bg-emerald-500/20 text-emerald-400">{entries.filter((e: any) => e.idea_status === "posted").length} posted</Badge>
          <Badge className="bg-green-500/20 text-green-400">{entries.filter((e: any) => e.idea_status === "scheduled").length} scheduled</Badge>
        </div>

        {/* Top 3 Podium */}
        {top3.length >= 3 && (() => {
          const podiumOrder = [top3[1], top3[0], top3[2]];
          const heights = [120, 160, 95];
          const medals = ["\u{1F948}", "\u{1F947}", "\u{1F949}"];
          const ranks = [2, 1, 3];
          const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
          const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];

          return (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xl">{"\u{1F3C6}"}</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">Top 3 Posts</h3>
              </div>
              <div className="flex items-end justify-center gap-3 sm:gap-5">
                {podiumOrder.map((entry: any, i: number) => (
                  <a key={entry.id} href={entry.url} target="_blank" rel="noopener noreferrer"
                    className={`transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}>
                    <span className={`text-2xl sm:text-3xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                      {medals[i]}
                    </span>
                    <p className="text-[10px] text-zinc-500 mb-1 truncate max-w-full text-center">
                      {getPageHandle(entry)}
                    </p>
                    <p className="text-[9px] text-violet-400 mb-2 truncate max-w-full">
                      {entry.idea_name}
                    </p>
                    <div className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} flex flex-col items-center justify-center`} style={{ height: heights[i] }}>
                      <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                        {(entry.views ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">views</span>
                    </div>
                  </a>
                ))}
              </div>
              <div className="max-w-sm mx-auto h-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full" />
            </div>
          );
        })()}

        {/* Views per day line chart */}
        {entries.length > 0 && (() => {
          const viewsByDate: Record<string, number> = {};
          for (const e of entries) {
            const d = (e.upload_date || "")?.slice(0, 10);
            if (!d || !d.startsWith(chartMonth)) continue;
            viewsByDate[d] = (viewsByDate[d] || 0) + (e.views ?? 0);
          }

          const [cy, cm] = chartMonth.split("-").map(Number);
          const daysCount = new Date(cy, cm, 0).getDate();
          const chartData = [];
          for (let day = 1; day <= daysCount; day++) {
            const dateStr = `${chartMonth}-${String(day).padStart(2, "0")}`;
            chartData.push({
              name: new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
              views: viewsByDate[dateStr] || 0,
            });
          }

          const chartMonthLabel = new Date(cy, cm - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          const monthTotal = chartData.reduce((s, d) => s + d.views, 0);

          function prevMonth() {
            const [y, m] = chartMonth.split("-").map(Number);
            const d = new Date(y, m - 2, 1);
            setChartMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          }
          function nextMonth() {
            const [y, m] = chartMonth.split("-").map(Number);
            const d = new Date(y, m, 1);
            setChartMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          }

          return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-violet-400" />
                  <h3 className="text-sm uppercase tracking-[0.2em] text-zinc-400 font-semibold">Views per Day</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{formatCompact(monthTotal)} total</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium text-white min-w-[120px] text-center">{chartMonthLabel}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 9 }} interval={1} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                    labelStyle={{ color: "#d4d4d8", fontSize: 12 }}
                    formatter={(value: number) => [value.toLocaleString() + " views", ""]}
                  />
                  <Line type="monotone" dataKey="views" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 2, fill: "#a855f7" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        {/* TABLE VIEW */}
        {viewMode === "table" && (() => {
          const filteredEntries = entries.filter((e: any) => (e.upload_date || e.created_at || "")?.slice(0, 7) === tableMonth);
          const filteredViews = filteredEntries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
          const tableMonthLabel = new Date(tableMonthDate.year, tableMonthDate.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

          function prevTableMonth() {
            setTableMonthDate((prev) => {
              if (prev.month === 0) return { year: prev.year - 1, month: 11 };
              return { ...prev, month: prev.month - 1 };
            });
          }
          function nextTableMonth() {
            setTableMonthDate((prev) => {
              if (prev.month === 11) return { year: prev.year + 1, month: 0 };
              return { ...prev, month: prev.month + 1 };
            });
          }

          return (
            <>
              {/* Month filter */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevTableMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-bold text-white min-w-[140px] text-center">{tableMonthLabel}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextTableMonth}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-xs text-zinc-500">
                  <span className="text-white font-bold">{filteredEntries.length}</span> entries · <span className="text-white font-bold">{filteredViews.toLocaleString()}</span> views
                </div>
              </div>

              <div className="border border-zinc-800 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Idea Name</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Type</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Status</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Upload Date</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Created By</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">IPs</th>
                      <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Views</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Links</th>
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.length === 0 ? (
                      <tr><td colSpan={9} className="text-center text-zinc-500 py-12">{entries.length === 0 ? 'No post entries yet. Click "New Entry" to add content.' : "No entries for this month."}</td></tr>
                    ) : filteredEntries.map((entry: any) => {
                      const isEditing = editingId === entry.id;
                      return (
                        <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Input className="h-7 text-xs w-40" value={editData.idea_name ?? entry.idea_name} onChange={(e) => setEditData({ ...editData, idea_name: e.target.value })} />
                            ) : (
                              <span className="font-medium text-white max-w-[200px] truncate block">{entry.idea_name}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Select value={editData.content_type ?? entry.content_type} onValueChange={(v) => setEditData({ ...editData, content_type: v })}>
                                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="carousel">Carousel</SelectItem>
                                  <SelectItem value="static">Static</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs uppercase text-zinc-500">{entry.content_type}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Select value={editData.idea_status ?? entry.idea_status} onValueChange={(v) => setEditData({ ...editData, idea_status: v })}>
                                <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {IDEA_STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className={`text-[10px] cursor-pointer ${STATUS_COLORS[entry.idea_status] ?? ""}`}
                                onClick={() => { setEditingId(entry.id); setEditData({ ...entry }); }}>
                                {IDEA_STATUSES.find((s) => s.value === entry.idea_status)?.label || entry.idea_status}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Input type="date" className="h-7 text-xs w-32 cursor-pointer" value={(editData.upload_date ?? entry.upload_date ?? "").slice(0, 10)} onChange={(e) => setEditData({ ...editData, upload_date: e.target.value })} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} />
                            ) : (
                              <span className="text-zinc-400 text-xs">{entry.upload_date?.slice(0, 10) || "\u2014"}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Input className="h-7 text-xs w-28" value={editData.created_by ?? entry.created_by ?? ""} onChange={(e) => setEditData({ ...editData, created_by: e.target.value })} />
                            ) : (
                              <span className="text-zinc-400 text-xs">{entry.created_by || "\u2014"}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Select value={editData.ips ?? entry.ips ?? ""} onValueChange={(v) => {
                                const matchedPage = allPages.find((p) => p.handle === v);
                                setEditData({ ...editData, ips: v, page_id: matchedPage?.id || editData.page_id });
                              }}>
                                <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Select IP" /></SelectTrigger>
                                <SelectContent>
                                  {allPages.map((p) => (
                                    <SelectItem key={p.id} value={p.handle}>@{p.handle}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-zinc-400 text-xs max-w-[120px] truncate block">{getPageHandle(entry)}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isEditing ? (
                              <Input type="number" className="h-7 w-24 text-right text-xs" value={editData.views ?? entry.views} onChange={(e) => setEditData({ ...editData, views: Number(e.target.value) })} />
                            ) : (
                              <span className="font-mono font-bold text-white tabular-nums">{(entry.views ?? 0).toLocaleString()}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <Input className="h-7 text-xs w-40" placeholder="Instagram URL" value={editData.url ?? entry.url ?? ""} onChange={(e) => setEditData({ ...editData, url: e.target.value })} />
                            ) : (
                              <div className="flex items-center gap-1">
                                {entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300"><ExternalLink className="w-3.5 h-3.5" /></a>}
                                {entry.frame_link && <a href={entry.frame_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-[9px]">Frame</a>}
                                {entry.comp_link && <a href={entry.comp_link} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 text-[9px]">Comp</a>}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-400" onClick={() => updateMut.mutate({ id: entry.id, data: editData })}><Check className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-white" onClick={() => { setEditingId(entry.id); setEditData({ ...entry }); }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => deleteMut.mutate(entry.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {/* CALENDAR VIEW */}
        {viewMode === "calendar" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{monthName}</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-zinc-400" onClick={() => { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()); }}>Today</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs text-zinc-500 font-medium py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} className="min-h-[100px] bg-zinc-950/30 rounded-lg" />;
                const dayEntries = getEntriesForDay(day);
                const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();

                return (
                  <div key={day} className={`min-h-[100px] bg-zinc-950/30 rounded-lg p-2 ${isToday ? "ring-1 ring-violet-500" : ""}`}>
                    <span className={`text-xs font-medium ${isToday ? "text-violet-400" : "text-zinc-500"}`}>{day}</span>
                    <div className="mt-1 space-y-1">
                      {dayEntries.map((entry: any) => (
                        <div key={entry.id} className="bg-zinc-800/80 rounded px-2 py-1 cursor-pointer hover:bg-zinc-700/80 transition-colors"
                          onClick={() => { setEditingId(entry.id); setEditData({ idea_status: entry.idea_status, views: entry.views }); setViewMode("table"); }}>
                          <p className="text-[10px] font-medium text-white truncate">{entry.idea_name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${entry.idea_status === "scheduled" ? "bg-blue-400" : entry.idea_status === "posted" ? "bg-emerald-400" : "bg-zinc-500"}`} />
                            <span className="text-[9px] text-zinc-500">{entry.idea_status}</span>
                            <span className="text-[9px] text-zinc-600 ml-auto">{getPageHandle(entry)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary footer */}
        {entries.length > 0 && (
          <div className="flex items-center gap-8 mt-6 text-xs text-zinc-600">
            <span>Total entries: <span className="text-white font-bold">{entries.length}</span></span>
            <span>Total views: <span className="text-white font-bold">{totalViews.toLocaleString()}</span></span>
            <span>Scheduled: <span className="text-blue-400 font-bold">{entries.filter((e: any) => e.idea_status === "scheduled").length}</span></span>
            <span>Posted: <span className="text-emerald-400 font-bold">{entries.filter((e: any) => e.idea_status === "posted").length}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
