import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const stats = data;
  const totalViews = stats?.total_views ?? 0;
  const allPages = [...(stats?.pages ?? [])].sort((a: any, b: any) => (b.total_views ?? 0) - (a.total_views ?? 0));
  const pages = search.trim()
    ? allPages.filter((p: any) =>
        (p.handle ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allPages;
  const currentMonth = stats?.current_month
    ? new Date(stats.current_month).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Top Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {/* Total Ecosystem Reach */}
          <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            {/* Purple glow */}
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-semibold mb-6">
                Total Ecosystem Reach
              </p>
              <p className="text-6xl md:text-7xl font-black text-white tabular-nums tracking-tight leading-none">
                {formatCompact(totalViews)}
              </p>
              <div className="flex items-center gap-3 mt-6">
                <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  <TrendingUp className="w-3 h-3" />
                  {currentMonth}
                </span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Growth Period</span>
              </div>
            </div>
          </div>

          {/* Monthly Growth Vector (visual placeholder with stats) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-semibold">
                Monthly Breakdown
              </p>
              <div className="flex items-center gap-1 bg-zinc-800 rounded-full p-0.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 py-1">Reels</span>
                <span className="text-[10px] uppercase tracking-wider bg-violet-600 text-white px-3 py-1 rounded-full">Views</span>
              </div>
            </div>

            {/* Stats breakdown */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-500 to-pink-500" />
                  <span className="text-sm text-zinc-400">IG Reel Views</span>
                </div>
                <span className="text-lg font-bold text-white tabular-nums">{formatCompact(stats?.total_ig_reel_views ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-zinc-400">IG Post Views</span>
                </div>
                <span className="text-lg font-bold text-white tabular-nums">{formatCompact(stats?.total_ig_post_views ?? 0)}</span>
              </div>
              <div className="h-px bg-zinc-800" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total Reels</span>
                <span className="text-lg font-bold text-white tabular-nums">{stats?.total_reels ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total Posts</span>
                <span className="text-lg font-bold text-white tabular-nums">{stats?.total_posts ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Pages</span>
                <span className="text-lg font-bold text-white tabular-nums">{allPages.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* YOUR IP'S header + Search */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">Your IP's</h2>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">
              {allPages.length} total
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search pages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50"
            />
          </div>
        </div>

        {/* Page Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pages.map((page: any) => {
            const total = page.total_views ?? 0;
            return (
              <div
                key={page.id}
                onClick={() => navigate(`/page/${page.id}`)}
                className="group relative bg-zinc-950 border border-emerald-500/20 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:border-emerald-500/40 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.15)]"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-wide">
                    {page.name || page.handle}
                  </h3>
                  <MoreVertical className="w-5 h-5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {page.name && (
                  <p className="text-xs text-zinc-600 mb-4">@{page.handle}</p>
                )}
                {!page.name && <div className="mb-4" />}

                {/* Total Views Label */}
                <p className="text-[10px] uppercase tracking-[0.15em] text-violet-400 font-bold mb-1">
                  Total Views
                </p>

                {/* View Toggle Pills */}
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-full">All Time</span>
                  <span className="text-[9px] uppercase tracking-wider text-white bg-violet-600 px-2 py-0.5 rounded-full">Monthly</span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-full">Weekly</span>
                </div>

                {/* Big View Number */}
                <div className="flex items-center justify-between">
                  <p className="text-4xl font-black text-white tabular-nums tracking-tight">
                    {formatCompact(total)}
                  </p>

                  {/* Growth badge */}
                  {total > 0 && (
                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded-full">
                      <TrendingUp className="w-3 h-3" />
                      {((page.ig_reel_views ?? 0) / Math.max(total, 1) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Mini breakdown */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-zinc-900">
                  <span className="text-[10px] text-zinc-600">{page.reels_count ?? 0} reels</span>
                  <span className="text-[10px] text-zinc-600">{page.posts_count ?? 0} posts</span>
                  <span className="text-[10px] text-zinc-600">IG: {formatCompact((page.ig_reel_views ?? 0) + (page.ig_post_views ?? 0))}</span>
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
  );
}
