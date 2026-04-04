import { useQuery } from "@tanstack/react-query";
import { getPages } from "@/services/api";
import type { Page } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Home, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STAGES = [
  { value: 1, label: "Stage 1", color: "border-blue-500/30 bg-blue-500/5", badge: "bg-blue-500/20 text-blue-400", dot: "bg-blue-500" },
  { value: 2, label: "Stage 2", color: "border-amber-500/30 bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", dot: "bg-amber-500" },
  { value: 3, label: "Stage 3", color: "border-emerald-500/30 bg-emerald-500/5", badge: "bg-emerald-500/20 text-emerald-400", dot: "bg-emerald-500" },
];

export default function PostIPsView() {
  const navigate = useNavigate();

  const { data: pages = [], isLoading } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">Post IPs</h1>
          <p className="text-zinc-500 mt-1">All Instagram pages organized by stage — click an IP to manage its posts</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {STAGES.map((stage) => {
            const stagePages = pages.filter((p) => (p.stage ?? 1) === stage.value).sort((a, b) => a.handle.localeCompare(b.handle));

            return (
              <div key={stage.value} className={`border rounded-2xl p-5 ${stage.color}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                    <h3 className="text-lg font-bold text-white">{stage.label}</h3>
                  </div>
                  <Badge className={`${stage.badge} text-[10px]`}>{stagePages.length}</Badge>
                </div>

                <div className="space-y-2">
                  {stagePages.map((page) => (
                    <div
                      key={page.id}
                      className="group flex items-center justify-between bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 cursor-pointer transition-all"
                      onClick={() => navigate(`/post-ips/${page.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Home className="w-4 h-4 text-zinc-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {page.name || page.handle}
                          </p>
                          <p className="text-[11px] text-zinc-500">@{page.handle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={`https://www.instagram.com/${page.handle}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-violet-400"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}

                  {stagePages.length === 0 && (
                    <p className="text-center text-zinc-600 text-sm py-6">No pages in this stage</p>
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
