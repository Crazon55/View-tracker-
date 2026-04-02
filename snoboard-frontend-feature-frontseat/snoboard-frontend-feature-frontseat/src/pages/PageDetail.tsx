import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPageDetail, getContentEntries, createContentEntry, updateContentEntry, deleteContentEntry, getPages } from "@/services/api";
import { useParams, useNavigate } from "react-router-dom";
import type { Page } from "@/types";
import { ArrowLeft, ExternalLink, Plus, Trash2, Pencil, Check, X, Calendar, Table2, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  scheduled: "bg-blue-500/20 text-blue-400",
  posted: "bg-emerald-500/20 text-emerald-400",
  complete: "bg-violet-500/20 text-violet-400",
};

export default function PageDetail() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // Chart month filter
  const [chartMonth, setChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Table month filter
  const [tableMonth, setTableMonth] = useState("all");

  // Form state
  const [form, setForm] = useState({
    idea_name: "", content_type: "reel", idea_status: "draft",
    upload_date: "", created_by: "", frame_link: "", comp_link: "",
    content_buckets: "", views: "", url: "", notes: "", ips: "",
  });

  const { data: pageData, isLoading: pageLoading } = useQuery({
    queryKey: ["page-detail", pageId],
    queryFn: () => getPageDetail(pageId!),
    enabled: !!pageId,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["content-entries", pageId],
    queryFn: () => getContentEntries(pageId!),
    enabled: !!pageId,
  });

  const { data: allPages = [] } = useQuery<Page[]>({ queryKey: ["pages"], queryFn: getPages });

  const createMut = useMutation({
    mutationFn: createContentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", pageId] });
      toast.success("Entry added");
      setAddOpen(false);
      setForm({ idea_name: "", content_type: "reel", idea_status: "draft", upload_date: "", created_by: "", frame_link: "", comp_link: "", content_buckets: "", views: "", url: "", notes: "", ips: "" });
    },
    onError: () => toast.error("Failed to add entry"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateContentEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", pageId] });
      toast.success("Updated");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteContentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries", pageId] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.idea_name.trim()) return;
    createMut.mutate({
      page_id: pageId,
      idea_name: form.idea_name.trim(),
      content_type: form.content_type,
      idea_status: form.idea_status,
      upload_date: form.upload_date || undefined,
      created_by: form.created_by || undefined,
      frame_link: form.frame_link || undefined,
      comp_link: form.comp_link || undefined,
      content_buckets: form.content_buckets || undefined,
      views: form.views ? Number(form.views) : 0,
      url: form.url || undefined,
      notes: form.notes || undefined,
      ips: form.ips || undefined,
    });
  };

  if (pageLoading || entriesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const page = pageData?.page;
  const reels = pageData?.all_reels ?? [];

  const totalViews = entries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);

  // Top 3 reels
  const top3 = [...reels].sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 3);

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

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <Button variant="ghost" size="sm" className="mb-4 text-zinc-500 hover:text-white" onClick={() => navigate("/pages")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to IP's
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-black text-white">@{page?.handle}</h1>
              {page?.name && <p className="text-zinc-500 mt-1">{page.name}</p>}
            </div>
            {page?.profile_url && (
              <a href={page.profile_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
            <Badge className="bg-zinc-800 text-zinc-400">{entries.length} entries</Badge>
            <Badge className="bg-violet-500/20 text-violet-400">{formatCompact(totalViews)} views</Badge>
          </div>

          <div className="flex items-center gap-3">
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
                  <DialogTitle>Add Content Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3 mt-2">
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
                          <SelectItem value="reel">Reel</SelectItem>
                          <SelectItem value="carousel">Carousel</SelectItem>
                          <SelectItem value="static">Static</SelectItem>
                          <SelectItem value="story">Story</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={form.idea_status} onValueChange={(v) => setForm({ ...form, idea_status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="posted">Posted</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Upload Date</Label>
                      <Input type="date" value={form.upload_date} onChange={(e) => setForm({ ...form, upload_date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Created By</Label>
                      <Input value={form.created_by} onChange={(e) => setForm({ ...form, created_by: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>IPs</Label>
                    <Input placeholder="Related IPs" value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content Buckets</Label>
                    <Input value={form.content_buckets} onChange={(e) => setForm({ ...form, content_buckets: e.target.value })} />
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
                <h3 className="text-lg font-black text-white uppercase tracking-wider">Top 3 Reels</h3>
              </div>
              <div className="flex items-end justify-center gap-3 sm:gap-5">
                {podiumOrder.map((reel, i) => (
                  <a key={reel.id} href={reel.url} target="_blank" rel="noopener noreferrer"
                    className={`transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}>
                    <span className={`text-2xl sm:text-3xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                      {medals[i]}
                    </span>
                    <p className="text-[10px] text-zinc-500 mb-1 truncate max-w-full text-center">
                      {page?.handle ?? "—"}
                    </p>
                    <p className="text-[9px] text-violet-400 mb-2 truncate max-w-full">
                      {reel.url?.replace("https://www.instagram.com", "").replace(/\/$/, "")}
                    </p>
                    <div className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} flex flex-col items-center justify-center`} style={{ height: heights[i] }}>
                      <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                        {(reel.views ?? 0).toLocaleString()}
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
        {reels.length > 0 && (() => {
          // Aggregate views by date from reels
          const viewsByDate: Record<string, number> = {};
          for (const r of reels) {
            const d = (r.posted_at || "")?.slice(0, 10);
            if (!d || !d.startsWith(chartMonth)) continue;
            viewsByDate[d] = (viewsByDate[d] || 0) + (r.views ?? 0);
          }
          const pagePosts = pageData?.all_posts ?? [];
          for (const p of pagePosts) {
            const d = (p.posted_at || p.created_at || "")?.slice(0, 10);
            if (!d || !d.startsWith(chartMonth)) continue;
            viewsByDate[d] = (viewsByDate[d] || 0) + (p.actual_views ?? 0);
          }

          // Fill all days of the month
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

          // Get available months
          const availableMonths = new Set<string>();
          for (const r of reels) {
            const m = (r.posted_at || "")?.slice(0, 7);
            if (m) availableMonths.add(m);
          }
          for (const p of pagePosts) {
            const m = (p.posted_at || p.created_at || "")?.slice(0, 7);
            if (m) availableMonths.add(m);
          }
          const sortedAvailMonths = [...availableMonths].sort();

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
          // Generate all months for current year and previous year
          const now = new Date();
          const allMonths: string[] = [];
          for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
            const maxM = y === now.getFullYear() ? now.getMonth() + 1 : 12;
            for (let m = maxM; m >= 1; m--) {
              allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
            }
          }

          // Filter entries by selected month
          const filteredEntries = tableMonth === "all"
            ? entries
            : entries.filter((e: any) => (e.upload_date || e.created_at || "")?.slice(0, 7) === tableMonth);

          const filteredViews = filteredEntries.reduce((s: number, e: any) => s + (e.views ?? 0), 0);

          return (
          <>
          {/* Month filter */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setTableMonth("all")} className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${tableMonth === "all" ? "bg-violet-600 text-white" : "text-zinc-500 bg-zinc-800/80 hover:text-zinc-300"}`}>All</button>
              {allMonths.map((m) => (
                <button key={m} onClick={() => setTableMonth(m)} className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${tableMonth === m ? "bg-violet-600 text-white" : "text-zinc-500 bg-zinc-800/80 hover:text-zinc-300"}`}>
                  {new Date(m + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                </button>
              ))}
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
                  <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Buckets</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Views</th>
                  <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Links</th>
                  <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={10} className="text-center text-zinc-500 py-12">{entries.length === 0 ? 'No entries yet. Click "New Entry" to add content.' : "No entries for this month."}</td></tr>
                ) : filteredEntries.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-white max-w-[200px] truncate">{entry.idea_name}</td>
                    <td className="py-3 px-4 text-xs uppercase text-zinc-500">{entry.content_type}</td>
                    <td className="py-3 px-4">
                      {editingId === entry.id ? (
                        <Select value={editData.idea_status || entry.idea_status} onValueChange={(v) => setEditData({ ...editData, idea_status: v })}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="posted">Posted</SelectItem>
                            <SelectItem value="complete">Complete</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] uppercase cursor-pointer ${STATUS_COLORS[entry.idea_status] ?? ""}`}
                          onClick={() => { setEditingId(entry.id); setEditData({ idea_status: entry.idea_status, views: entry.views }); }}>
                          {entry.idea_status}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">{entry.upload_date?.slice(0, 10) || "—"}</td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">{entry.created_by || "—"}</td>
                    <td className="py-3 px-4 text-zinc-400 text-xs max-w-[120px] truncate">{entry.ips || "—"}</td>
                    <td className="py-3 px-4 text-zinc-400 text-xs max-w-[120px] truncate">{entry.content_buckets || "—"}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums">
                      {editingId === entry.id ? (
                        <Input type="number" className="h-7 w-24 text-right text-xs" value={editData.views ?? entry.views} onChange={(e) => setEditData({ ...editData, views: Number(e.target.value) })} />
                      ) : (
                        (entry.views ?? 0).toLocaleString()
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300"><ExternalLink className="w-3.5 h-3.5" /></a>}
                        {entry.frame_link && <a href={entry.frame_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-[9px]">Frame</a>}
                        {entry.comp_link && <a href={entry.comp_link} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 text-[9px]">Comp</a>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {editingId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-400" onClick={() => updateMut.mutate({ id: entry.id, data: editData })}><Check className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-white" onClick={() => { setEditingId(entry.id); setEditData({ idea_status: entry.idea_status, views: entry.views }); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => deleteMut.mutate(entry.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          );
        })()}

        {/* CALENDAR VIEW */}
        {viewMode === "calendar" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {/* Calendar header */}
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

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs text-zinc-500 font-medium py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
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
                            <span className={`w-1.5 h-1.5 rounded-full ${entry.idea_status === "scheduled" ? "bg-blue-400" : entry.idea_status === "posted" ? "bg-emerald-400" : entry.idea_status === "complete" ? "bg-violet-400" : "bg-zinc-500"}`} />
                            <span className="text-[9px] text-zinc-500">{entry.idea_status}</span>
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
