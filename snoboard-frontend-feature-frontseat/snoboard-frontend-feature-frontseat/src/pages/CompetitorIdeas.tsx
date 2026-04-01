import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIdeaEngine, getCSList, getPages, createIdea, updateIdea, deleteIdea,
} from "@/services/api";
import type { IdeaEngineData, IdeaStat, ContentStrategist, Page } from "@/types";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
import { Plus, Trash2, Trophy, Search, Pencil, Check, X, Swords } from "lucide-react";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function CompetitorIdeas() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editingDistId, setEditingDistId] = useState<string | null>(null);
  const [editDistPages, setEditDistPages] = useState<string[]>([]);

  // Idea form
  const [hook, setHook] = useState("");
  const [csOwnerId, setCsOwnerId] = useState("");
  const [cdiOwnerId, setCdiOwnerId] = useState("");
  const [format, setFormat] = useState("reel");
  const [distributedTo, setDistributedTo] = useState<string[]>([]);

  const { data: engineData, isLoading } = useQuery<IdeaEngineData>({
    queryKey: ["idea-engine"],
    queryFn: getIdeaEngine,
  });

  const { data: csList = [] } = useQuery<ContentStrategist[]>({
    queryKey: ["cs"],
    queryFn: getCSList,
  });

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  // Split CS and CDI
  const csMembers = csList.filter((c) => c.role?.toLowerCase() !== "cdi");
  const cdiMembers = csList.filter((c) => c.role?.toLowerCase() === "cdi");

  const createIdeaMutation = useMutation({
    mutationFn: createIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Competitor idea created");
      resetForm();
    },
    onError: () => toast.error("Failed to create idea"),
  });

  const updateIdeaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) => updateIdea(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea updated");
      setEditingIdeaId(null);
      setEditingDistId(null);
    },
    onError: () => toast.error("Failed to update idea"),
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: deleteIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea deleted");
    },
    onError: () => toast.error("Failed to delete idea"),
  });

  function resetForm() {
    setIdeaOpen(false);
    setHook("");
    setCsOwnerId("");
    setCdiOwnerId("");
    setFormat("reel");
    setDistributedTo([]);
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hook.trim()) return;
    createIdeaMutation.mutate({
      hook: hook.trim(),
      cs_owner_id: csOwnerId || undefined,
      cdi_owner_id: cdiOwnerId || undefined,
      format,
      source: "repurposed",
      distributed_to: distributedTo.length > 0 ? distributedTo : undefined,
    });
  };

  function getPageHandles(pageIds: string[] | null): string[] {
    if (!pageIds) return [];
    return pageIds.map((id) => {
      const page = allPages.find((p) => p.id === id);
      return page ? `@${page.handle}` : "";
    }).filter(Boolean);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const ideas = (engineData?.ideas ?? []).filter((i) => i.source === "repurposed");
  const filteredIdeas = search.trim()
    ? ideas.filter((i) =>
        i.idea_code.toLowerCase().includes(search.toLowerCase()) ||
        i.hook.toLowerCase().includes(search.toLowerCase()) ||
        i.cs_owner_name.toLowerCase().includes(search.toLowerCase()) ||
        (i.cdi_owner_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : ideas;

  const statusColors: Record<string, string> = {
    draft: "bg-zinc-700 text-zinc-300",
    ready: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    exhausted: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 sm:px-6 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
              <Swords className="w-7 h-7 text-amber-400" />
              Competitor Ideas
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track competitor-inspired content ideas</p>
          </div>
          <Dialog open={ideaOpen} onOpenChange={setIdeaOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Competitor Idea
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800">
              <DialogHeader>
                <DialogTitle>Create Competitor Idea</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Hook / Concept</Label>
                  <Input placeholder="e.g. Competitor's viral reel about..." value={hook} onChange={(e) => setHook(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CS Owner (optional)</Label>
                    <Select value={csOwnerId} onValueChange={setCsOwnerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CS" />
                      </SelectTrigger>
                      <SelectContent>
                        {csMembers.map((cs) => (
                          <SelectItem key={cs.id} value={cs.id}>{cs.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>CDI Owner (optional)</Label>
                    <Select value={cdiOwnerId} onValueChange={setCdiOwnerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CDI" />
                      </SelectTrigger>
                      <SelectContent>
                        {cdiMembers.map((cdi) => (
                          <SelectItem key={cdi.id} value={cdi.id}>{cdi.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reel">Reel</SelectItem>
                      <SelectItem value="carousel">Carousel</SelectItem>
                      <SelectItem value="static">Static</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Distribute to Pages</Label>
                  <div className="max-h-36 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg p-2 space-y-1">
                    {allPages.map((page) => (
                      <label key={page.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${distributedTo.includes(page.id) ? "bg-violet-500/10 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                        <input type="checkbox" checked={distributedTo.includes(page.id)} onChange={() => setDistributedTo((prev) => prev.includes(page.id) ? prev.filter((id) => id !== page.id) : [...prev, page.id])} className="rounded border-zinc-700 bg-zinc-800 text-violet-500" />
                        <span className="text-sm">@{page.handle}</span>
                      </label>
                    ))}
                  </div>
                  {distributedTo.length > 0 && <p className="text-xs text-violet-400">{distributedTo.length} page{distributedTo.length > 1 ? "s" : ""} selected</p>}
                </div>
                <Button type="submit" className="w-full" disabled={createIdeaMutation.isPending}>
                  {createIdeaMutation.isPending ? "Creating..." : "Create Competitor Idea"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Ideas heading */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Ideas</h2>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">{ideas.length}</Badge>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] uppercase">Competitor</Badge>
        </div>

        {/* Search */}
        <div className="mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input placeholder="Search by ID, hook, CS or CDI name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50 h-11" />
          </div>
        </div>

        {/* Table */}
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Hook</TableHead>
                <TableHead>CS</TableHead>
                <TableHead>CDI</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-center">Posts</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-center">Winners</TableHead>
                <TableHead>Distributed To</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIdeas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-zinc-500 py-8">
                    {ideas.length === 0 ? 'No competitor ideas yet. Click "New Competitor Idea" to create one.' : "No ideas matching your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredIdeas.map((idea) => (
                  <TableRow key={idea.id}>
                    <TableCell><span className="font-mono text-sm font-bold text-amber-400">{idea.idea_code}</span></TableCell>
                    <TableCell><span className="text-sm text-white font-medium">{idea.hook}</span></TableCell>
                    <TableCell className="text-sm text-zinc-400">{idea.cs_owner_name || "—"}</TableCell>
                    <TableCell className="text-sm text-zinc-400">{idea.cdi_owner_name || "—"}</TableCell>
                    <TableCell><span className="text-xs uppercase tracking-wider text-zinc-500">{idea.format}</span></TableCell>
                    <TableCell className="text-center font-mono text-sm">{idea.total_posts}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">{formatCompact(idea.total_views)}</TableCell>
                    <TableCell className="text-center">
                      {idea.winners_count > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3" />{idea.winners_count}
                        </span>
                      ) : <span className="text-zinc-600 text-sm">0</span>}
                    </TableCell>
                    <TableCell>
                      {editingDistId === idea.id ? (
                        <div className="space-y-2">
                          <div className="max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-lg p-1.5 space-y-0.5 w-44">
                            {allPages.map((page) => (
                              <label key={page.id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] ${editDistPages.includes(page.id) ? "bg-violet-500/10 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                                <input type="checkbox" checked={editDistPages.includes(page.id)} onChange={() => setEditDistPages((prev) => prev.includes(page.id) ? prev.filter((id) => id !== page.id) : [...prev, page.id])} className="rounded border-zinc-700 bg-zinc-800 text-violet-500 w-3 h-3" />
                                @{page.handle}
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-violet-400" onClick={() => { updateIdeaMutation.mutate({ id: idea.id, data: { distributed_to: editDistPages } }); setEditingDistId(null); }}><Check className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500" onClick={() => setEditingDistId(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[180px] cursor-pointer" onClick={() => { setEditingDistId(idea.id); setEditDistPages(idea.distributed_to || []); }}>
                          {getPageHandles(idea.distributed_to).length > 0
                            ? getPageHandles(idea.distributed_to).map((h) => <span key={h} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded hover:bg-zinc-700">{h}</span>)
                            : <span className="text-[10px] text-zinc-600 hover:text-zinc-400">+ Add pages</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIdeaId === idea.id ? (
                        <div className="flex items-center gap-1">
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="ready">Ready</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="exhausted">Exhausted</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-400" onClick={() => updateIdeaMutation.mutate({ id: idea.id, data: { status: editStatus } })}><Check className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500" onClick={() => setEditingIdeaId(null)}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] uppercase cursor-pointer ${statusColors[idea.status] ?? "text-zinc-500"}`} onClick={() => { setEditingIdeaId(idea.id); setEditStatus(idea.status); }}>{idea.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => deleteIdeaMutation.mutate(idea.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filteredIdeas.length > 0 && (
          <div className="flex items-center gap-6 mt-3 text-xs text-zinc-600">
            <span>Total views: <span className="text-white font-bold">{formatCompact(ideas.reduce((s, i) => s + i.total_views, 0))}</span></span>
            <span>Total posts: <span className="text-white font-bold">{ideas.reduce((s, i) => s + i.total_posts, 0)}</span></span>
            <span>Winners: <span className="text-yellow-400 font-bold">{ideas.reduce((s, i) => s + i.winners_count, 0)}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
