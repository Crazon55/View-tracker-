import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPages, getAllContentEntries } from "@/services/api";
import type { Page } from "@/types";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

function classifyNiche(handle: string): "tech" | "fbs" {
  const lower = handle.toLowerCase();
  if (lower.includes("tech")) return "tech";
  if (lower === "ai.cracked" || lower.includes("goodai") || lower === "indianaipage" || lower === "neworderai") return "tech";
  return "fbs";
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

// Get Monday of the week containing the given date
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatRangeLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monStr = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const sunStr = sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${monStr} — ${sunStr}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Stage1Tracker() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["content-entries", "all"],
    queryFn: () => getAllContentEntries(),
  });

  const stage1Pages = allPages
    .filter((p) => (p.stage ?? 1) === 1)
    .sort((a, b) => a.handle.localeCompare(b.handle));

  const fbsPages = stage1Pages.filter((p) => classifyNiche(p.handle) === "fbs");
  const techPages = stage1Pages.filter((p) => classifyNiche(p.handle) === "tech");

  // Build day keys for the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const dayKeys = weekDays.map(formatDateKey);

  // Calculate views for a page on a specific day
  function getViewsForCell(pageId: string, dayKey: string): number {
    return entries
      .filter((e: any) => {
        if (e.page_id !== pageId) return false;
        const date = (e.upload_date || e.created_at || "").slice(0, 10);
        return date === dayKey;
      })
      .reduce((sum: number, e: any) => sum + (e.views ?? 0), 0);
  }

  // Row total for a page
  function getRowTotal(pageId: string): number {
    return dayKeys.reduce((sum, key) => sum + getViewsForCell(pageId, key), 0);
  }

  // Column total for a day
  function getColumnTotal(dayKey: string, pages: Page[]): number {
    return pages.reduce((sum, p) => sum + getViewsForCell(p.id, dayKey), 0);
  }

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + 7);
    setWeekStart(d);
  }

  function thisWeek() {
    setWeekStart(getMonday(new Date()));
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderTable = (sectionLabel: string, pages: Page[], color: string) => (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <h3 className="text-lg font-bold text-white">{sectionLabel}</h3>
        <span className="text-sm text-zinc-500">{pages.length} pages</span>
      </div>
      {pages.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-8 bg-zinc-900/30 rounded-xl border border-zinc-800">No pages in this niche</p>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left text-zinc-500 text-xs uppercase tracking-wider py-3 px-4 sticky left-0 bg-zinc-900/50 min-w-[180px]">Page</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="text-right text-zinc-500 text-xs uppercase tracking-wider py-3 px-4">
                    <div className="text-zinc-400 font-bold">{DAYS[i]}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                ))}
                <th className="text-right text-violet-400 text-xs uppercase tracking-wider py-3 px-4 bg-violet-500/5">Total</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const rowTotal = getRowTotal(page.id);
                return (
                  <tr key={page.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3 px-4 sticky left-0 bg-zinc-950">
                      <div>
                        <p className="text-sm font-semibold text-white">{page.name || page.handle}</p>
                        <p className="text-[11px] text-zinc-500">@{page.handle}</p>
                      </div>
                    </td>
                    {dayKeys.map((key) => {
                      const views = getViewsForCell(page.id, key);
                      return (
                        <td key={key} className="py-3 px-4 text-right font-mono text-sm">
                          {views > 0 ? (
                            <span className="text-white">{views.toLocaleString()}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold bg-violet-500/5">
                      {rowTotal > 0 ? <span className="text-violet-400">{formatCompact(rowTotal)}</span> : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700 bg-zinc-900/80">
                <td className="py-3 px-4 sticky left-0 bg-zinc-900/80 text-xs font-bold text-zinc-400 uppercase">Daily Total</td>
                {dayKeys.map((key) => {
                  const total = getColumnTotal(key, pages);
                  return (
                    <td key={key} className="py-3 px-4 text-right font-mono text-sm font-bold">
                      {total > 0 ? <span className="text-emerald-400">{formatCompact(total)}</span> : <span className="text-zinc-700">—</span>}
                    </td>
                  );
                })}
                <td className="py-3 px-4 text-right font-mono text-sm font-black text-violet-300 bg-violet-500/10">
                  {formatCompact(pages.reduce((s, p) => s + getRowTotal(p.id), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 pr-6 pb-8 pt-20 pl-20 sm:px-6 sm:py-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6 pr-72">
          <h1 className="text-3xl font-black text-white">Stage 1 Tracker</h1>
          <p className="text-zinc-500 mt-1">Weekly view tracker for Stage 1 IPs — aggregated automatically from content entries</p>
        </div>
        <div className="flex items-center gap-2 mb-8">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={prevWeek}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-bold text-white min-w-[180px] text-center">{formatRangeLabel(weekStart)}</span>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={nextWeek}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" className="text-xs text-zinc-400 ml-2" onClick={thisWeek}>This Week</Button>
        </div>

        {renderTable("FBS", fbsPages, "bg-amber-500")}
        {renderTable("AI / Tech", techPages, "bg-cyan-500")}
      </div>
    </div>
  );
}
