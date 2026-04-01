import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPages } from "@/services/api";
import type { Page } from "@/types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const COLORS = ["#a855f7", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f43f5e", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#e879f9"];

const BASE_URL = import.meta.env.VITE_API_URL || "";

async function fetchAllDashboardViews(): Promise<any[]> {
  const pagesRes = await fetch(`${BASE_URL}/api/v1/pages`, {
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
  });
  const pagesData = await pagesRes.json();
  const pages = pagesData.data ?? pagesData ?? [];

  const allViews: any[] = [];
  for (const page of pages) {
    const res = await fetch(`${BASE_URL}/api/v1/pages/${page.id}/dashboard-views`, {
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    });
    const data = await res.json();
    const views = data.data ?? data ?? [];
    for (const v of views) {
      allViews.push({ ...v, handle: page.handle, page_name: page.name, stage: page.stage ?? 1 });
    }
  }
  return allViews;
}

function MonthSection({ month, views, allPages }: { month: string; views: any[]; allPages: Page[] }) {
  const [expanded, setExpanded] = useState(true);
  const monthLabel = new Date(month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalViews = views.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0);

  // Split by stage
  const stage3 = views.filter((v) => v.stage === 3).sort((a: any, b: any) => ((b.reel_views ?? 0) + (b.post_views ?? 0)) - ((a.reel_views ?? 0) + (a.post_views ?? 0)));
  const stage1 = views.filter((v) => v.stage === 1).sort((a: any, b: any) => ((b.reel_views ?? 0) + (b.post_views ?? 0)) - ((a.reel_views ?? 0) + (a.post_views ?? 0)));
  const stage2 = views.filter((v) => v.stage === 2).sort((a: any, b: any) => ((b.reel_views ?? 0) + (b.post_views ?? 0)) - ((a.reel_views ?? 0) + (a.post_views ?? 0)));

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Month header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-8 py-6 bg-zinc-900 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          {expanded ? <ChevronDown className="w-5 h-5 text-zinc-500" /> : <ChevronRight className="w-5 h-5 text-zinc-500" />}
          <h2 className="text-2xl font-black text-white uppercase tracking-wider">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <span className="text-2xl font-black text-violet-400 tabular-nums">{formatCompact(totalViews)}</span>
          <span className="text-sm text-zinc-500">total views</span>
        </div>
      </button>

      {expanded && (
        <div className="px-8 py-8 space-y-10">

          {/* Stage 3 — Main IPs */}
          {stage3.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="text-lg font-bold text-white">Stage 3 — Main IPs</h3>
                <span className="text-sm text-zinc-500">
                  {formatCompact(stage3.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0))} views
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-64">IP</th>
                      <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Reel Views</th>
                      <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Post Views</th>
                      <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Total</th>
                      <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-28">% Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage3.map((v) => {
                      const total = (v.reel_views ?? 0) + (v.post_views ?? 0);
                      return (
                        <tr key={v.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                          <td className="py-4 px-4">
                            <span className="text-base font-semibold text-white">@{v.handle}</span>
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-base text-zinc-300 tabular-nums">{(v.reel_views ?? 0).toLocaleString()}</td>
                          <td className="py-4 px-4 text-right font-mono text-base text-zinc-300 tabular-nums">{(v.post_views ?? 0).toLocaleString()}</td>
                          <td className="py-4 px-4 text-right font-mono text-base font-bold text-white tabular-nums">{total.toLocaleString()}</td>
                          <td className="py-4 px-4 text-right text-sm text-zinc-500">
                            {totalViews > 0 ? ((total / totalViews) * 100).toFixed(1) + "%" : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700">
                      <td className="py-4 px-4 text-sm font-bold text-zinc-400">Total</td>
                      <td className="py-4 px-4 text-right font-mono text-sm font-bold text-zinc-400 tabular-nums">
                        {stage3.reduce((s, v) => s + (v.reel_views ?? 0), 0).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-sm font-bold text-zinc-400 tabular-nums">
                        {stage3.reduce((s, v) => s + (v.post_views ?? 0), 0).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-sm font-bold text-white tabular-nums">
                        {stage3.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right text-sm text-zinc-500">
                        {totalViews > 0 ? ((stage3.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0) / totalViews) * 100).toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Stage 2 */}
          {stage2.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <h3 className="text-lg font-bold text-white">Stage 2</h3>
                <span className="text-sm text-zinc-500">
                  {formatCompact(stage2.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0))} views
                </span>
              </div>
              <StageTable views={stage2} totalViews={totalViews} />
            </div>
          )}

          {/* Stage 1 */}
          {stage1.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-lg font-bold text-white">Stage 1</h3>
                <span className="text-sm text-zinc-500">
                  {formatCompact(stage1.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0))} views
                </span>
              </div>
              <StageTable views={stage1} totalViews={totalViews} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageTable({ views, totalViews }: { views: any[]; totalViews: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-64">IP</th>
            <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">Views</th>
            <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 w-28">% Share</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => {
            const total = (v.reel_views ?? 0) + (v.post_views ?? 0);
            return (
              <tr key={v.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                <td className="py-4 px-4">
                  <span className="text-base font-semibold text-white">@{v.handle}</span>
                </td>
                <td className="py-4 px-4 text-right font-mono text-base font-bold text-white tabular-nums">{total.toLocaleString()}</td>
                <td className="py-4 px-4 text-right text-sm text-zinc-500">
                  {totalViews > 0 ? ((total / totalViews) * 100).toFixed(1) + "%" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700">
            <td className="py-4 px-4 text-sm font-bold text-zinc-400">Total</td>
            <td className="py-4 px-4 text-right font-mono text-sm font-bold text-white tabular-nums">
              {views.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0).toLocaleString()}
            </td>
            <td className="py-4 px-4 text-right text-sm text-zinc-500">
              {totalViews > 0 ? ((views.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0) / totalViews) * 100).toFixed(1) + "%" : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function GrowthView() {
  const [selectedPage, setSelectedPage] = useState<string>("all");

  const { data: allPages = [] } = useQuery<Page[]>({ queryKey: ["pages"], queryFn: getPages });
  const { data: dashboardViews = [], isLoading } = useQuery({
    queryKey: ["all-dashboard-views"],
    queryFn: fetchAllDashboardViews,
  });

  // Group by month
  const months = new Set<string>();
  const handleSet = new Set<string>();
  for (const v of dashboardViews) {
    if (v.month) months.add(v.month.slice(0, 7));
    if (v.handle) handleSet.add(v.handle);
  }
  const sortedMonths = [...months].sort().reverse();

  // Filter views by selected page
  const filteredViews = selectedPage === "all"
    ? dashboardViews
    : dashboardViews.filter((v) => {
        const page = allPages.find((p) => p.id === selectedPage);
        return page && v.handle === page.handle;
      });

  // Chart data
  const pageHandles = selectedPage === "all"
    ? [...handleSet]
    : [allPages.find((p) => p.id === selectedPage)?.handle || ""];

  const chartData = [...months].sort().map((month) => {
    const row: any = {
      name: new Date(month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    };
    for (const handle of pageHandles) {
      const entry = filteredViews.find((v) => v.month?.slice(0, 7) === month && v.handle === handle);
      row[handle] = entry ? (entry.reel_views ?? 0) + (entry.post_views ?? 0) : 0;
    }
    return row;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading growth data...</p>
        </div>
      </div>
    );
  }

  // Total across all months
  const grandTotal = filteredViews.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10">
      <div className="max-w-7xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-wider">Growth</h1>
            <p className="text-sm text-zinc-500 mt-2">Monthly views breakdown by page and stage</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">All Time Total</p>
              <p className="text-3xl font-black text-violet-400 tabular-nums">{formatCompact(grandTotal)}</p>
            </div>
            <Select value={selectedPage} onValueChange={setSelectedPage}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                {allPages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>@{p.handle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overview Chart */}
        {chartData.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400 font-semibold mb-6">
              {selectedPage === "all" ? "All Pages — Monthly Comparison" : `@${pageHandles[0]} — Monthly Trend`}
            </h2>
            <ResponsiveContainer width="100%" height={450}>
              {selectedPage === "all" ? (
                <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, padding: "12px 16px" }}
                    labelStyle={{ color: "#d4d4d8", fontSize: 13, fontWeight: "bold", marginBottom: 8 }}
                    formatter={(value: number, name: string) => [formatCompact(value), `@${name}`]}
                  />
                  <Legend formatter={(value) => `@${value}`} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
                  {pageHandles.map((handle, i) => (
                    <Bar key={handle} dataKey={handle} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 12, padding: "12px 16px" }}
                    labelStyle={{ color: "#d4d4d8", fontSize: 13, fontWeight: "bold" }}
                    formatter={(value: number) => [formatCompact(value), "Views"]}
                  />
                  {pageHandles.map((handle, i) => (
                    <Line key={handle} type="monotone" dataKey={handle} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* Monthly Sections */}
        <div className="space-y-6">
          {sortedMonths.map((month) => {
            const monthViews = filteredViews.filter((v) => v.month?.slice(0, 7) === month);
            if (monthViews.length === 0) return null;
            return <MonthSection key={month} month={month} views={monthViews} allPages={allPages} />;
          })}
        </div>

        {sortedMonths.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-lg">No growth data yet.</p>
            <p className="text-zinc-600 text-sm mt-2">Add dashboard views for pages to see growth trends here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
