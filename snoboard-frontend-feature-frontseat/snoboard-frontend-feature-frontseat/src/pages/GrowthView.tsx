import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPages, getDashboard } from "@/services/api";
import type { Page } from "@/types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const COLORS = ["#a855f7", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f43f5e", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1"];

const BASE_URL = import.meta.env.VITE_API_URL || "";

async function fetchAllDashboardViews(): Promise<any[]> {
  // Fetch dashboard views for all pages
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
      allViews.push({ ...v, handle: page.handle, page_name: page.name });
    }
  }
  return allViews;
}

type ViewMode = "chart" | "table";

export default function GrowthView() {
  const [selectedPage, setSelectedPage] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");

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
  const sortedMonths = [...months].sort();

  // Build chart data
  const pageHandles = selectedPage === "all"
    ? [...handleSet].slice(0, 10)
    : [allPages.find((p) => p.id === selectedPage)?.handle || ""];

  const chartData = sortedMonths.map((month) => {
    const row: any = {
      name: new Date(month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      month,
    };
    for (const handle of pageHandles) {
      const entry = dashboardViews.find((v) => v.month?.slice(0, 7) === month && v.handle === handle);
      row[handle] = entry ? (entry.reel_views ?? 0) + (entry.post_views ?? 0) : 0;
    }
    return row;
  });

  // Table data: per page, per month
  const tablePages = selectedPage === "all"
    ? allPages.filter((p) => handleSet.has(p.handle))
    : allPages.filter((p) => p.id === selectedPage);

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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Growth</h2>
          <p className="text-sm text-zinc-500 mt-1">Monthly views per page over time</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
            <button onClick={() => setViewMode("chart")} className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${viewMode === "chart" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Chart</button>
            <button onClick={() => setViewMode("table")} className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${viewMode === "table" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Table</button>
          </div>
          <Select value={selectedPage} onValueChange={setSelectedPage}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All pages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pages (top 10)</SelectItem>
              {allPages.map((p) => (
                <SelectItem key={p.id} value={p.id}>@{p.handle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {viewMode === "chart" ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={400}>
                {selectedPage === "all" ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                      labelStyle={{ color: "#d4d4d8", fontSize: 12 }}
                      formatter={(value: number, name: string) => [formatCompact(value), `@${name}`]}
                    />
                    <Legend formatter={(value) => `@${value}`} />
                    {pageHandles.map((handle, i) => (
                      <Bar key={handle} dataKey={handle} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                      labelStyle={{ color: "#d4d4d8", fontSize: 12 }}
                      formatter={(value: number) => [formatCompact(value), "Views"]}
                    />
                    {pageHandles.map((handle, i) => (
                      <Line key={handle} type="monotone" dataKey={handle} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
              {selectedPage === "all" && (
                <div className="flex items-center gap-4 mt-4 flex-wrap justify-center">
                  {pageHandles.map((handle, i) => (
                    <div key={handle} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-zinc-400">@{handle}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-zinc-500 py-12">No growth data yet.</p>
          )}
        </div>
      ) : (
        /* Table view */
        <div className="space-y-6">
          {sortedMonths.slice().reverse().map((month) => {
            const monthLabel = new Date(month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            const monthViews = dashboardViews.filter((v) => v.month?.slice(0, 7) === month);
            const filteredViews = selectedPage === "all"
              ? monthViews
              : monthViews.filter((v) => {
                  const page = allPages.find((p) => p.id === selectedPage);
                  return page && v.handle === page.handle;
                });
            const totalViews = filteredViews.reduce((s, v) => s + (v.reel_views ?? 0) + (v.post_views ?? 0), 0);

            if (filteredViews.length === 0) return null;

            return (
              <div key={month} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{monthLabel}</h3>
                  <span className="text-sm font-bold text-violet-400">{formatCompact(totalViews)} total</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-2 px-3">IP</th>
                        <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-2 px-3">Views</th>
                        <th className="text-right text-zinc-500 text-xs uppercase tracking-wider py-2 px-3">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViews
                        .map((v) => ({ ...v, total: (v.reel_views ?? 0) + (v.post_views ?? 0) }))
                        .sort((a, b) => b.total - a.total)
                        .map((v) => (
                          <tr key={v.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="py-2.5 px-3 font-semibold text-white">@{v.handle}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-white tabular-nums">{v.total.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right text-zinc-500">
                              {totalViews > 0 ? ((v.total / totalViews) * 100).toFixed(1) + "%" : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
