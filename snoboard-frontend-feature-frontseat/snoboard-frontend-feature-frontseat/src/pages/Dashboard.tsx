import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/services/api";
import { useNavigate } from "react-router-dom";
import { Eye, Film, FileText, ExternalLink } from "lucide-react";

function DonutChart({
  reelViews, postViews, label, size = 200,
}: { reelViews: number; postViews: number; label: string; size?: number }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = reelViews + postViews;
  const gap = 0.02;

  const reelFrac = total > 0 ? reelViews / total : 0;
  const postFrac = total > 0 ? postViews / total : 0;
  const reelLen = reelFrac * circumference * (1 - gap);
  const postLen = postFrac * circumference * (1 - gap);
  const gapLen = total > 0 && postViews > 0 ? circumference * gap : 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="donut-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} />
        {reelViews > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="url(#donut-grad)" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${reelLen} ${circumference - reelLen}`}
            strokeDashoffset={0}
          />
        )}
        {postViews > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#10b981" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${postLen} ${circumference - postLen}`}
            strokeDashoffset={-(reelLen + gapLen)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-2xl font-bold text-white tabular-nums mt-0.5">
          {total.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
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
  const pages = [...(stats?.pages ?? [])].sort((a: any, b: any) => (b.total_views ?? 0) - (a.total_views ?? 0));
  const currentMonth = stats?.current_month
    ? new Date(stats.current_month).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10">
      {/* Hero */}
      <div className="max-w-6xl mx-auto text-center mb-12">
        <h1
          className="text-[8rem] md:text-[10rem] font-black leading-[0.85] tracking-tighter bg-clip-text text-transparent select-none"
          style={{
            backgroundImage: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #6d28d9 100%)",
          }}
        >
          FRONT
          <br />
          SEAT
        </h1>
        <div className="mt-6 w-48 h-1 bg-gradient-to-r from-violet-600 to-purple-500 mx-auto rounded-full" />

        {/* Donut chart */}
        <div className="mt-8 flex justify-center">
          <DonutChart reelViews={stats?.total_ig_reel_views ?? 0} postViews={stats?.total_ig_post_views ?? 0} label="Total Views" size={200} />
        </div>

        <p className="text-xs text-zinc-500 mt-3 uppercase tracking-widest">
          {currentMonth} — Dashboard Views + Post Views
        </p>

        {/* Mini stats */}
        <div className="flex items-center justify-center gap-8 mt-5">
          <div className="flex items-center gap-2 text-zinc-500">
            <Film className="w-4 h-4" />
            <span className="text-sm">{stats?.total_reels ?? 0} reels</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <FileText className="w-4 h-4" />
            <span className="text-sm">{stats?.total_posts ?? 0} posts</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <Eye className="w-4 h-4" />
            <span className="text-sm">{pages.length} pages</span>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {pages.map((page: any) => (
          <div
            key={page.id}
            onClick={() => navigate(`/page/${page.id}`)}
            className="group relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:border-violet-500/50 hover:bg-zinc-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">@{page.handle}</h3>
              {page.auto_scrape && (
                <span className="text-[10px] uppercase tracking-wider bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-medium">
                  Main IP
                </span>
              )}
            </div>

            {page.name && (
              <p className="text-xs text-zinc-500 -mt-2 mb-4">{page.name}</p>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatBox label="IG Reel Views" value={page.ig_reel_views} />
              <StatBox label="IG Post Views" value={page.ig_post_views} />
              <StatBox label="Scraped Reels" value={page.scraped_reel_views} />
              <StatBox label="Total Views" value={page.total_views} highlight />
            </div>

            {/* Counts */}
            <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
              <span>{page.reels_count} reels</span>
              <span>{page.posts_count} posts</span>
            </div>

            {/* Top 5 Reels */}
            {page.top_reels?.length > 0 && (
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Top Reels
                </p>
                <div className="space-y-1.5">
                  {page.top_reels.map((reel: any, i: number) => (
                    <div key={reel.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-violet-400 font-mono text-xs w-4">#{i + 1}</span>
                        <a
                          href={reel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-zinc-500 hover:text-violet-400 truncate max-w-[160px] inline-flex items-center gap-1"
                        >
                          {reel.url.replace("https://www.instagram.com", "").replace("/reel/", "/").replace("/p/", "/")}
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      </div>
                      <span className="font-mono text-white text-xs">
                        {(reel.views ?? 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hover arrow */}
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-violet-400">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 13L13 3M13 3H5M13 3V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-violet-500/10 border border-violet-500/20" : "bg-zinc-950/50"}`}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${highlight ? "text-violet-400" : "text-white"}`}>
        {(value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}
