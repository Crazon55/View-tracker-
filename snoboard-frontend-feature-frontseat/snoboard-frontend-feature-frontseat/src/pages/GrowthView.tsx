import { useQuery } from "@tanstack/react-query";
import { getPages, getDashboard } from "@/services/api";
import { TrendingUp } from "lucide-react";

export default function GrowthView() {
  const { data: dashboard } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });

  const pages = [...(dashboard?.pages ?? [])].sort(
    (a: any, b: any) => (b.total_views ?? 0) - (a.total_views ?? 0)
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Growth</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Views per page — weekly and monthly breakdown
        </p>
      </div>

      {/* Per-page view cards */}
      <div className="space-y-4">
        {pages.map((page: any) => {
          const igReel = page.ig_reel_views ?? 0;
          const igPost = page.ig_post_views ?? 0;
          const scraped = page.scraped_reel_views ?? 0;
          const total = page.total_views ?? 0;

          return (
            <div
              key={page.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">@{page.handle}</h3>
                  {page.name && (
                    <p className="text-xs text-zinc-500">{page.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                  <span className="text-2xl font-bold text-violet-400 tabular-nums">
                    {total.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500">total</span>
                </div>
              </div>

              {/* Breakdown bar */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">IG Reel Views</p>
                  <p className="text-sm font-bold text-white tabular-nums mt-0.5">{igReel.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">IG Post Views</p>
                  <p className="text-sm font-bold text-white tabular-nums mt-0.5">{igPost.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Scraped Reels</p>
                  <p className="text-sm font-bold text-white tabular-nums mt-0.5">{scraped.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-950/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Reels Count</p>
                  <p className="text-sm font-bold text-white tabular-nums mt-0.5">{page.reels_count ?? 0}</p>
                </div>
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  {igReel > 0 && (
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-pink-500"
                      style={{ width: `${(igReel / total) * 100}%` }}
                    />
                  )}
                  {igPost > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(igPost / total) * 100}%` }}
                    />
                  )}
                  {scraped > 0 && (
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(scraped / total) * 100}%` }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {pages.length === 0 && (
          <p className="text-center text-zinc-500 py-8">
            No pages yet. Add pages from the Dashboard first.
          </p>
        )}
      </div>
    </div>
  );
}
