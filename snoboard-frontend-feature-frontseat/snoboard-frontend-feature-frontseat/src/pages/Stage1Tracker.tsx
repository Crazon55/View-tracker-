import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPages, getAllContentEntries } from "@/services/api";
import type { Page } from "@/types";
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

function cellColor(views: number): string {
  if (views <= 0) return "";
  if (views < 10_000) return "text-zinc-200";
  if (views < 100_000) return "text-amber-300";
  return "text-emerald-300";
}

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

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const dayKeys = weekDays.map(formatDateKey);
  const todayKey = formatDateKey(new Date());

  function getViewsForCell(pageId: string, dayKey: string): number {
    return entries
      .filter((e: any) => {
        if (e.page_id !== pageId) return false;
        const date = (e.upload_date || e.created_at || "").slice(0, 10);
        return date === dayKey;
      })
      .reduce((sum: number, e: any) => sum + (e.views ?? 0), 0);
  }

  function getRowTotal(pageId: string): number {
    return dayKeys.reduce((sum, key) => sum + getViewsForCell(pageId, key), 0);
  }

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

  const fbsTotal = fbsPages.reduce((s, p) => s + getRowTotal(p.id), 0);
  const techTotal = techPages.reduce((s, p) => s + getRowTotal(p.id), 0);
  const grandTotal = fbsTotal + techTotal;

  const renderTable = (
    label: string,
    pages: Page[],
    barClass: string,
    chipBg: string,
    chipText: string,
    sectionTotal: number,
  ) => (
    <div className="mb-12">
      {/* Section header */}
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-1 h-7 rounded-full shrink-0 ${barClass}`} />
        <h3 className="text-base font-black text-white uppercase tracking-widest">{label}</h3>
        <span className="text-xs text-zinc-600">{pages.length} pages</span>
        {sectionTotal > 0 && (
          <div className={`ml-auto text-xs font-black px-3 py-1.5 rounded-lg ${chipBg} ${chipText} tracking-wide`}>
            {formatCompact(sectionTotal)} this week
          </div>
        )}
      </div>

      {pages.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-10 bg-zinc-900/30 rounded-2xl border border-zinc-800">
          No pages in this niche
        </p>
      ) : (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-zinc-900/70 border-b border-zinc-800">
                  <th className="text-left py-4 px-5 sticky left-0 bg-zinc-900/70 min-w-[210px] w-[210px]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Page</span>
                  </th>
                  {weekDays.map((d, i) => {
                    const isToday = dayKeys[i] === todayKey;
                    return (
                      <th
                        key={i}
                        className={`text-center py-4 px-3 w-[90px] ${isToday ? "bg-violet-500/10" : ""}`}
                      >
                        <div className={`text-[11px] font-black uppercase tracking-wider ${isToday ? "text-violet-300" : "text-zinc-500"}`}>
                          {DAYS[i]}
                        </div>
                        <div className={`text-[10px] mt-0.5 tabular-nums ${isToday ? "text-violet-400/70" : "text-zinc-700"}`}>
                          {d.getDate()}/{d.getMonth() + 1}
                        </div>
                        {isToday && (
                          <div className="w-1 h-1 rounded-full bg-violet-400 mx-auto mt-1.5" />
                        )}
                      </th>
                    );
                  })}
                  <th className="text-center py-4 px-4 bg-violet-500/8 w-[90px]">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">Total</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page, idx) => {
                  const rowTotal = getRowTotal(page.id);
                  return (
                    <tr
                      key={page.id}
                      className={`group border-b border-zinc-800/40 hover:bg-zinc-900/50 transition-colors last:border-0 ${idx % 2 === 0 ? "" : "bg-zinc-900/20"}`}
                    >
                      <td className="py-3.5 px-5 sticky left-0 bg-zinc-950 group-hover:bg-zinc-900/50 transition-colors">
                        <p className="text-sm font-semibold text-white leading-tight">{page.name || page.handle}</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">@{page.handle}</p>
                      </td>
                      {dayKeys.map((key, i) => {
                        const views = getViewsForCell(page.id, key);
                        const isToday = key === todayKey;
                        return (
                          <td
                            key={key}
                            className={`py-3.5 px-3 text-center tabular-nums ${isToday ? "bg-violet-500/5" : ""}`}
                          >
                            {views > 0 ? (
                              <span className={`font-mono text-sm font-semibold ${cellColor(views)}`}>
                                {formatCompact(views)}
                              </span>
                            ) : (
                              <span className="text-zinc-800 select-none">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3.5 px-4 text-center bg-violet-500/5 tabular-nums">
                        {rowTotal > 0 ? (
                          <span className="font-mono text-sm font-black text-violet-300">
                            {formatCompact(rowTotal)}
                          </span>
                        ) : (
                          <span className="text-zinc-800 select-none">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 bg-zinc-900/60">
                  <td className="py-3 px-5 sticky left-0 bg-zinc-900/60">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Daily Total</span>
                  </td>
                  {dayKeys.map((key, i) => {
                    const total = getColumnTotal(key, pages);
                    const isToday = key === todayKey;
                    return (
                      <td key={key} className={`py-3 px-3 text-center tabular-nums ${isToday ? "bg-violet-500/5" : ""}`}>
                        {total > 0 ? (
                          <span className="font-mono text-sm font-bold text-emerald-400">{formatCompact(total)}</span>
                        ) : (
                          <span className="text-zinc-800 select-none">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-4 text-center bg-violet-500/10 tabular-nums">
                    <span className="font-mono text-sm font-black text-violet-200">
                      {formatCompact(sectionTotal)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-6 sm:px-8 lg:px-12">
      <div className="max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Stage 1 Tracker</h1>
            <p className="text-zinc-500 mt-1.5 text-sm">
              Weekly views for Stage 1 IPs — aggregated from content entries
            </p>
          </div>

          {/* Summary stats */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[11px] text-zinc-500 font-medium">FBS</span>
              <span className="text-sm font-black text-white tabular-nums">{fbsTotal > 0 ? formatCompact(fbsTotal) : "—"}</span>
            </div>
            <div className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
              <span className="text-[11px] text-zinc-500 font-medium">Tech</span>
              <span className="text-sm font-black text-white tabular-nums">{techTotal > 0 ? formatCompact(techTotal) : "—"}</span>
            </div>
            <div className="flex items-center gap-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2.5">
              <span className="text-[11px] text-violet-400 font-medium">Week</span>
              <span className="text-sm font-black text-violet-200 tabular-nums">{grandTotal > 0 ? formatCompact(grandTotal) : "—"}</span>
            </div>
          </div>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-1 mb-10 w-fit bg-zinc-900/50 border border-zinc-800 rounded-2xl px-3 py-2.5">
          <button
            onClick={prevWeek}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white px-4 min-w-[200px] text-center">
            {formatRangeLabel(weekStart)}
          </span>
          <button
            onClick={nextWeek}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button
            onClick={thisWeek}
            className="text-[11px] font-bold text-zinc-500 hover:text-violet-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-violet-500/10 uppercase tracking-wider"
          >
            Today
          </button>
        </div>

        {renderTable("FBS", fbsPages, "bg-amber-500", "bg-amber-500/10", "text-amber-300", fbsTotal)}
        {renderTable("AI / Tech", techPages, "bg-cyan-500", "bg-cyan-500/10", "text-cyan-300", techTotal)}
      </div>
    </div>
  );
}
