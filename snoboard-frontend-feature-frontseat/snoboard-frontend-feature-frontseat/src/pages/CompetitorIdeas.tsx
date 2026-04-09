import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageDistributionSelect from "@/components/PageDistributionSelect";
import { useAuth } from "@/contexts/AuthContext";
import {
  getIdeaEngine, getCSList, getPages, createIdea, updateIdea, deleteIdea, createCS, scheduleIdea,
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
import {
  Sheet, SheetContent,
} from "@/components/ui/sheet";
import { Plus, Trash2, Trophy, Search, Check, X, Swords, UserPlus, CalendarClock, Hash, FileText, User, Users, Play, Calendar, Link2, Clock, HardDrive, Eye, BarChart3, Zap, Share2, ExternalLink, Palette } from "lucide-react";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export default function CompetitorIdeas() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const [search, setSearch] = useState("");
  const [contentType, setContentType] = useState<"all" | "reels" | "posts">("all");
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editingDistId, setEditingDistId] = useState<string | null>(null);
  const [editDistPages, setEditDistPages] = useState<string[]>([]);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldData, setEditFieldData] = useState<any>({});
  const [selectedIdea, setSelectedIdea] = useState<any | null>(null);
  const [sheetEdit, setSheetEdit] = useState<Record<string, any>>({});

  // CDI form
  const [cdiOpen, setCdiOpen] = useState(false);
  const [cdiName, setCdiName] = useState("");

  // Idea form
  const [hook, setHook] = useState("");
  const [csOwnerId, setCsOwnerId] = useState("");
  const [cdiOwnerId, setCdiOwnerId] = useState("");
  const [format, setFormat] = useState("reel");
  const [distributedTo, setDistributedTo] = useState<string[]>([]);
  const [hookVariations, setHookVariations] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [timestamps, setTimestamps] = useState("");
  const [baseDriveLink, setBaseDriveLink] = useState("");
  const [pintuBatchLink, setPintuBatchLink] = useState("");
  const [compLink, setCompLink] = useState("");
  const [canvaLink, setCanvaLink] = useState("");
  const [executorNames, setExecutorNames] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");

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

  const scheduleMutation = useMutation({
    mutationFn: scheduleIdea,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["content-entries"] });
      toast.success(`Scheduled ${data.scheduled} pages, ${data.skipped} skipped`);
    },
    onError: (err: any) => toast.error(`Scheduling failed: ${err.message}`),
  });

  const createCDIMutation = useMutation({
    mutationFn: createCS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs"] });
      toast.success("CDI member added");
      setCdiName("");
      setCdiOpen(false);
    },
    onError: (err: any) => toast.error(`Failed to add CDI: ${err.message}`),
  });

  function resetForm() {
    setIdeaOpen(false);
    setHook("");
    setCsOwnerId("");
    setCdiOwnerId("");
    setFormat(contentType === "posts" ? "static" : "reel");
    setDistributedTo([]);
    setHookVariations("");
    setYtUrl("");
    setTimestamps("");
    setBaseDriveLink("");
    setPintuBatchLink("");
    setCompLink("");
    setCanvaLink("");
    setExecutorNames([]);
    setDeadline("");
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hook.trim()) return;
    if (executorNames.length === 0) { toast.error("Executor is required"); return; }
    const variations = hookVariations.split("\n").map((v) => v.trim()).filter(Boolean);
    createIdeaMutation.mutate({
      hook: hook.trim(),
      hook_variations: variations.length > 0 ? variations : undefined,
      cs_owner_id: csOwnerId || undefined,
      cdi_owner_id: cdiOwnerId || undefined,
      executor_name: executorNames.join(", "),
      created_by: userName,
      format,
      source: "repurposed",
      distributed_to: distributedTo.length > 0 ? distributedTo : undefined,
      yt_url: ytUrl.trim() || undefined,
      timestamps: timestamps.trim() || undefined,
      base_drive_link: baseDriveLink.trim() || undefined,
      pintu_batch_link: pintuBatchLink.trim() || undefined,
      comp_link: compLink.trim() || undefined,
      canva_link: canvaLink.trim() || undefined,
      deadline: deadline || undefined,
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
  const typeFilteredIdeas = contentType === "all"
    ? ideas
    : contentType === "reels"
      ? ideas.filter((i) => i.format === "reel" || i.format === "story")
      : ideas.filter((i) => i.format === "carousel" || i.format === "static");
  const filteredIdeas = search.trim()
    ? typeFilteredIdeas.filter((i) =>
        i.idea_code.toLowerCase().includes(search.toLowerCase()) ||
        i.hook.toLowerCase().includes(search.toLowerCase()) ||
        i.cs_owner_name.toLowerCase().includes(search.toLowerCase()) ||
        (i.cdi_owner_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : typeFilteredIdeas;

  const statusColors: Record<string, string> = {
    draft: "bg-zinc-700 text-zinc-300",
    in_progress: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 sm:px-6 py-8 sm:py-10">
      <div className="w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
              <Swords className="w-7 h-7 text-amber-400" />
              Competitor Ideas
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track competitor-inspired content ideas</p>
          </div>
          <div className="flex gap-2">
          <Dialog open={cdiOpen} onOpenChange={setCdiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:text-white">
                <UserPlus className="w-4 h-4 mr-2" />
                Add CDI
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800">
              <DialogHeader>
                <DialogTitle>Add CDI Member</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (cdiName.trim()) createCDIMutation.mutate({ name: cdiName.trim(), role: "CDI" }); }} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="e.g. Priya" value={cdiName} onChange={(e) => setCdiName(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={createCDIMutation.isPending}>
                  {createCDIMutation.isPending ? "Adding..." : "Add CDI Member"}
                </Button>
                {cdiMembers.length > 0 && (
                  <div className="pt-4 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Current CDI Team</p>
                    <div className="space-y-1">
                      {cdiMembers.map((cdi) => (
                        <div key={cdi.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-800/50">
                          <span className="text-sm text-white">{cdi.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={ideaOpen} onOpenChange={(open) => {
            setIdeaOpen(open);
            if (open) setFormat(contentType === "posts" ? "static" : "reel");
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Competitor Idea
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Competitor Idea</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3 mt-2">
                <div className="space-y-1.5">
                  <Label>Idea *</Label>
                  <Input placeholder={contentType === "posts" ? "e.g. Competitor's viral post about..." : "e.g. Competitor's viral reel about..."} value={hook} onChange={(e) => setHook(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Hook Variations (one per line)</Label>
                  <textarea
                    placeholder={"Variation 1\nVariation 2\nVariation 3"}
                    value={hookVariations}
                    onChange={(e) => setHookVariations(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Competitor Link</Label>
                  <Input placeholder="https://instagram.com/reel/..." value={compLink} onChange={(e) => setCompLink(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Created by</Label>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white">{userName}</div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Executor * (multi-select)</Label>
                    <div className="max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 space-y-0.5">
                      {csList.map((cs) => (
                        <label key={cs.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${executorNames.includes(cs.name) ? "bg-violet-500/10 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                          <input type="checkbox" checked={executorNames.includes(cs.name)} onChange={() => setExecutorNames((prev) => prev.includes(cs.name) ? prev.filter((n) => n !== cs.name) : [...prev, cs.name])} className="rounded border-zinc-700 bg-zinc-800 text-violet-500 w-3 h-3" />
                          {cs.name} <span className="text-zinc-500">({cs.role || "CS"})</span>
                        </label>
                      ))}
                    </div>
                    {executorNames.length > 0 && <p className="text-[10px] text-violet-400">{executorNames.join(", ")}</p>}
                  </div>
                  <div className="space-y-1.5">
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
                </div>
                {contentType === "posts" ? (
                  <div className="space-y-1.5">
                    <Label>Deadline</Label>
                    <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="cursor-pointer" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Deadline</Label>
                        <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="cursor-pointer" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>YouTube URL</Label>
                        <Input placeholder="https://youtube.com/..." value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Timestamps</Label>
                      <Input placeholder="e.g. 0:30-1:45, 3:00-4:20" value={timestamps} onChange={(e) => setTimestamps(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Base Video Drive Link</Label>
                        <Input placeholder="Google Drive link" value={baseDriveLink} onChange={(e) => setBaseDriveLink(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Pintu Batch Drive Link</Label>
                        <Input placeholder="Google Drive link" value={pintuBatchLink} onChange={(e) => setPintuBatchLink(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label>Canva Link {contentType !== "posts" && <span className="text-zinc-500">(for posts)</span>}</Label>
                  <Input placeholder="https://canva.com/..." value={canvaLink} onChange={(e) => setCanvaLink(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Distribute to Pages</Label>
                  <PageDistributionSelect
                    pages={allPages}
                    selected={distributedTo}
                    onChange={setDistributedTo}
                  />
                </div>
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs text-zinc-500">
                  Created by: <span className="text-white">{userName}</span> (auto)
                </div>
                <Button type="submit" className="w-full" disabled={createIdeaMutation.isPending || executorNames.length === 0}>
                  {createIdeaMutation.isPending ? "Creating..." : "Create Competitor Idea"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Ideas heading */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Ideas</h2>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">{typeFilteredIdeas.length}</Badge>
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] uppercase">Competitor</Badge>
          {/* Content type filter */}
          <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5 ml-auto">
            <button onClick={() => setContentType("all")} className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${contentType === "all" ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>All</button>
            <button onClick={() => setContentType("reels")} className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${contentType === "reels" ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Reels</button>
            <button onClick={() => setContentType("posts")} className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${contentType === "posts" ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>Posts</button>
          </div>
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
                <TableHead className="w-20">ID</TableHead>
                <TableHead>Idea</TableHead>
                <TableHead>Variations</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Executor</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>YT URL</TableHead>
                <TableHead>Timestamps</TableHead>
                <TableHead>Drive Link</TableHead>
                <TableHead>Pintu Batch</TableHead>
                <TableHead>Comp Link</TableHead>
                <TableHead>Canva Link</TableHead>
                <TableHead>Distributed To</TableHead>
                <TableHead className="text-center">Posts</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIdeas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={18} className="text-center text-zinc-500 py-8">
                    {ideas.length === 0 ? 'No competitor ideas yet. Click "New Competitor Idea" to create one.' : "No ideas matching your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredIdeas.map((idea) => {
                  const isFieldEdit = editingFieldId === idea.id;
                  const startEdit = (e?: React.MouseEvent) => { e?.stopPropagation(); if (!isFieldEdit) { setEditingFieldId(idea.id); setEditFieldData({ hook: idea.hook, hook_variations: (idea.hook_variations || []).join("\n"), executor_name: idea.executor_name || "", format: idea.format, deadline: idea.deadline || "", yt_url: idea.yt_url || "", timestamps: idea.timestamps || "", base_drive_link: idea.base_drive_link || "", pintu_batch_link: idea.pintu_batch_link || "", comp_link: idea.comp_link || "", canva_link: idea.canva_link || "" }); } };
                  return (
                  <TableRow key={idea.id} className="cursor-pointer" onClick={() => { setSelectedIdea(idea); setSheetEdit({ hook: idea.hook, hook_variations: (idea.hook_variations || []).join("\n"), executor_name: idea.executor_name || "", format: idea.format || "reel", status: idea.status || "draft", deadline: idea.deadline?.slice(0, 10) || "", yt_url: idea.yt_url || "", timestamps: idea.timestamps || "", base_drive_link: idea.base_drive_link || "", pintu_batch_link: idea.pintu_batch_link || "", comp_link: idea.comp_link || "", canva_link: idea.canva_link || "", distributed_to: idea.distributed_to || [] }); }}>
                    <TableCell><span className="font-mono text-xs font-bold text-amber-400">{idea.idea_code}</span></TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-36" value={editFieldData.hook} onChange={(e) => setEditFieldData({ ...editFieldData, hook: e.target.value })} />
                        : <span className="text-xs text-white font-medium max-w-[150px] truncate block hover:text-amber-400">{idea.hook}</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <textarea className="w-28 h-14 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-white resize-none" value={editFieldData.hook_variations} onChange={(e) => setEditFieldData({ ...editFieldData, hook_variations: e.target.value })} />
                        : idea.hook_variations?.length > 0 ? <div className="max-w-[120px]">{idea.hook_variations.map((v: string, i: number) => <p key={i} className="text-[10px] text-zinc-500 truncate">{v}</p>)}</div> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">{idea.created_by || idea.cs_owner_name || idea.cdi_owner_name || "—"}</TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-24" value={editFieldData.executor_name} onChange={(e) => setEditFieldData({ ...editFieldData, executor_name: e.target.value })} />
                        : <span className="text-xs text-zinc-400 hover:text-white">{idea.executor_name || "—"}</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Select value={editFieldData.format} onValueChange={(v) => setEditFieldData({ ...editFieldData, format: v })}><SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reel">Reel</SelectItem><SelectItem value="carousel">Carousel</SelectItem><SelectItem value="static">Static</SelectItem><SelectItem value="story">Story</SelectItem></SelectContent></Select>
                        : <span className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white">{idea.format}</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input type="date" className="h-7 text-xs w-32 cursor-pointer" value={editFieldData.deadline} onChange={(e) => setEditFieldData({ ...editFieldData, deadline: e.target.value })} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} />
                        : idea.deadline ? <span className="text-xs text-red-400 font-bold">{idea.deadline.slice(0, 10)}</span> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-32" placeholder="YouTube URL" value={editFieldData.yt_url} onChange={(e) => setEditFieldData({ ...editFieldData, yt_url: e.target.value })} />
                        : idea.yt_url ? <a href={idea.yt_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-violet-400 hover:underline">Link</a> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-28" placeholder="0:30-1:45" value={editFieldData.timestamps} onChange={(e) => setEditFieldData({ ...editFieldData, timestamps: e.target.value })} />
                        : <span className="text-[10px] text-zinc-500 max-w-[80px] truncate block hover:text-white">{idea.timestamps || "—"}</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-32" placeholder="Drive link" value={editFieldData.base_drive_link} onChange={(e) => setEditFieldData({ ...editFieldData, base_drive_link: e.target.value })} />
                        : idea.base_drive_link ? <a href={idea.base_drive_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-blue-400 hover:underline">Drive</a> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-32" placeholder="Pintu link" value={editFieldData.pintu_batch_link} onChange={(e) => setEditFieldData({ ...editFieldData, pintu_batch_link: e.target.value })} />
                        : idea.pintu_batch_link ? <a href={idea.pintu_batch_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-amber-400 hover:underline">Pintu</a> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-32" placeholder="Comp link" value={editFieldData.comp_link} onChange={(e) => setEditFieldData({ ...editFieldData, comp_link: e.target.value })} />
                        : idea.comp_link ? <a href={idea.comp_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-pink-400 hover:underline">Comp</a> : <span className="text-zinc-700 text-xs">—</span>}
                    </TableCell>
                    <TableCell onClick={startEdit}>
                      {isFieldEdit ? <Input className="h-7 text-xs w-32" placeholder="Canva link" value={editFieldData.canva_link} onChange={(e) => setEditFieldData({ ...editFieldData, canva_link: e.target.value })} />
                        : idea.canva_link ? <a href={idea.canva_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-cyan-400 hover:underline">Canva</a> : <span className="text-zinc-700 text-xs">—</span>}
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
                    <TableCell className="text-center font-mono text-sm">{idea.total_posts}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">{formatCompact(idea.total_views)}</TableCell>
                    <TableCell>
                      {editingIdeaId === idea.id ? (
                        <div className="flex items-center gap-1">
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-400" onClick={() => updateIdeaMutation.mutate({ id: idea.id, data: { status: editStatus } })}><Check className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500" onClick={() => setEditingIdeaId(null)}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] uppercase cursor-pointer ${statusColors[idea.status || "draft"] ?? "text-zinc-500"}`} onClick={() => { setEditingIdeaId(idea.id); setEditStatus(idea.status || "draft"); }}>{idea.status || "draft"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isFieldEdit ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-white text-xs" onClick={() => { updateIdeaMutation.mutate({ id: idea.id, data: editFieldData }); setEditingFieldId(null); }}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500" onClick={() => setEditingFieldId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : isFieldEdit ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-white text-xs" onClick={() => { const d: any = { ...editFieldData }; if (d.hook_variations) d.hook_variations = d.hook_variations.split("\n").filter((v: string) => v.trim()); updateIdeaMutation.mutate({ id: idea.id, data: d }); setEditingFieldId(null); }}>
                            <Check className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 text-xs" onClick={() => setEditingFieldId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-green-400" title="Schedule" onClick={() => scheduleMutation.mutate(idea.id)} disabled={scheduleMutation.isPending}>
                            <CalendarClock className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400" onClick={() => deleteIdeaMutation.mutate(idea.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {filteredIdeas.length > 0 && (
          <div className="flex items-center gap-6 mt-3 text-xs text-zinc-600">
            <span>Total views: <span className="text-white font-bold">{formatCompact(typeFilteredIdeas.reduce((s, i) => s + i.total_views, 0))}</span></span>
            <span>Total posts: <span className="text-white font-bold">{typeFilteredIdeas.reduce((s, i) => s + i.total_posts, 0)}</span></span>
            <span>Winners: <span className="text-yellow-400 font-bold">{typeFilteredIdeas.reduce((s, i) => s + i.winners_count, 0)}</span></span>
          </div>
        )}

        {/* Notion-style editable detail panel */}
        <Sheet open={!!selectedIdea} onOpenChange={(open) => { if (!open) setSelectedIdea(null); }}>
          <SheetContent side="right" className="w-[480px] sm:w-[540px] bg-zinc-950 border-zinc-800 overflow-y-auto p-0">
            {selectedIdea && (() => {
              const idea = selectedIdea;
              const ed = sheetEdit;
              const set = (field: string, val: string) => setSheetEdit({ ...ed, [field]: val });
              const handleSave = () => {
                const data: any = { ...ed };
                if (data.hook_variations) data.hook_variations = data.hook_variations.split("\n").filter((v: string) => v.trim());
                updateIdeaMutation.mutate({ id: idea.id, data }, {
                  onSuccess: () => setSelectedIdea(null),
                });
              };
              return (
                <div className="flex flex-col">
                  {/* Header */}
                  <div className="px-6 pt-8 pb-5 border-b border-zinc-800">
                    <div className="flex items-center gap-2 mb-3">
                      <Select value={ed.status} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="text-xl font-bold text-white bg-transparent border-zinc-800 hover:border-zinc-700 focus:border-violet-500/50 px-0 h-auto py-1" value={ed.hook} onChange={(e) => set("hook", e.target.value)} />
                    <p className="text-xs text-zinc-500 font-mono mt-1">{idea.idea_code}</p>
                  </div>

                  {/* Editable Properties */}
                  <div className="px-6 py-4 space-y-0">
                    <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 w-40 shrink-0"><User className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Created by</span></div>
                      <span className="text-sm text-white">{idea.created_by || idea.cs_owner_name || idea.cdi_owner_name || "—"}</span>
                    </div>
                    <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 w-40 shrink-0"><Users className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Executor</span></div>
                      <Input className="h-8 text-sm bg-transparent border-zinc-800 hover:border-zinc-700 focus:border-violet-500/50 flex-1" value={ed.executor_name} onChange={(e) => set("executor_name", e.target.value)} />
                    </div>
                    <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 w-40 shrink-0"><Play className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Format</span></div>
                      <Select value={ed.format} onValueChange={(v) => set("format", v)}>
                        <SelectTrigger className="h-8 text-sm w-32 bg-transparent border-zinc-800"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="reel">Reel</SelectItem><SelectItem value="carousel">Carousel</SelectItem><SelectItem value="static">Static</SelectItem><SelectItem value="story">Story</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 w-40 shrink-0"><Hash className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Source</span></div>
                      <Badge className="bg-amber-500/20 text-amber-400 text-[10px] uppercase">Competitor</Badge>
                    </div>
                    <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 w-40 shrink-0"><Calendar className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Deadline</span></div>
                      <Input type="date" className="h-8 text-sm bg-transparent border-zinc-800 hover:border-zinc-700 focus:border-violet-500/50 w-40 cursor-pointer" value={ed.deadline} onChange={(e) => set("deadline", e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} />
                    </div>

                    {/* Computed stats (read-only) */}
                    {[
                      { icon: Eye, label: "Total Views", value: formatCompact(idea.total_views), bold: true },
                      { icon: BarChart3, label: "Total Posts", value: String(idea.total_posts) },
                      { icon: Trophy, label: "Winners", value: String(idea.winners_count), highlight: idea.winners_count > 0 },
                      { icon: Zap, label: "Hit Rate", value: `${idea.hit_rate}%` },
                    ].map(({ icon: Icon, label, value, bold, highlight }) => (
                      <div key={label} className="flex items-center py-2.5 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2.5 w-40 shrink-0"><Icon className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">{label}</span></div>
                        <span className={`text-sm ${bold ? "font-bold text-white" : highlight ? "text-amber-400 font-semibold" : "text-white"}`}>{value}</span>
                      </div>
                    ))}

                    {/* Variations — full width, resizable */}
                    <div className="py-2.5 border-b border-zinc-800/50">
                      <div className="flex items-center gap-2.5 mb-2"><FileText className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">Variations</span></div>
                      <textarea className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500/50 focus:outline-none rounded-md px-3 py-2.5 text-sm text-white resize-y min-h-[120px]" placeholder="Write each hook variation on a new line..." value={ed.hook_variations} onChange={(e) => set("hook_variations", e.target.value)} />
                    </div>

                    {/* Links section */}
                    <div className="pt-3 pb-1">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-1">Links</p>
                    </div>
                    {[
                      { icon: Link2, label: "YouTube URL", field: "yt_url", placeholder: "https://youtube.com/..." },
                      { icon: Clock, label: "Timestamps", field: "timestamps", placeholder: "e.g. 0:30-1:45" },
                      { icon: HardDrive, label: "Drive Link", field: "base_drive_link", placeholder: "Google Drive link" },
                      { icon: Share2, label: "Pintu Batch", field: "pintu_batch_link", placeholder: "Google Drive link" },
                      { icon: ExternalLink, label: "Comp Link", field: "comp_link", placeholder: "https://instagram.com/..." },
                      { icon: Palette, label: "Canva Link", field: "canva_link", placeholder: "https://canva.com/..." },
                    ].map(({ icon: Icon, label, field, placeholder }) => (
                      <div key={label} className="flex items-center py-2.5 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2.5 w-40 shrink-0"><Icon className="w-4 h-4 text-zinc-600" /><span className="text-xs text-zinc-500">{label}</span></div>
                        <Input className="h-8 text-sm bg-transparent border-zinc-800 hover:border-zinc-700 focus:border-violet-500/50 flex-1" placeholder={placeholder} value={ed[field] || ""} onChange={(e) => set(field, e.target.value)} />
                      </div>
                    ))}

                    {/* Best post (read-only) */}
                    {idea.best_post && (
                      <div className="flex items-center py-2.5 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2.5 w-40 shrink-0"><Trophy className="w-4 h-4 text-yellow-500" /><span className="text-xs text-zinc-500">Best Post</span></div>
                        <a href={idea.best_post.url} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-400 hover:underline">{formatCompact(idea.best_post.views)} views on @{idea.best_post.page_handle}</a>
                      </div>
                    )}
                  </div>

                  {/* Distributed Pages — editable */}
                  <div className="px-6 py-4 border-t border-zinc-800">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-3">
                      Distribute to Pages {(ed.distributed_to || []).length > 0 && <span className="text-zinc-500 ml-1">({(ed.distributed_to || []).length})</span>}
                    </p>
                    <PageDistributionSelect
                      pages={allPages}
                      selected={ed.distributed_to || []}
                      onChange={(pages) => setSheetEdit({ ...ed, distributed_to: pages })}
                    />
                  </div>

                  {/* Save button */}
                  <div className="px-6 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950">
                    <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSave} disabled={updateIdeaMutation.isPending}>
                      {updateIdeaMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
