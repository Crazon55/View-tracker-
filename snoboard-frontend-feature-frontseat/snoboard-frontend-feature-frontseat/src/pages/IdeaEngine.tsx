import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIdeaEngine,
  getCSList,
  getIdeas,
  getPages,
  createCS,
  deleteCS,
  createIdea,
  updateIdea,
  deleteIdea,
} from "@/services/api";
import type { IdeaEngineData, CSStat, IdeaStat, ContentStrategist, Idea, Page } from "@/types";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  TrendingUp,
  Lightbulb,
  Trophy,
  Target,
  Users,
  ExternalLink,
  Search,
  UserPlus,
  Pencil,
  Check,
  X,
} from "lucide-react";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

type CSRankMode = "views" | "hit_rate" | "winners";

export default function IdeaEngine() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [csRankMode, setCsRankMode] = useState<CSRankMode>("views");
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [csOpen, setCsOpen] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editingDistId, setEditingDistId] = useState<string | null>(null);
  const [editDistPages, setEditDistPages] = useState<string[]>([]);
  const [sourceTab, setSourceTab] = useState<"original" | "repurposed">("original");

  // Idea form
  const [hook, setHook] = useState("");
  const [csOwnerId, setCsOwnerId] = useState("");
  const [format, setFormat] = useState("reel");
  const [source, setSource] = useState("original");
  const [distributedTo, setDistributedTo] = useState<string[]>([]);

  // CS form
  const [csName, setCsName] = useState("");
  const [csRole, setCsRole] = useState("");

  // Queries
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

  // Mutations
  const createIdeaMutation = useMutation({
    mutationFn: createIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea created");
      resetIdeaForm();
    },
    onError: () => toast.error("Failed to create idea"),
  });

  const updateIdeaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      updateIdea(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea updated");
      setEditingIdeaId(null);
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

  const createCSMutation = useMutation({
    mutationFn: createCS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs"] });
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      toast.success("CS added");
      setCsName("");
      setCsRole("");
      setCsOpen(false);
    },
    onError: (err: any) => toast.error(`Failed to add CS: ${err.message}`),
  });

  const deleteCSMutation = useMutation({
    mutationFn: deleteCS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs"] });
      queryClient.invalidateQueries({ queryKey: ["idea-engine"] });
      toast.success("CS removed");
    },
    onError: () => toast.error("Failed to remove CS"),
  });

  function resetIdeaForm() {
    setIdeaOpen(false);
    setHook("");
    setCsOwnerId("");
    setFormat("reel");
    setSource("original");
    setDistributedTo([]);
  }

  const handleCreateIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hook.trim() || !csOwnerId) return;
    createIdeaMutation.mutate({
      hook: hook.trim(),
      cs_owner_id: csOwnerId,
      format,
      source,
      distributed_to: distributedTo.length > 0 ? distributedTo : undefined,
    });
  };

  function togglePageSelection(pageId: string) {
    setDistributedTo((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  }

  const handleCreateCS = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csName.trim()) return;
    createCSMutation.mutate({ name: csName.trim(), role: csRole.trim() || undefined });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading Idea Engine...</p>
        </div>
      </div>
    );
  }

  const system = engineData?.system;
  const ideas = engineData?.ideas ?? [];
  const csLeaderboard = engineData?.cs_leaderboard ?? [];

  // Sort CS leaderboard
  const sortedCS = [...csLeaderboard].sort((a, b) => {
    if (csRankMode === "views") return b.total_views - a.total_views;
    if (csRankMode === "hit_rate") return b.hit_rate - a.hit_rate;
    return b.winners_count - a.winners_count;
  });

  // Filter ideas by source tab, then search
  const tabIdeas = ideas.filter((i) => i.source === sourceTab);
  const filteredIdeas = search.trim()
    ? tabIdeas.filter(
        (i) =>
          i.idea_code.toLowerCase().includes(search.toLowerCase()) ||
          i.hook.toLowerCase().includes(search.toLowerCase()) ||
          i.cs_owner_name.toLowerCase().includes(search.toLowerCase())
      )
    : tabIdeas;

  // Helper to get page handles from IDs
  function getPageHandles(pageIds: string[] | null): string[] {
    if (!pageIds) return [];
    return pageIds.map((id) => {
      const page = allPages.find((p) => p.id === id);
      return page ? `@${page.handle}` : "";
    }).filter(Boolean);
  }

  // Status badge colors
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
              <Lightbulb className="w-7 h-7 text-amber-400" />
              Original Ideas
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track ideas, measure hit-rate, rank your CS team</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={csOpen} onOpenChange={setCsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:text-white">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add CS
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle>Add Content Strategist</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCS} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="e.g. Rahul" value={csName} onChange={(e) => setCsName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Role (optional)</Label>
                    <Input placeholder="e.g. Senior CS" value={csRole} onChange={(e) => setCsRole(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createCSMutation.isPending}>
                    {createCSMutation.isPending ? "Adding..." : "Add CS"}
                  </Button>
                </form>
                {csList.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Current CS Team</p>
                    <div className="space-y-1">
                      {csList.map((cs) => (
                        <div key={cs.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-800/50">
                          <span className="text-sm text-white">{cs.name} {cs.role && <span className="text-zinc-500 text-xs">({cs.role})</span>}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-zinc-600 hover:text-red-400"
                            onClick={() => deleteCSMutation.mutate(cs.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog open={ideaOpen} onOpenChange={setIdeaOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  New Idea
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle>Create New Idea</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateIdea} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Hook / Concept</Label>
                    <Input placeholder="e.g. How Zerodha scaled to 1Cr users" value={hook} onChange={(e) => setHook(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>CS Owner</Label>
                    <Select value={csOwnerId} onValueChange={setCsOwnerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CS owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {csList.map((cs) => (
                          <SelectItem key={cs.id} value={cs.id}>
                            {cs.name} {cs.role && `(${cs.role})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <label
                          key={page.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                            distributedTo.includes(page.id) ? "bg-violet-500/10 text-white" : "text-zinc-400 hover:bg-zinc-800"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={distributedTo.includes(page.id)}
                            onChange={() => togglePageSelection(page.id)}
                            className="rounded border-zinc-700 bg-zinc-800 text-violet-500 focus:ring-violet-500"
                          />
                          <span className="text-sm">@{page.handle}</span>
                        </label>
                      ))}
                    </div>
                    {distributedTo.length > 0 && (
                      <p className="text-xs text-violet-400">{distributedTo.length} page{distributedTo.length > 1 ? "s" : ""} selected</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={createIdeaMutation.isPending || !csOwnerId}>
                    {createIdeaMutation.isPending ? "Creating..." : "Create Idea"}
                  </Button>
                  <p className="text-xs text-zinc-500 text-center">
                    Idea ID (e.g. FS-001) will be auto-generated
                  </p>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* System Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Active Ideas</span>
            </div>
            <p className="text-3xl font-black text-white tabular-nums">{system?.active_ideas ?? 0}</p>
            <p className="text-xs text-zinc-600 mt-1">{system?.total_ideas ?? 0} total</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Winners</span>
            </div>
            <p className="text-3xl font-black text-white tabular-nums">{system?.total_winners ?? 0}</p>
            <p className="text-xs text-zinc-600 mt-1">{formatCompact(system?.winner_threshold ?? 50000)}+ views</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Hit Rate</span>
            </div>
            <p className="text-3xl font-black text-white tabular-nums">{system?.hit_rate ?? 0}%</p>
            <p className="text-xs text-zinc-600 mt-1">{system?.total_posts ?? 0} total posts</p>
          </div>

          <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Avg Views/Idea</span>
              </div>
              <p className="text-3xl font-black text-white tabular-nums">{formatCompact(system?.avg_views_per_idea ?? 0)}</p>
              <p className="text-xs text-zinc-600 mt-1">{formatCompact(system?.total_views ?? 0)} total</p>
            </div>
          </div>
        </div>

        {/* CS Leaderboard */}
        {sortedCS.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-wider">CS Leaderboard</h2>
              </div>
              <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
                {(["views", "hit_rate", "winners"] as CSRankMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCsRankMode(mode)}
                    className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${
                      csRankMode === mode
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {mode === "views" ? "Views" : mode === "hit_rate" ? "Hit Rate" : "Winners"}
                  </button>
                ))}
              </div>
            </div>

            {/* Podium for top 3 */}
            {sortedCS.length >= 3 ? (() => {
              const top3 = sortedCS.slice(0, 3);
              const podiumOrder = [top3[1], top3[0], top3[2]];
              const heights = [140, 180, 110];
              const medals = ["\u{1F948}", "\u{1F947}", "\u{1F949}"];
              const ranks = [2, 1, 3];
              const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
              const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];
              const glowColors = ["", "shadow-[0_0_40px_-5px_rgba(234,179,8,0.2)]", ""];

              function getDisplayValue(cs: CSStat) {
                if (csRankMode === "views") return formatCompact(cs.total_views);
                if (csRankMode === "hit_rate") return cs.hit_rate + "%";
                return String(cs.winners_count);
              }
              function getDisplayLabel() {
                if (csRankMode === "views") return "views";
                if (csRankMode === "hit_rate") return "hit rate";
                return "winners";
              }

              return (
                <div>
                  <div className="flex items-end justify-center gap-3 sm:gap-5">
                    {podiumOrder.map((cs, i) => (
                      <div
                        key={cs.id}
                        className={`flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}
                      >
                        <span className={`text-3xl sm:text-4xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                          {medals[i]}
                        </span>
                        <p className={`font-black text-white uppercase tracking-wide text-center leading-tight mb-1 ${ranks[i] === 1 ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>
                          {cs.name}
                        </p>
                        {cs.role && <p className="text-[10px] text-zinc-600 mb-2">{cs.role}</p>}

                        <div
                          className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} ${glowColors[i]} flex flex-col items-center justify-center transition-all`}
                          style={{ height: heights[i] }}
                        >
                          <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
                            {getDisplayValue(cs)}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">{getDisplayLabel()}</span>
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
                            <span>{cs.ideas_created} ideas</span>
                            <span>·</span>
                            <span>{cs.total_posts} posts</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="max-w-md mx-auto h-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full mt-0" />
                </div>
              );
            })() : (
              /* List fallback for < 3 CS */
              <div className="space-y-2">
                {sortedCS.map((cs, i) => (
                  <div key={cs.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-zinc-500 w-6">#{i + 1}</span>
                      <div>
                        <p className="font-bold text-white">{cs.name}</p>
                        <p className="text-xs text-zinc-500">{cs.ideas_created} ideas · {cs.total_posts} posts</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-white tabular-nums">{formatCompact(cs.total_views)}</p>
                      <p className="text-xs text-zinc-500">{cs.hit_rate}% hit rate · {cs.winners_count} winners</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ideas Table */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-white uppercase tracking-wider">Ideas</h2>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">
              {tabIdeas.length}
            </Badge>
            <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setSourceTab("original")}
                className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${
                  sourceTab === "original" ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >Original</button>
              <button
                onClick={() => setSourceTab("repurposed")}
                className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${
                  sourceTab === "repurposed" ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >Competitors</button>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search by ID, hook, or CS name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50 h-11"
            />
          </div>
        </div>

        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Hook</TableHead>
                <TableHead>CS Owner</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-center">Posts</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-center">Winners</TableHead>
                <TableHead className="text-center">Hit Rate</TableHead>
                <TableHead>Distributed To</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIdeas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-zinc-500 py-8">
                    {ideas.length === 0
                      ? "No ideas yet. Click \"New Idea\" to create your first one."
                      : "No ideas matching your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredIdeas.map((idea) => (
                  <TableRow key={idea.id}>
                    <TableCell>
                      <span className="font-mono text-sm font-bold text-violet-400">{idea.idea_code}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-white font-medium">{idea.hook}</span>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400">{idea.cs_owner_name}</TableCell>
                    <TableCell>
                      <span className="text-xs uppercase tracking-wider text-zinc-500">{idea.format}</span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">{idea.total_posts}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">
                      {formatCompact(idea.total_views)}
                    </TableCell>
                    <TableCell className="text-center">
                      {idea.winners_count > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3" />
                          {idea.winners_count}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-sm">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-bold ${idea.hit_rate > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                        {idea.hit_rate}%
                      </span>
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
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-violet-400" onClick={() => { updateIdeaMutation.mutate({ id: idea.id, data: { distributed_to: editDistPages } }); setEditingDistId(null); }}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500" onClick={() => setEditingDistId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[180px] cursor-pointer" onClick={() => { setEditingDistId(idea.id); setEditDistPages(idea.distributed_to || []); }}>
                          {getPageHandles(idea.distributed_to).length > 0
                            ? getPageHandles(idea.distributed_to).map((h) => (
                                <span key={h} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded hover:bg-zinc-700">{h}</span>
                              ))
                            : <span className="text-[10px] text-zinc-600 hover:text-zinc-400">+ Add pages</span>
                          }
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingIdeaId === idea.id ? (
                        <div className="flex items-center gap-1">
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="ready">Ready</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="exhausted">Exhausted</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-violet-400"
                            onClick={() => updateIdeaMutation.mutate({ id: idea.id, data: { status: editStatus } })}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-zinc-500"
                            onClick={() => setEditingIdeaId(null)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase cursor-pointer ${statusColors[idea.status] ?? "text-zinc-500"}`}
                          onClick={() => { setEditingIdeaId(idea.id); setEditStatus(idea.status); }}
                        >
                          {idea.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {idea.best_post && (
                          <a
                            href={idea.best_post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center text-zinc-500 hover:text-violet-400"
                            title={`Best: ${formatCompact(idea.best_post.views)} on @${idea.best_post.page_handle}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-zinc-600 hover:text-red-400"
                          onClick={() => deleteIdeaMutation.mutate(idea.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
