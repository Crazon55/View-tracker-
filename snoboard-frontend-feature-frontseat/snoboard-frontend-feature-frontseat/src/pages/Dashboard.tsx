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

type BreakdownMode = "reels" | "views";
type TimePeriod = "all" | "monthly" | "weekly";

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

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("views");
  const [globalPeriod, setGlobalPeriod] = useState<TimePeriod>("monthly");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

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

  // Breakdown data based on toggle
  const breakdownData = breakdownMode === "views"
    ? [
        { label: "Reel Views", value: stats?.total_reel_views ?? 0, color: "bg-gradient-to-r from-violet-500 to-pink-500" },
        { label: "Post Views", value: stats?.total_post_views ?? 0, color: "bg-emerald-500" },
      ]
    : [
        { label: "Total Reels", value: stats?.total_reels ?? 0, color: "bg-violet-500" },
        { label: "Total Posts", value: stats?.total_posts ?? 0, color: "bg-emerald-500" },
      ];

  function getPageViews(page: any, period: TimePeriod): number {
    // all time = sum of dashboard_views across ALL months (manually entered only)
    // monthly = current month IG dashboard views
    // weekly = monthly / 4 estimate
    switch (period) {
      case "all": return page.all_time_views ?? 0;
      case "monthly": return page.total_views ?? 0;
      case "weekly": return Math.round((page.total_views ?? 0) / 4);
    }
  }

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
          {/* Total Ecosystem Reach */}
          <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-semibold mb-4 sm:mb-6">
                Total Ecosystem Reach
              </p>
              <p className="text-5xl sm:text-6xl lg:text-7xl font-black text-white tabular-nums tracking-tight leading-none">
                {formatCompact(totalViews)}
              </p>
              <div className="flex items-center gap-3 mt-5 sm:mt-6">
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {currentMonth}
                </span>
                <span className="text-xs text-zinc-500 uppercase tracking-wider hidden sm:inline">Growth Period</span>
              </div>
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
            <div className="flex items-center justify-between mb-5 sm:mb-6">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-semibold">
                Monthly Breakdown
              </p>
              <TogglePill
                options={[
                  { label: "Reels", value: "reels" },
                  { label: "Views", value: "views" },
                ]}
                value={breakdownMode}
                onChange={(v) => setBreakdownMode(v as BreakdownMode)}
              />
            </div>

            <div className="space-y-4">
              {breakdownData.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-sm text-zinc-400">{item.label}</span>
                  </div>
                  <span className="text-lg font-bold text-white tabular-nums">{formatCompact(item.value)}</span>
                </div>
              ))}

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

        {/* Leaderboard Podium */}
        {allPages.length >= 3 && (() => {
          const top3 = allPages.slice(0, 3);
          const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
          const heights = [140, 180, 110]; // podium step heights
          const medals = ["🥈", "🥇", "🥉"];
          const ranks = [2, 1, 3];
          const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
          const glowColors = ["", "shadow-[0_0_40px_-5px_rgba(234,179,8,0.2)]", ""];
          const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];

          return (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🏆</span>
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">Leaderboard</h2>
              </div>
              <div className="flex items-end justify-center gap-3 sm:gap-5">
                {podiumOrder.map((page, i) => {
                  const views = getPageViews(page, globalPeriod);
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
                      <p className={`font-black text-white uppercase tracking-wide text-center leading-tight mb-1 ${ranks[i] === 1 ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>
                        {page.name || page.handle}
                      </p>
                      <p className="text-[10px] text-zinc-600 mb-2">@{page.handle}</p>

                      {/* Podium block */}
                      <div
                        className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} ${glowColors[i]} flex flex-col items-center justify-center transition-all`}
                        style={{ height: heights[i] }}
                      >
                        <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
                          {formatCompact(views)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">views</span>
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
                          <span>{globalPeriod === "all" ? (page.all_time_reels_count ?? page.reels_count ?? 0) : globalPeriod === "weekly" ? Math.round((page.reels_count ?? 0) / 4) : (page.reels_count ?? 0)} reels</span>
                          <span>·</span>
                          <span>{globalPeriod === "all" ? (page.all_time_posts_count ?? page.posts_count ?? 0) : globalPeriod === "weekly" ? Math.round((page.posts_count ?? 0) / 4) : (page.posts_count ?? 0)} posts</span>
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
              {allPages.length} total
            </Badge>
          </div>
          {/* Global period toggle */}
          <TogglePill
            options={[
              { label: "All Time", value: "all" },
              { label: "Monthly", value: "monthly" },
              { label: "Weekly", value: "weekly" },
            ]}
            value={globalPeriod}
            onChange={(v) => setGlobalPeriod(v as TimePeriod)}
          />
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

            // Counts that switch with the period toggle
            const reelsCount = globalPeriod === "all"
              ? (page.all_time_reels_count ?? page.reels_count ?? 0)
              : globalPeriod === "weekly"
                ? Math.round((page.reels_count ?? 0) / 4)
                : (page.reels_count ?? 0);
            const postsCount = globalPeriod === "all"
              ? (page.all_time_posts_count ?? page.posts_count ?? 0)
              : globalPeriod === "weekly"
                ? Math.round((page.posts_count ?? 0) / 4)
                : (page.posts_count ?? 0);

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

                {page.name && (
                  <p className="text-xs text-zinc-600 mb-4">@{page.handle}</p>
                )}
                {!page.name && <div className="mb-4" />}

                {/* Total Views Label */}
                <p className="text-[10px] uppercase tracking-[0.15em] text-violet-400 font-bold mb-2">
                  Total Views
                </p>

                {/* Period indicator */}
                <div className="flex items-center gap-1 mb-3">
                  {(["all", "monthly", "weekly"] as TimePeriod[]).map((p) => (
                    <span
                      key={p}
                      className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${
                        globalPeriod === p
                          ? "text-white bg-violet-600"
                          : "text-zinc-600 bg-zinc-900"
                      }`}
                    >
                      {p === "all" ? "All Time" : p === "monthly" ? "Monthly" : "Weekly"}
                    </span>
                  ))}
                </div>

                {/* Big View Number + Growth */}
                <div className="flex items-end justify-between">
                  <p className="text-3xl sm:text-4xl font-black text-white tabular-nums tracking-tight">
                    {formatCompact(viewsForPeriod)}
                  </p>

                  {reelPct > 0 && (
                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold px-2 py-1 rounded-full">
                      <TrendingUp className="w-3 h-3" />
                      {reelPct.toFixed(1)}%
                    </span>
                  )}
                </div>

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
