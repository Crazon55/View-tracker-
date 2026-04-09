import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCompetitorContent, updateCompetitorEntry, type CompetitorCategory } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, Eye, Heart, Calendar, CheckCircle2, XCircle, LayoutGrid, Table as TableIcon, Telescope } from "lucide-react";
import { toast } from "sonner";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const TABS: { key: CompetitorCategory; label: string; color: string }[] = [
  { key: "tech_reels", label: "Tech Reels", color: "bg-blue-600" },
  { key: "fbs_reels", label: "FBS Reels", color: "bg-amber-600" },
  { key: "fbs_posts", label: "FBS Posts", color: "bg-emerald-600" },
];

const BUCKETS = ["1M+", "500k-1M", "250k-500k", "100k-250k", "50-100k", "<50k"] as const;

const BUCKET_COLORS: Record<string, string> = {
  "1M+": "bg-red-500/20 text-red-400 border-red-500/30",
  "500k-1M": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "250k-500k": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "100k-250k": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "50-100k": "bg-lime-500/20 text-lime-400 border-lime-500/30",
  "<50k": "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
};

export default function CompetitorResearch() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CompetitorCategory>("tech_reels");
  const [bucket, setBucket] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"gallery" | "table">("gallery");

  const { data: rawData = [], isLoading } = useQuery<any[]>({
    queryKey: ["competitor", tab, bucket],
    queryFn: () => getCompetitorContent(tab, bucket || undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      updateCompetitorEntry(tab, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor", tab] });
      toast.success("Updated");
    },
  });

  // Filter by search
  const entries = search.trim()
    ? rawData.filter(
        (e) =>
          (e.account_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.account_handle || "").toLowerCase().includes(search.toLowerCase())
      )
    : rawData;

  // Group by account for gallery view
  const accountMap = new Map<string, { name: string; handle: string; entries: any[]; topViews: number; totalEntries: number }>();
  for (const entry of entries) {
    const key = entry.account_handle || entry.account_name;
    if (!accountMap.has(key)) {
      accountMap.set(key, {
        name: entry.account_name,
        handle: entry.account_handle,
        entries: [],
        topViews: 0,
        totalEntries: 0,
      });
    }
    const acc = accountMap.get(key)!;
    acc.entries.push(entry);
    acc.totalEntries++;
    if (entry.views > acc.topViews) acc.topViews = entry.views;
  }
  const accounts = [...accountMap.values()].sort((a, b) => b.topViews - a.topViews);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
              <Telescope className="w-7 h-7 text-violet-400" />
              Competitor Research
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track competitor reels and posts across niches</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setBucket(null); setSearch(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                tab === t.key
                  ? `${t.color} text-white shadow-lg`
                  : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls row: bucket filters + search + view toggle */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Bucket filter pills */}
          <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setBucket(null)}
              className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${
                !bucket ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All
            </button>
            {BUCKETS.map((b) => (
              <button
                key={b}
                onClick={() => setBucket(bucket === b ? null : b)}
                className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${
                  bucket === b ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50 h-9"
            />
          </div>

          {/* View toggle */}
          <div className="inline-flex items-center bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView("gallery")}
              className={`p-1.5 rounded-md transition-all ${view === "gallery" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Gallery view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={`p-1.5 rounded-md transition-all ${view === "table" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              title="Table view"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Count */}
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">
            {entries.length} entries
          </Badge>
        </div>

        {/* Gallery View */}
        {view === "gallery" && (
          <div className="space-y-8">
            {accounts.length === 0 ? (
              <div className="text-center py-16 text-zinc-600">
                <Telescope className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No competitor content yet. Data will appear after n8n runs the daily scrape.</p>
              </div>
            ) : (
              accounts.map((account) => (
                <div key={account.handle} className="space-y-3">
                  {/* Account header */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-white">{account.name}</h3>
                    <span className="text-xs text-zinc-500">@{account.handle}</span>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                      {account.totalEntries} {tab.includes("reel") ? "reels" : "posts"}
                    </Badge>
                  </div>

                  {/* Content cards — Notion-style gallery */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {account.entries
                      .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
                      .map((entry: any) => (
                        <div
                          key={entry.id}
                          className={`bg-zinc-900 border rounded-xl p-4 hover:border-zinc-600 transition-all group ${
                            entry.usage === "used"
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-zinc-800"
                          }`}
                        >
                          {/* Account name */}
                          <p className="text-sm font-semibold text-white truncate mb-1">
                            {entry.account_name}
                          </p>

                          {/* URL (shortened) */}
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-zinc-500 hover:text-violet-400 truncate block mb-3"
                          >
                            instagram.com/p/...{entry.url?.split("/").slice(-2, -1)[0]?.slice(-6)}/
                          </a>

                          {/* View bucket badge */}
                          <Badge
                            variant="outline"
                            className={`text-[10px] mb-3 ${BUCKET_COLORS[entry.view_bucket] || BUCKET_COLORS["<50k"]}`}
                          >
                            {entry.view_bucket}
                          </Badge>

                          {/* Stats */}
                          <div className="space-y-1.5 mb-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Eye className="w-3 h-3 text-zinc-600" />
                              <span className="text-white font-mono font-bold">{formatCompact(entry.views || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Heart className="w-3 h-3 text-zinc-600" />
                              <span className="text-zinc-400 font-mono">{formatCompact(entry.likes || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Calendar className="w-3 h-3 text-zinc-600" />
                              <span className="text-zinc-500">{entry.posted_at?.slice(0, 10) || "—"}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5">
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg py-1.5 text-[10px] font-medium transition-all"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open
                            </a>
                            <button
                              onClick={() =>
                                updateMutation.mutate({
                                  id: entry.id,
                                  data: { usage: entry.usage === "used" ? "not_used" : "used" },
                                })
                              }
                              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-2 text-[10px] font-medium transition-all ${
                                entry.usage === "used"
                                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-red-500/20 hover:text-red-400"
                                  : "bg-zinc-800 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400"
                              }`}
                              title={entry.usage === "used" ? "Mark as not used" : "Mark as used"}
                            >
                              {entry.usage === "used" ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {entry.usage === "used" ? "Used" : "Not used"}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Table View */}
        {view === "table" && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Handle</th>
                  <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Likes</th>
                  <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Views</th>
                  <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Bucket</th>
                  <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Posted</th>
                  <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Link</th>
                  <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Usage</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-zinc-600 py-12">
                      No content yet. Data will appear after n8n runs the daily scrape.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry: any) => (
                    <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                      <td className="py-3 px-4 text-sm font-medium text-white">{entry.account_name}</td>
                      <td className="py-3 px-4 text-xs text-zinc-500">@{entry.account_handle}</td>
                      <td className="py-3 px-4 text-sm text-right font-mono text-zinc-400">{formatCompact(entry.likes || 0)}</td>
                      <td className="py-3 px-4 text-sm text-right font-mono font-bold text-white">{formatCompact(entry.views || 0)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline" className={`text-[10px] ${BUCKET_COLORS[entry.view_bucket] || BUCKET_COLORS["<50k"]}`}>
                          {entry.view_bucket}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-500">{entry.posted_at?.slice(0, 10) || "—"}</td>
                      <td className="py-3 px-4 text-center">
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                          <ExternalLink className="w-4 h-4 inline" />
                        </a>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() =>
                            updateMutation.mutate({
                              id: entry.id,
                              data: { usage: entry.usage === "used" ? "not_used" : "used" },
                            })
                          }
                          className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${
                            entry.usage === "used"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {entry.usage === "used" ? "Used" : "Not used"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary stats */}
        {entries.length > 0 && (
          <div className="flex items-center gap-6 mt-4 text-xs text-zinc-600">
            <span>Total entries: <span className="text-white font-bold">{entries.length}</span></span>
            <span>Accounts: <span className="text-white font-bold">{accounts.length}</span></span>
            <span>Avg views: <span className="text-white font-bold">{formatCompact(Math.round(entries.reduce((s: number, e: any) => s + (e.views || 0), 0) / entries.length))}</span></span>
            <span>1M+ hits: <span className="text-amber-400 font-bold">{entries.filter((e: any) => e.view_bucket === "1M+").length}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
