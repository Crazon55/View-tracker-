import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllContentEntries, updateContentEntry, getPages } from "@/services/api";
import type { Page } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PIPELINE_STAGES = [
  { value: "idea", label: "Idea", color: "border-zinc-600/50 bg-zinc-600/5", dot: "bg-zinc-500", headerBg: "bg-zinc-800/50", dropBg: "bg-zinc-700/20" },
  { value: "hooks_written", label: "Hooks Written", color: "border-blue-500/30 bg-blue-500/5", dot: "bg-blue-500", headerBg: "bg-blue-900/30", dropBg: "bg-blue-500/10" },
  { value: "base_cut_edited", label: "Base Cut / Edited", color: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-500", headerBg: "bg-amber-900/30", dropBg: "bg-amber-500/10" },
  { value: "captions_written", label: "Captions Written", color: "border-yellow-500/30 bg-yellow-500/5", dot: "bg-yellow-500", headerBg: "bg-yellow-900/30", dropBg: "bg-yellow-500/10" },
  { value: "scheduled", label: "Scheduled", color: "border-green-500/30 bg-green-500/5", dot: "bg-green-500", headerBg: "bg-green-900/30", dropBg: "bg-green-500/10" },
  { value: "posted", label: "Posted", color: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-500", headerBg: "bg-emerald-900/30", dropBg: "bg-emerald-500/10" },
];

export default function PipelineView() {
  const queryClient = useQueryClient();
  const [filterPage, setFilterPage] = useState("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Month filter
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const monthPrefix = `${monthDate.year}-${String(monthDate.month + 1).padStart(2, "0")}`;
  const monthLabel = new Date(monthDate.year, monthDate.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ["content-entries", "all"],
    queryFn: () => getAllContentEntries(),
  });

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateContentEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-entries"] });
      toast.success("Moved");
    },
    onError: () => toast.error("Failed to move"),
  });

  // Filter by page
  const pageFiltered = filterPage === "all"
    ? allEntries
    : allEntries.filter((e: any) => e.page_id === filterPage || e.ips === allPages.find((p) => p.id === filterPage)?.handle);

  // Filter by month
  const entries = pageFiltered.filter((e: any) => {
    const d = (e.upload_date || e.created_at || "")?.slice(0, 7);
    if (!d) return true;
    return d === monthPrefix;
  });

  function getPageHandle(entry: any): string {
    if (entry.ips) return entry.ips;
    const page = allPages.find((p) => p.id === entry.page_id);
    return page?.handle || "";
  }

  function handleDragStart(e: React.DragEvent, entryId: string) {
    setDraggingId(entryId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", entryId);
  }

  function handleDragOver(e: React.DragEvent, stageValue: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(stageValue);
  }

  function handleDragLeave() {
    setDropTarget(null);
  }

  function handleDrop(e: React.DragEvent, stageValue: string) {
    e.preventDefault();
    const entryId = e.dataTransfer.getData("text/plain");
    if (entryId) {
      updateMut.mutate({ id: entryId, data: { idea_status: stageValue } });
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function prevMonth() {
    setMonthDate((prev) => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 });
  }
  function nextMonth() {
    setMonthDate((prev) => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Pipeline</h1>
            <p className="text-zinc-500 mt-1">Drag cards between stages to update status</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Month nav */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm font-bold text-white min-w-[130px] text-center">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All IPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All IPs</SelectItem>
                {allPages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>@{p.handle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="bg-zinc-800 text-zinc-400">{entries.length} entries</Badge>
          </div>
        </div>

        {/* Kanban columns */}
        <div className="grid grid-cols-6 gap-3 items-start">
          {PIPELINE_STAGES.map((stage) => {
            const stageEntries = entries.filter((e: any) => (e.idea_status || "idea") === stage.value);
            const isDropping = dropTarget === stage.value;

            return (
              <div
                key={stage.value}
                className={`border rounded-xl min-h-[500px] transition-all ${isDropping ? `${stage.dropBg} border-2 scale-[1.01]` : stage.color}`}
                onDragOver={(e) => handleDragOver(e, stage.value)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.value)}
              >
                {/* Column header */}
                <div className={`px-3 py-3 rounded-t-xl ${stage.headerBg} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">{stage.label}</span>
                  </div>
                  <Badge className="bg-zinc-900/50 text-zinc-400 text-[10px]">{stageEntries.length}</Badge>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2">
                  {stageEntries.map((entry: any) => {
                    const handle = getPageHandle(entry);
                    const isDragging = draggingId === entry.id;

                    return (
                      <div
                        key={entry.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, entry.id)}
                        onDragEnd={handleDragEnd}
                        className={`bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all hover:border-zinc-700 ${isDragging ? "opacity-40 scale-95" : ""}`}
                      >
                        <p className="text-xs font-semibold text-white truncate mb-1">{entry.idea_name}</p>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[9px] uppercase text-zinc-500">{entry.content_type}</span>
                          {handle && <span className="text-[9px] text-zinc-600">@{handle}</span>}
                        </div>
                        {entry.views > 0 && (
                          <p className="text-[10px] font-mono text-violet-400 mb-1">{(entry.views ?? 0).toLocaleString()} views</p>
                        )}
                        {entry.deadline && (
                          <p className={`text-[9px] mb-1 ${entry.deadline <= new Date().toISOString().slice(0, 10) ? "text-red-400 font-bold" : "text-zinc-500"}`}>
                            Due: {entry.deadline.slice(0, 10)}
                          </p>
                        )}
                        {entry.created_by && (
                          <p className="text-[9px] text-zinc-600">{entry.created_by}</p>
                        )}
                        {entry.url && (
                          <a href={entry.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[9px] text-violet-400 hover:underline flex items-center gap-1 mt-1">
                            <ExternalLink className="w-3 h-3" /> Link
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {stageEntries.length === 0 && (
                    <p className="text-center text-zinc-700 text-[10px] py-12">Drop here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
