import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllContentEntries, updateContentEntry, getPages } from "@/services/api";
import type { Page } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PIPELINE_STAGES = [
  { value: "idea", label: "Idea", color: "border-zinc-600/50 bg-zinc-600/5", dot: "bg-zinc-500", headerBg: "bg-zinc-800/50" },
  { value: "hooks_written", label: "Hooks Written", color: "border-blue-500/30 bg-blue-500/5", dot: "bg-blue-500", headerBg: "bg-blue-900/30" },
  { value: "base_cut_edited", label: "Base Cut / Edited", color: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-500", headerBg: "bg-amber-900/30" },
  { value: "captions_written", label: "Captions Written", color: "border-yellow-500/30 bg-yellow-500/5", dot: "bg-yellow-500", headerBg: "bg-yellow-900/30" },
  { value: "scheduled", label: "Scheduled", color: "border-green-500/30 bg-green-500/5", dot: "bg-green-500", headerBg: "bg-green-900/30" },
  { value: "posted", label: "Posted", color: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-500", headerBg: "bg-emerald-900/30" },
];

export default function PipelineView() {
  const queryClient = useQueryClient();
  const [filterPage, setFilterPage] = useState("all");

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
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const entries = filterPage === "all"
    ? allEntries
    : allEntries.filter((e: any) => e.page_id === filterPage || e.ips === allPages.find((p) => p.id === filterPage)?.handle);

  function getPageHandle(entry: any): string {
    if (entry.ips) return entry.ips;
    const page = allPages.find((p) => p.id === entry.page_id);
    return page?.handle || "";
  }

  function moveToStage(entryId: string, newStatus: string) {
    updateMut.mutate({ id: entryId, data: { idea_status: newStatus } });
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
            <p className="text-zinc-500 mt-1">Track every idea from creation to posted — drag through stages</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-52">
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
            return (
              <div key={stage.value} className={`border rounded-xl ${stage.color} min-h-[400px]`}>
                {/* Column header */}
                <div className={`px-3 py-3 rounded-t-xl ${stage.headerBg} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{stage.label}</span>
                  </div>
                  <Badge className="bg-zinc-900/50 text-zinc-400 text-[10px]">{stageEntries.length}</Badge>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2">
                  {stageEntries.map((entry: any) => {
                    const handle = getPageHandle(entry);
                    const stageIdx = PIPELINE_STAGES.findIndex((s) => s.value === stage.value);
                    const nextStage = stageIdx < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[stageIdx + 1] : null;
                    const prevStage = stageIdx > 0 ? PIPELINE_STAGES[stageIdx - 1] : null;

                    return (
                      <div key={entry.id} className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors">
                        <p className="text-xs font-semibold text-white truncate mb-1">{entry.idea_name}</p>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[9px] uppercase text-zinc-500">{entry.content_type}</span>
                          {handle && <span className="text-[9px] text-zinc-600">@{handle}</span>}
                        </div>
                        {entry.views > 0 && (
                          <p className="text-[10px] font-mono text-violet-400 mb-2">{(entry.views ?? 0).toLocaleString()} views</p>
                        )}
                        {entry.deadline && (
                          <p className={`text-[9px] mb-2 ${entry.deadline <= new Date().toISOString().slice(0, 10) ? "text-red-400 font-bold" : "text-zinc-500"}`}>
                            Deadline: {entry.deadline.slice(0, 10)}
                          </p>
                        )}
                        {entry.created_by && (
                          <p className="text-[9px] text-zinc-600 mb-2">{entry.created_by}</p>
                        )}
                        {entry.url && (
                          <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-violet-400 hover:underline flex items-center gap-1 mb-2">
                            <ExternalLink className="w-3 h-3" /> Link
                          </a>
                        )}
                        {/* Move buttons */}
                        <div className="flex items-center gap-1 mt-1 pt-2 border-t border-zinc-800">
                          {prevStage && (
                            <button
                              onClick={() => moveToStage(entry.id, prevStage.value)}
                              className="text-[9px] text-zinc-500 hover:text-white px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
                            >
                              &larr; {prevStage.label}
                            </button>
                          )}
                          <div className="flex-1" />
                          {nextStage && (
                            <button
                              onClick={() => moveToStage(entry.id, nextStage.value)}
                              className="text-[9px] text-violet-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-violet-600/20 transition-colors"
                            >
                              {nextStage.label} &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageEntries.length === 0 && (
                    <p className="text-center text-zinc-700 text-[10px] py-8">No entries</p>
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
