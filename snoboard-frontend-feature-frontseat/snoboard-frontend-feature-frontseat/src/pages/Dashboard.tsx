import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboard, getAutoReels, getManualReels, getPosts } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { motion, AnimatePresence } from "framer-motion";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

type BreakdownMode = "reels" | "views";
type TimePeriod = "all" | "monthly" | "custom";

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
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("reels");
  const [rightCardView, setRightCardView] = useState<"donut" | "pages">("donut");
  const [globalPeriod, setGlobalPeriod] = useState<TimePeriod>("monthly");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [ipFilter, setIpFilter] = useState<"all" | "main" | "stage1">("all");

  const MAIN_IP_HANDLES = ["101xfounders", "bizzindia", "indianfoundersco", "startupcoded", "foundersinindia", "101xmarketing", "techinthelast24hrs", "101xtechnology"];

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  // Fetch all reels + posts for charts and custom date filtering
  const { data: autoReels = [] } = useQuery({ queryKey: ["reels", "auto"], queryFn: getAutoReels });
  const { data: manualReels = [] } = useQuery({ queryKey: ["reels", "manual"], queryFn: getManualReels });
  const { data: allPosts = [] } = useQuery({ queryKey: ["posts"], queryFn: getPosts });

  const allReels = [...autoReels, ...manualReels];

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
  const filteredByType = ipFilter === "all"
    ? allPages
    : ipFilter === "main"
      ? allPages.filter((p: any) => MAIN_IP_HANDLES.includes((p.handle ?? "").toLowerCase()))
      : allPages.filter((p: any) => !MAIN_IP_HANDLES.includes((p.handle ?? "").toLowerCase()));
  const pages = search.trim()
    ? filteredByType.filter((p: any) =>
        (p.handle ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : filteredByType;
  const currentMonth = stats?.current_month
    ? new Date(stats.current_month).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  function getPageViews(page: any, period: TimePeriod): number {
    switch (period) {
      case "all": return page.all_time_views ?? 0;
      case "monthly": return page.total_views ?? 0;
      case "custom": {
        if (!customFrom && !customTo) return page.all_time_views ?? 0;
        const from = customFrom || "0000-00-00";
        const to = customTo || "9999-99-99";
        const pageReels = allReels.filter((r: any) => r.page_id === page.id);
        const pagePosts = allPosts.filter((p: any) => p.page_id === page.id);
        const filteredReels = pageReels.filter((r: any) => {
          const d = (r.posted_at || "")?.slice(0, 10);
          return d >= from && d <= to;
        });
        const filteredPosts = pagePosts.filter((p: any) => {
          const d = (p.posted_at || p.created_at || "")?.slice(0, 10);
          return d >= from && d <= to;
        });
        return filteredReels.reduce((s: number, r: any) => s + (r.views ?? 0), 0)
             + filteredPosts.reduce((s: number, p: any) => s + (p.actual_views ?? 0), 0);
      }
    }
  }

  function getPageCounts(page: any, period: TimePeriod): { reelsCount: number; postsCount: number } {
    if (period !== "custom") {
      return {
        reelsCount: period === "all" ? (page.all_time_reels_count ?? page.reels_count ?? 0) : (page.reels_count ?? 0),
        postsCount: period === "all" ? (page.all_time_posts_count ?? page.posts_count ?? 0) : (page.posts_count ?? 0),
      };
    }
    if (!customFrom && !customTo) {
      return { reelsCount: page.all_time_reels_count ?? 0, postsCount: page.all_time_posts_count ?? 0 };
    }
    const from = customFrom || "0000-00-00";
    const to = customTo || "9999-99-99";
    const reelsCount = allReels.filter((r: any) => {
      const d = (r.posted_at || "")?.slice(0, 10);
      return r.page_id === page.id && d >= from && d <= to;
    }).length;
    const postsCount = allPosts.filter((p: any) => {
      const d = (p.posted_at || p.created_at || "")?.slice(0, 10);
      return p.page_id === page.id && d >= from && d <= to;
    }).length;
    return { reelsCount, postsCount };
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

          {/* Views Distribution + Page-wise Views */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 overflow-hidden">
            <div className="space-y-3 mb-5 sm:mb-6">
              <div className="flex items-center justify-between">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-semibold">
                  {rightCardView === "donut" ? "Views Distribution" : "Page-wise Views"}
                </p>
                <TogglePill
                  options={[
                    { label: "Distribution", value: "donut" },
                    { label: "By Page", value: "pages" },
                  ]}
                  value={rightCardView}
                  onChange={(v) => setRightCardView(v as "donut" | "pages")}
                />
              </div>
              {rightCardView === "pages" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <TogglePill
                    options={[
                      { label: "Weekly", value: "reels" },
                      { label: "Monthly", value: "views" },
                    ]}
                    value={breakdownMode}
                    onChange={(v) => setBreakdownMode(v as BreakdownMode)}
                  />
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-violet-500/50 cursor-pointer w-[110px]" />
                    <span className="text-zinc-600 text-[10px]">to</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-violet-500/50 cursor-pointer w-[110px]" />
                  </div>
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {rightCardView === "donut" ? (
                <motion.div
                  key="donut"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-center gap-8"
                >
                  {(() => {
                    const reelViews = stats?.total_reel_views ?? 0;
                    const postViews = stats?.total_post_views ?? 0;
                    const total = reelViews + postViews;
                    const size = 160;
                    const stroke = 14;
                    const radius = (size - stroke) / 2;
                    const circumference = 2 * Math.PI * radius;
                    const gap = 0.02;
                    const reelFrac = total > 0 ? reelViews / total : 0;
                    const reelLen = reelFrac * circumference * (1 - gap);
                    const postFrac = total > 0 ? postViews / total : 0;
                    const postLen = postFrac * circumference * (1 - gap);
                    const gapLen = total > 0 && postViews > 0 ? circumference * gap : 0;
                    return (
                      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                        <svg width={size} height={size} className="-rotate-90">
                          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} />
                          {reelViews > 0 && (
                            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#dash-reel)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${reelLen} ${circumference - reelLen}`} strokeDashoffset={0} />
                          )}
                          {postViews > 0 && (
                            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#10b981" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${postLen} ${circumference - postLen}`} strokeDashoffset={-(reelLen + gapLen)} />
                          )}
                          <defs>
                            <linearGradient id="dash-reel" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#a855f7" />
                              <stop offset="100%" stopColor="#d946ef" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-[9px] uppercase tracking-widest text-zinc-500">Total Views</p>
                          <p className="text-2xl font-black text-white tabular-nums mt-1">{total.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                      <div>
                        <p className="text-xs text-zinc-500">Reel Views</p>
                        <p className="text-lg font-bold text-white tabular-nums">{formatCompact(stats?.total_reel_views ?? 0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <div>
                        <p className="text-xs text-zinc-500">Post Views</p>
                        <p className="text-lg font-bold text-white tabular-nums">{formatCompact(stats?.total_post_views ?? 0)}</p>
                      </div>
                    </div>
                    <div className="h-px bg-zinc-800" />
                    <div className="flex items-center gap-4 text-xs text-zinc-600">
                      <span>{stats?.total_reels ?? 0} reels</span>
                      <span>{stats?.total_posts ?? 0} posts</span>
                      <span>{allPages.length} pages</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pages"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  {(() => {
                    const now = new Date();
                    let fromDate = "";
                    const toDate = now.toISOString().slice(0, 10);
                    if (breakdownMode === "reels") {
                      const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().slice(0, 10);
                    } else {
                      fromDate = now.toISOString().slice(0, 8) + "01";
                    }
                    const useFrom = customFrom || fromDate;
                    const useTo = customTo || toDate;
                    const pageViews = allPages.map((page: any) => {
                      const rv = allReels.filter((r: any) => r.page_id === page.id && (r.posted_at || "").slice(0, 10) >= useFrom && (r.posted_at || "").slice(0, 10) <= useTo).reduce((s: number, r: any) => s + (r.views ?? 0), 0);
                      const pv = allPosts.filter((p: any) => p.page_id === page.id && (p.posted_at || p.created_at || "").slice(0, 10) >= useFrom && (p.posted_at || p.created_at || "").slice(0, 10) <= useTo).reduce((s: number, p: any) => s + (p.actual_views ?? 0), 0);
                      return { name: (page.handle ?? "").length > 14 ? (page.handle ?? "").slice(0, 14) + ".." : (page.handle ?? ""), views: rv + pv };
                    }).filter((p: { views: number }) => p.views > 0).sort((a: { views: number }, b: { views: number }) => b.views - a.views);

                    return pageViews.length > 0 ? (
                      <>
                        <div className="overflow-y-auto max-h-[280px]">
                          <ResponsiveContainer width="100%" height={Math.max(250, pageViews.length * 28)}>
                            <BarChart data={pageViews} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                              <XAxis type="number" tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => formatCompact(v)} />
                              <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10 }} width={110} />
                              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} formatter={(value: number) => [value.toLocaleString() + " views", ""]} />
                              <Bar dataKey="views" fill="#a855f7" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    ) : <p className="text-center text-zinc-600 py-8 text-sm">No data for this period</p>;
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
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
              {pages.length} total
            </Badge>
            <TogglePill
              options={[
                { label: "All", value: "all" },
                { label: "Stage 3", value: "main" },
                { label: "Stage 1", value: "stage1" },
              ]}
              value={ipFilter}
              onChange={(v) => setIpFilter(v as "all" | "main" | "stage1")}
            />
          </div>
          {/* Global period toggle */}
          <div className="flex items-center gap-3">
            <TogglePill
              options={[
                { label: "All Time", value: "all" },
                { label: "Monthly", value: "monthly" },
                { label: "Custom", value: "custom" },
              ]}
              value={globalPeriod}
              onChange={(v) => setGlobalPeriod(v as TimePeriod)}
            />
            {globalPeriod === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50 cursor-pointer"
                />
                <span className="text-zinc-600 text-xs">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50 cursor-pointer"
                />
              </div>
            )}
          </div>
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
            const { reelsCount, postsCount } = getPageCounts(page, globalPeriod);

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

                <a
                  href={`https://www.instagram.com/${page.handle}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-zinc-600 hover:text-violet-400 transition-colors mb-4 block"
                >@{page.handle}</a>

                {/* Total Views Label */}
                <p className="text-[10px] uppercase tracking-[0.15em] text-violet-400 font-bold mb-2">
                  Total Views
                </p>

                {/* Period indicator */}
                <div className="flex items-center gap-1 mb-3">
                  {(["all", "monthly", "custom"] as TimePeriod[]).map((p) => (
                    <span
                      key={p}
                      className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${
                        globalPeriod === p
                          ? "text-white bg-violet-600"
                          : "text-zinc-600 bg-zinc-900"
                      }`}
                    >
                      {p === "all" ? "All Time" : p === "monthly" ? "Monthly" : "Custom"}
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
