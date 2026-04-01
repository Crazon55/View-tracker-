import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPages, getAutoReels, getManualReels, getPosts } from "@/services/api";
import type { Page } from "@/types";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const COLORS = ["#a855f7", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#f43f5e", "#8b5cf6", "#14b8a6"];

export default function GrowthView() {
  const [selectedPage, setSelectedPage] = useState<string>("all");

  const { data: allPages = [] } = useQuery<Page[]>({ queryKey: ["pages"], queryFn: getPages });
  const { data: autoReels = [] } = useQuery({ queryKey: ["reels", "auto"], queryFn: getAutoReels });
  const { data: manualReels = [] } = useQuery({ queryKey: ["reels", "manual"], queryFn: getManualReels });
  const { data: allPosts = [] } = useQuery({ queryKey: ["posts"], queryFn: getPosts });

  const allReels = [...autoReels, ...manualReels];

  // Group views by month per page
  const monthlyData: Record<string, Record<string, number>> = {};

  for (const r of allReels) {
    const month = (r.posted_at || "")?.slice(0, 7);
    if (!month) continue;
    const handle = r.pages?.handle || "unknown";
    const pageId = r.page_id;
    if (selectedPage !== "all" && pageId !== selectedPage) continue;
    if (!monthlyData[month]) monthlyData[month] = {};
    const key = selectedPage === "all" ? "all" : handle;
    monthlyData[month][key] = (monthlyData[month][key] || 0) + (r.views ?? 0);
  }

  for (const p of allPosts) {
    const month = (p.posted_at || p.created_at || "")?.slice(0, 7);
    if (!month) continue;
    const handle = p.pages?.handle || "unknown";
    const pageId = p.page_id;
    if (selectedPage !== "all" && pageId !== selectedPage) continue;
    if (!monthlyData[month]) monthlyData[month] = {};
    const key = selectedPage === "all" ? "all" : handle;
    monthlyData[month][key] = (monthlyData[month][key] || 0) + (p.actual_views ?? 0);
  }

  // For "all pages" view, show top pages as separate lines
  let chartData: any[] = [];
  let lineKeys: string[] = [];

  if (selectedPage === "all") {
    // Group by month, with each page as a separate key
    const pageMonthly: Record<string, Record<string, number>> = {};
    for (const r of allReels) {
      const month = (r.posted_at || "")?.slice(0, 7);
      if (!month) continue;
      const handle = r.pages?.handle || "unknown";
      if (!pageMonthly[month]) pageMonthly[month] = {};
      pageMonthly[month][handle] = (pageMonthly[month][handle] || 0) + (r.views ?? 0);
    }
    for (const p of allPosts) {
      const month = (p.posted_at || p.created_at || "")?.slice(0, 7);
      if (!month) continue;
      const handle = p.pages?.handle || "unknown";
      if (!pageMonthly[month]) pageMonthly[month] = {};
      pageMonthly[month][handle] = (pageMonthly[month][handle] || 0) + (p.actual_views ?? 0);
    }

    // Find top 6 pages by total views
    const pageTotals: Record<string, number> = {};
    for (const month of Object.values(pageMonthly)) {
      for (const [handle, views] of Object.entries(month)) {
        pageTotals[handle] = (pageTotals[handle] || 0) + views;
      }
    }
    lineKeys = Object.entries(pageTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([handle]) => handle);

    chartData = Object.entries(pageMonthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pages]) => {
        const row: any = {
          name: new Date(month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        };
        for (const key of lineKeys) {
          row[key] = pages[key] || 0;
        }
        return row;
      });
  } else {
    // Single page view
    const handle = allPages.find((p) => p.id === selectedPage)?.handle || "page";
    lineKeys = [handle];
    chartData = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        name: new Date(month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        [handle]: data[handle] || 0,
      }));
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Growth</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Views over time — monthly trend per page
          </p>
        </div>
        <Select value={selectedPage} onValueChange={setSelectedPage}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All pages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pages (top 6)</SelectItem>
            {allPages.map((p) => (
              <SelectItem key={p.id} value={p.id}>@{p.handle}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chartData.length > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#d4d4d8", fontSize: 12 }}
                formatter={(value: number, name: string) => [value.toLocaleString() + " views", "@" + name]}
              />
              {lineKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 flex-wrap justify-center">
            {lineKeys.map((key, i) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-zinc-400">@{key}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <p className="text-zinc-500">No data yet. Add reels and posts to see growth trends.</p>
        </div>
      )}
    </div>
  );
}
