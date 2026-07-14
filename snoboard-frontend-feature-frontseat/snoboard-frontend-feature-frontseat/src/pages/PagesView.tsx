import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPages, createPage, deletePage, updatePage, getTrackerNiches } from "@/services/api";
import type { Page } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Home, ChevronRight } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

const STAGES = [
  { value: 1, label: "Stage 1", color: "border-blue-500/30 bg-blue-500/5", badge: "bg-blue-500/20 text-blue-400", dot: "bg-blue-500" },
  { value: 2, label: "Stage 2", color: "border-amber-500/30 bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", dot: "bg-amber-500" },
  { value: 3, label: "Stage 3", color: "border-emerald-500/30 bg-emerald-500/5", badge: "bg-emerald-500/20 text-emerald-400", dot: "bg-emerald-500" },
];

type IpMode = "reels" | "posts";

function nicheHandleSet(nichesRaw: any[], mode: IpMode): Set<string> {
  const s = new Set<string>();
  for (const n of nichesRaw) {
    const nm = String(n?.name || "").toLowerCase();
    const isFbs = nm.includes("garfields") || nm.includes("goofies") || nm.includes("sheru");
    const isExperiment = nm.includes("experiment");
    if (mode === "posts") {
      if (!isFbs) continue;
    } else if (!isFbs && !isExperiment) {
      continue;
    }
    for (const h of n?.pages || []) {
      if (h) s.add(String(h).replace(/^@/, "").trim().toLowerCase());
    }
  }
  return s;
}

export default function PagesView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ipMode: IpMode = searchParams.get("mode") === "posts" ? "posts" : "reels";
  const isPosts = ipMode === "posts";

  const [addOpen, setAddOpen] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newStage, setNewStage] = useState("1");

  const { data: allPagesRaw = [], isLoading: pagesLoading } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const { data: nichesRaw = [], isLoading: nichesLoading } = useQuery<any[]>({
    queryKey: ["tracker-niches"],
    queryFn: getTrackerNiches,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const isLoading = pagesLoading || nichesLoading;

  const pages = useMemo<Page[]>(() => {
    const s = nicheHandleSet(nichesRaw, ipMode);
    if (s.size === 0) return [];
    return allPagesRaw.filter((p) => s.has(p.handle.replace(/^@/, "").trim().toLowerCase()));
  }, [allPagesRaw, nichesRaw, ipMode]);

  const addMutation = useMutation({
    mutationFn: createPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Page added");
      setNewHandle("");
      setNewName("");
      setNewStage("1");
      setAddOpen(false);
    },
    onError: () => toast.error("Failed to add page"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Page removed");
    },
    onError: () => toast.error("Failed to remove page"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(isPosts ? "Stage updated" : "Page updated");
    },
    onError: () => toast.error("Failed to update page"),
  });

  function setIpMode(mode: IpMode) {
    setSearchParams(mode === "posts" ? { mode: "posts" } : {}, { replace: true });
  }

  function openPage(pageId: string) {
    navigate(isPosts ? `/pages/${pageId}?mode=posts` : `/pages/${pageId}`);
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) return;
    addMutation.mutate({
      handle: newHandle.trim(),
      name: newName.trim() || undefined,
      stage: Number(newStage),
    });
  };

  if (isLoading) {
    return (
      <div className="fglass-page min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fglass-page min-h-screen px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white">IPs</h1>
            <p className="fglass-muted mt-1">
              {isPosts
                ? "Post IPs by stage — drag to change stage, click to manage posts"
                : "Reel IPs by stage — drag to change stage, click to manage reels"}
            </p>
            <div className="inline-flex items-center six-day-seg mt-4">
              <button
                type="button"
                onClick={() => setIpMode("reels")}
                className={!isPosts ? "is-on" : ""}
              >
                Reels
              </button>
              <button
                type="button"
                onClick={() => setIpMode("posts")}
                className={isPosts ? "is-on" : ""}
              >
                Posts
              </button>
            </div>
          </div>

          {!isPosts && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Page
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle>Add New Page</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Handle</Label>
                    <Input placeholder="@handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Name (optional)</Label>
                    <Input placeholder="Display name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={newStage} onValueChange={setNewStage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Stage 1</SelectItem>
                        <SelectItem value="2">Stage 2</SelectItem>
                        <SelectItem value="3">Stage 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                    {addMutation.isPending ? "Adding..." : "Add Page"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {STAGES.map((stage) => {
            const stagePages = pages.filter((p) => (p.stage ?? 1) === stage.value).sort((a, b) => a.handle.localeCompare(b.handle));

            return (
              <div
                key={stage.value}
                className={`fglass-panel fglass-purple-shadow rounded-2xl p-5 transition-all ${dropStage === stage.value ? "scale-[1.01] ring-2 ring-violet-500/40" : ""}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropStage(stage.value); }}
                onDragLeave={() => setDropStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const pageId = e.dataTransfer.getData("text/plain");
                  if (pageId) updateMutation.mutate({ id: pageId, data: { stage: stage.value } });
                  setDraggingId(null);
                  setDropStage(null);
                }}
              >
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
                      draggable
                      onDragStart={(e) => { setDraggingId(page.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", page.id); }}
                      onDragEnd={() => { setDraggingId(null); setDropStage(null); }}
                      className={`group flex items-center justify-between fglass-card fglass-purple-shadow rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing transition-all ${draggingId === page.id ? "opacity-40 scale-95" : ""}`}
                      onClick={() => openPage(page.id)}
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
                        {!isPosts && (
                          <>
                            <select
                              value={page.stage ?? 1}
                              onChange={(e) => { e.stopPropagation(); updateMutation.mutate({ id: page.id, data: { stage: Number(e.target.value) } }); }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 bg-zinc-800 border border-zinc-700 rounded-lg text-[10px] text-zinc-400 px-1 cursor-pointer focus:outline-none"
                            >
                              <option value={1}>S1</option>
                              <option value={2}>S2</option>
                              <option value={3}>S3</option>
                            </select>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(page.id); }}
                              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
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
