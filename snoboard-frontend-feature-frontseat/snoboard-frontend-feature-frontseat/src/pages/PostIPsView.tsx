import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPosts, getPages } from "@/services/api";
import type { Post, Page } from "@/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import DateRangeFilter, { filterByDateRange } from "@/components/DateRangeFilter";

interface IPStats {
  handle: string;
  name: string | null;
  pageId: string;
  totalPosts: number;
  totalActualViews: number;
  totalExpectedViews: number;
  avgViews: number;
  bestPost: Post | null;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function PostIPsView() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterPage, setFilterPage] = useState("all");

  const { data: allPosts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["posts"],
    queryFn: getPosts,
  });

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const pages = allPages.filter((p) => (p.stage ?? 1) === 3);
  const mainPageIds = new Set(pages.map((p) => p.id));
  const posts = allPosts.filter((p) => mainPageIds.has(p.page_id));

  // Apply filters
  const filtered = filterByDateRange(posts, dateFrom, dateTo, "posted_at").filter(
    (p) => filterPage === "all" || p.pages?.handle?.toLowerCase() === filterPage
  );

  // Aggregate per IP
  const ipMap = new Map<string, IPStats>();
  for (const post of filtered) {
    const handle = post.pages?.handle ?? "unknown";
    if (!ipMap.has(handle)) {
      ipMap.set(handle, {
        handle,
        name: post.pages?.name ?? null,
        pageId: post.page_id,
        totalPosts: 0,
        totalActualViews: 0,
        totalExpectedViews: 0,
        avgViews: 0,
        bestPost: null,
      });
    }
    const stats = ipMap.get(handle)!;
    stats.totalPosts += 1;
    stats.totalActualViews += post.actual_views ?? 0;
    stats.totalExpectedViews += post.expected_views ?? 0;
    if (!stats.bestPost || (post.actual_views ?? 0) > (stats.bestPost.actual_views ?? 0)) {
      stats.bestPost = post;
    }
  }

  const ipList = Array.from(ipMap.values())
    .map((ip) => ({ ...ip, avgViews: ip.totalPosts > 0 ? Math.round(ip.totalActualViews / ip.totalPosts) : 0 }))
    .sort((a, b) => b.totalActualViews - a.totalActualViews);

  const totalViews = ipList.reduce((s, ip) => s + ip.totalActualViews, 0);
  const totalPosts = ipList.reduce((s, ip) => s + ip.totalPosts, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Post IPs</h2>
        <p className="text-sm text-zinc-500 mt-1">
          IP performance ranked by post views — see which pages are winning
        </p>
      </div>

      {/* Top 3 Podium */}
      {(() => {
        if (ipList.length < 3) return null;
        const top3 = ipList.slice(0, 3);
        const podiumOrder = [top3[1], top3[0], top3[2]];
        const heights = [120, 160, 95];
        const medals = ["\u{1F948}", "\u{1F947}", "\u{1F949}"];
        const ranks = [2, 1, 3];
        const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
        const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];
        const glowColors = ["", "shadow-[0_0_40px_-5px_rgba(234,179,8,0.2)]", ""];

        return (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">{"\u{1F3C6}"}</span>
              <h3 className="text-lg font-black text-white uppercase tracking-wider">Top 3 Post IPs</h3>
            </div>
            <div className="flex items-end justify-center gap-3 sm:gap-4">
              {podiumOrder.map((ip, i) => (
                <div
                  key={ip.handle}
                  className={`transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}
                >
                  <span className={`text-2xl sm:text-3xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                    {medals[i]}
                  </span>
                  <p className={`font-semibold mb-1 truncate max-w-full text-center ${ranks[i] === 1 ? "text-sm text-white" : "text-xs text-zinc-300"}`}>
                    @{ip.handle}
                  </p>
                  <p className="text-[10px] text-zinc-500 mb-2">{ip.totalPosts} posts</p>
                  <div
                    className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} ${glowColors[i]} flex flex-col items-center justify-center`}
                    style={{ height: heights[i] }}
                  >
                    <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                      {formatCompact(ip.totalActualViews)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">total views</span>
                    <p className="text-[10px] text-zinc-600 mt-1.5">avg {formatCompact(ip.avgViews)}/post</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="max-w-sm mx-auto h-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full" />
          </div>
        );
      })()}

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Page</label>
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.handle.toLowerCase()}>@{p.handle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-6 pt-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-500"><span className="text-white font-bold">{ipList.length}</span> IPs</div>
          <div className="text-xs text-zinc-500"><span className="text-white font-bold">{totalPosts}</span> posts</div>
          <div className="text-xs text-zinc-500">Total views: <span className="text-white font-bold">{totalViews.toLocaleString()}</span></div>
        </div>
      </div>

      {/* IP Table */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>IP Handle</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead className="text-right">Total Views</TableHead>
              <TableHead className="text-right">Avg Views / Post</TableHead>
              <TableHead>Best Post</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">Loading...</TableCell>
              </TableRow>
            ) : ipList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                  {posts.length === 0 ? "No post data yet. Add posts from the Posts page." : "No IPs match this filter."}
                </TableCell>
              </TableRow>
            ) : (
              ipList.map((ip, idx) => (
                <TableRow key={ip.handle}>
                  <TableCell className="text-zinc-600 font-mono text-sm">{idx + 1}</TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium text-white">@{ip.handle}</span>
                      {ip.name && <span className="text-zinc-500 text-xs ml-2">({ip.name})</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{ip.totalPosts}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-white font-semibold">{ip.totalActualViews.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-zinc-400">{ip.avgViews.toLocaleString()}</TableCell>
                  <TableCell>
                    {ip.bestPost ? (
                      <a
                        href={ip.bestPost.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm"
                      >
                        {formatCompact(ip.bestPost.actual_views ?? 0)} views
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
