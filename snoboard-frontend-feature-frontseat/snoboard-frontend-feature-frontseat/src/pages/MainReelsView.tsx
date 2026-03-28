import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAutoReels, getPages, createReel, updateReel, deleteReel, createPage, getIdeas, createIdea } from "@/services/api";
import type { Reel, Page, Idea } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Pencil, Check, X } from "lucide-react";
import DateRangeFilter, { filterByDateRange } from "@/components/DateRangeFilter";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    const exact = d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const relative = formatDistanceToNow(d, { addSuffix: true });
    return `${exact} (${relative})`;
  } catch {
    return dateStr;
  }
}

export default function MainReelsView() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [pageId, setPageId] = useState("");
  const [url, setUrl] = useState("");
  const [postedAt, setPostedAt] = useState("");
  const [views, setViews] = useState("");
  const [ideaId, setIdeaId] = useState("");
  const [newIdeaHook, setNewIdeaHook] = useState("");
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [showNewPage, setShowNewPage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editViews, setEditViews] = useState("");
  const [editPostedAt, setEditPostedAt] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterPage, setFilterPage] = useState("all");

  const { data: reels = [], isLoading } = useQuery<Reel[]>({
    queryKey: ["reels", "auto"],
    queryFn: getAutoReels,
  });

  const MAIN_IP_HANDLES = ["101xfounders", "bizzindia", "indianfoundersco", "startupcoded", "foundersinindia", "101xmarketing", "techinthelast24hrs", "101xtechnology"];

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const pages = allPages.filter((p) => MAIN_IP_HANDLES.includes(p.handle.toLowerCase()));

  const { data: ideas = [] } = useQuery<Idea[]>({
    queryKey: ["ideas"],
    queryFn: getIdeas,
  });

  const addMutation = useMutation({
    mutationFn: createReel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels", "auto"] });
      toast.success("Reel added to Main Reels");
      resetForm();
    },
    onError: (err: any) => toast.error(`Failed to add reel: ${err.message}`),
  });

  const addPageMutation = useMutation({
    mutationFn: createPage,
    onSuccess: (newPage: any) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      setPageId(newPage.id);
      setNewHandle("");
      setShowNewPage(false);
      toast.success(`@${newPage.handle} added`);
    },
    onError: () => toast.error("Failed to add page"),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { views?: number; posted_at?: string } }) =>
      updateReel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels", "auto"] });
      toast.success("Reel updated");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update reel"),
  });

  const removeMutation = useMutation({
    mutationFn: deleteReel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels", "auto"] });
      toast.success("Reel deleted");
    },
    onError: () => toast.error("Failed to delete reel"),
  });

  function startEdit(reel: Reel) {
    setEditingId(reel.id);
    setEditViews(String(reel.views ?? ""));
    setEditPostedAt(reel.posted_at ? new Date(reel.posted_at).toISOString().slice(0, 16) : "");
  }

  function saveEdit(id: string) {
    editMutation.mutate({
      id,
      data: {
        views: editViews ? Number(editViews) : undefined,
        posted_at: editPostedAt || undefined,
      },
    });
  }

  function resetForm() {
    setOpen(false);
    setPageId("");
    setUrl("");
    setPostedAt("");
    setViews("");
    setIdeaId("");
    setNewIdeaHook("");
    setShowNewIdea(false);
    setNewHandle("");
    setShowNewPage(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let finalPageId = pageId;

    if (showNewPage && newHandle.trim() && !pageId) {
      try {
        const newPage = await createPage({ handle: newHandle.trim(), auto_scrape: true });
        finalPageId = newPage.id;
        queryClient.invalidateQueries({ queryKey: ["pages"] });
      } catch {
        toast.error("Failed to create page");
        return;
      }
    }

    if (!finalPageId) {
      toast.error("Please select or add a page");
      return;
    }

    let finalIdeaId = ideaId;

    if (showNewIdea && newIdeaHook.trim() && !ideaId) {
      try {
        const newIdea = await createIdea({ hook: newIdeaHook.trim() });
        finalIdeaId = newIdea.id;
        queryClient.invalidateQueries({ queryKey: ["ideas"] });
      } catch {
        toast.error("Failed to create idea");
        return;
      }
    }

    addMutation.mutate({
      page_id: finalPageId,
      url: url.trim(),
      posted_at: postedAt || undefined,
      views: views ? Number(views) : undefined,
      auto_scrape: true,
      idea_id: finalIdeaId || undefined,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Main Reels</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Reels from your main IP accounts — manually add links, views, and posting time
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Reel
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Add Reel (Main IP)</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Page</Label>
                {showNewPage ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="@handle"
                      value={newHandle}
                      onChange={(e) => setNewHandle(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                      disabled={!newHandle.trim() || addPageMutation.isPending}
                      onClick={() => addPageMutation.mutate({ handle: newHandle.trim(), auto_scrape: true })}
                    >
                      {addPageMutation.isPending ? "..." : "Add"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewPage(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={pageId} onValueChange={setPageId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a page" />
                      </SelectTrigger>
                      <SelectContent>
                        {pages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            @{p.handle} {p.name ? `(${p.name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-zinc-700 text-zinc-400 hover:text-white"
                      onClick={() => setShowNewPage(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      New
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Idea</Label>
                {showNewIdea ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type idea name / hook"
                      value={newIdeaHook}
                      onChange={(e) => setNewIdeaHook(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShowNewIdea(false); setNewIdeaHook(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={ideaId} onValueChange={setIdeaId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select an idea (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {ideas.map((idea) => (
                          <SelectItem key={idea.id} value={idea.id}>
                            {idea.idea_code} — {idea.hook}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-zinc-700 text-zinc-400 hover:text-white"
                      onClick={() => { setShowNewIdea(true); setIdeaId(""); }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      New
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reel-url">URL</Label>
                <Input
                  id="reel-url"
                  placeholder="https://instagram.com/reel/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="posted-at">Time of Posting</Label>
                  <Input
                    id="posted-at"
                    type="datetime-local"
                    value={postedAt}
                    onChange={(e) => setPostedAt(e.target.value)}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    className="cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="views">Views</Label>
                  <Input
                    id="views"
                    type="number"
                    placeholder="0"
                    value={views}
                    onChange={(e) => setViews(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Reel"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Top 3 Podium */}
      {(() => {
        const sorted = [...filterByDateRange(reels, dateFrom, dateTo)].filter((r) => filterPage === "all" || r.pages?.handle?.toLowerCase() === filterPage).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
        if (sorted.length < 3) return null;
        const top3 = sorted.slice(0, 3);
        const podiumOrder = [top3[1], top3[0], top3[2]];
        const heights = [120, 160, 95];
        const medals = ["🥈", "🥇", "🥉"];
        const ranks = [2, 1, 3];
        const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
        const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];
        const glowColors = ["", "shadow-[0_0_40px_-5px_rgba(234,179,8,0.2)]", ""];

        return (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🏆</span>
              <h3 className="text-lg font-black text-white uppercase tracking-wider">Top 3 Reels</h3>
            </div>
            <div className="flex items-end justify-center gap-3 sm:gap-4">
              {podiumOrder.map((reel, i) => (
                <a
                  key={reel.id}
                  href={reel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}
                >
                  <span className={`text-2xl sm:text-3xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                    {medals[i]}
                  </span>
                  <p className="text-[10px] text-zinc-500 mb-1 truncate max-w-full text-center">
                    {reel.pages?.handle ?? "—"}
                  </p>
                  <p className="text-[9px] text-violet-400 mb-2 truncate max-w-full">
                    {reel.url.replace("https://www.instagram.com", "").replace(/\/$/, "")}
                  </p>
                  <div
                    className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} ${glowColors[i]} flex flex-col items-center justify-center`}
                    style={{ height: heights[i] }}
                  >
                    <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                      {(reel.views ?? 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">views</span>
                    <p className="text-[10px] text-zinc-600 mt-1.5">{formatDate(reel.posted_at).split("(")[1]?.replace(")", "") ?? ""}</p>
                  </div>
                </a>
              ))}
            </div>
            <div className="max-w-sm mx-auto h-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent rounded-full" />
          </div>
        );
      })()}

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Page</label>
            <Select value={filterPage} onValueChange={setFilterPage}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.handle.toLowerCase()}>@{p.handle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {(() => {
          const filtered = filterByDateRange(reels, dateFrom, dateTo).filter((r) => filterPage === "all" || r.pages?.handle?.toLowerCase() === filterPage);
          const totalViews = filtered.reduce((s, r) => s + (r.views ?? 0), 0);
          return (
            <div className="flex items-center gap-6 pt-3 border-t border-zinc-800">
              <div className="text-xs text-zinc-500"><span className="text-white font-bold">{filtered.length}</span> reels</div>
              <div className="text-xs text-zinc-500">Total views: <span className="text-white font-bold">{totalViews.toLocaleString()}</span></div>
            </div>
          );
        })()}
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Time of Posting</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const filteredReels = filterByDateRange(reels, dateFrom, dateTo).filter((r) => filterPage === "all" || r.pages?.handle?.toLowerCase() === filterPage);
              if (isLoading) return (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">Loading...</TableCell>
              </TableRow>
            );
              if (filteredReels.length === 0) return (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  {reels.length === 0 ? "No main reels yet. Click \"Add Reel\" to get started." : "No reels in this date range."}
                </TableCell>
              </TableRow>
            );
              return filteredReels.map((reel) => (
                <TableRow key={reel.id}>
                  <TableCell className="font-medium">{reel.pages?.handle ?? "-"}</TableCell>
                  <TableCell>
                    <a href={reel.url} target="_blank" rel="noopener noreferrer"
                      className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm max-w-[280px] truncate">
                      {reel.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </TableCell>
                  {editingId === reel.id ? (
                    <>
                      <TableCell>
                        <Input type="datetime-local" value={editPostedAt}
                          onChange={(e) => setEditPostedAt(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          className="h-8 w-44 cursor-pointer" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={editViews}
                          onChange={(e) => setEditViews(e.target.value)}
                          className="w-28 ml-auto text-right h-8" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-400"
                            onClick={() => saveEdit(reel.id)} disabled={editMutation.isPending}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500"
                            onClick={() => setEditingId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-sm text-zinc-500">{formatDate(reel.posted_at)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{reel.views?.toLocaleString() ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white"
                            onClick={() => startEdit(reel)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400"
                            onClick={() => removeMutation.mutate(reel.id)} disabled={removeMutation.isPending}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ));
            })()}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
