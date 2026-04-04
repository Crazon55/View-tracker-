import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPosts, getPages, createPost, updatePost, deletePost, createPage, getIdeas, createIdea, getCSList } from "@/services/api";
import type { Post, Page, Idea, ContentStrategist } from "@/types";
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
    const exact = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const relative = formatDistanceToNow(d, { addSuffix: true });
    return `${exact} (${relative})`;
  } catch {
    return dateStr;
  }
}

export default function PostIPsView() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [pageId, setPageId] = useState("");
  const [url, setUrl] = useState("");
  const [postedAt, setPostedAt] = useState("");
  const [expectedViews, setExpectedViews] = useState("");
  const [actualViews, setActualViews] = useState("");
  const [ideaId, setIdeaId] = useState("");
  const [newIdeaHook, setNewIdeaHook] = useState("");
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [newIdeaCsId, setNewIdeaCsId] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [showNewPage, setShowNewPage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editExpected, setEditExpected] = useState("");
  const [editActual, setEditActual] = useState("");
  const [editPostedAt, setEditPostedAt] = useState("");
  const [editPageId, setEditPageId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterPage, setFilterPage] = useState("all");

  const { data: allPosts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["posts"],
    queryFn: getPosts,
  });

  const { data: allPages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const pages = allPages.filter((p) => (p.stage ?? 1) === 3);
  const mainPageIds = new Set(pages.map((p) => p.id));
  const posts = allPosts.filter((p) => mainPageIds.has(p.page_id));

  const { data: ideas = [] } = useQuery<Idea[]>({
    queryKey: ["ideas"],
    queryFn: getIdeas,
  });

  const { data: csList = [] } = useQuery<ContentStrategist[]>({
    queryKey: ["cs"],
    queryFn: getCSList,
  });

  const addMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post added");
      resetForm();
    },
    onError: (err: any) => toast.error(`Failed to add post: ${err.message}`),
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
    mutationFn: ({ id, data }: { id: string; data: { page_id?: string; expected_views?: number; actual_views?: number; posted_at?: string } }) =>
      updatePost(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post updated");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update post"),
  });

  const removeMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
    },
    onError: () => toast.error("Failed to delete post"),
  });

  function startEdit(post: Post) {
    setEditingId(post.id);
    setEditExpected(String(post.expected_views ?? ""));
    setEditActual(String(post.actual_views ?? ""));
    setEditPostedAt(post.posted_at ? new Date(post.posted_at).toISOString().slice(0, 10) : "");
    setEditPageId(post.page_id);
  }

  function saveEdit(id: string) {
    editMutation.mutate({
      id,
      data: {
        page_id: editPageId || undefined,
        expected_views: editExpected ? Number(editExpected) : undefined,
        actual_views: editActual ? Number(editActual) : undefined,
        posted_at: editPostedAt || undefined,
      },
    });
  }

  function resetForm() {
    setOpen(false);
    setPageId("");
    setUrl("");
    setPostedAt("");
    setExpectedViews("");
    setActualViews("");
    setIdeaId("");
    setNewIdeaHook("");
    setNewIdeaCsId("");
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
        const newPage = await createPage({ handle: newHandle.trim() });
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
        const newIdea = await createIdea({
          hook: newIdeaHook.trim(),
          cs_owner_id: newIdeaCsId || undefined,
          format: "carousel",
        });
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
      expected_views: expectedViews ? Number(expectedViews) : undefined,
      actual_views: actualViews ? Number(actualViews) : undefined,
      idea_id: finalIdeaId || undefined,
    });
  };

  const filteredPosts = filterByDateRange(posts, dateFrom, dateTo, "posted_at").filter(
    (p) => filterPage === "all" || p.pages?.handle?.toLowerCase() === filterPage
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Post IPs</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Posts from your main IP accounts — manually add links, expected & actual views
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Post
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Add Post (Main IP)</DialogTitle>
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
                      onClick={() => addPageMutation.mutate({ handle: newHandle.trim() })}
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
                  <div className="space-y-2">
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
                        onClick={() => { setShowNewIdea(false); setNewIdeaHook(""); setNewIdeaCsId(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <Select value={newIdeaCsId} onValueChange={setNewIdeaCsId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CS owner (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {csList.map((cs) => (
                          <SelectItem key={cs.id} value={cs.id}>
                            {cs.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                            <span className="flex items-center gap-2">
                              {idea.idea_code} — {idea.hook}
                              <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-medium ${idea.source === "original" ? "bg-violet-500/20 text-violet-400" : "bg-amber-500/20 text-amber-400"}`}>
                                {idea.source === "original" ? "OG" : "COMP"}
                              </span>
                            </span>
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
                <Label htmlFor="post-url">URL</Label>
                <Input
                  id="post-url"
                  placeholder="https://instagram.com/p/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="posted-at">Date of Posting</Label>
                <Input
                  id="posted-at"
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className="cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expected-views">Expected Views</Label>
                  <Input
                    id="expected-views"
                    type="number"
                    placeholder="0"
                    value={expectedViews}
                    onChange={(e) => setExpectedViews(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actual-views">Actual Views</Label>
                  <Input
                    id="actual-views"
                    type="number"
                    placeholder="0"
                    value={actualViews}
                    onChange={(e) => setActualViews(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Post"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Top 3 Podium */}
      {(() => {
        const sorted = [...filteredPosts].sort((a, b) => (b.actual_views ?? 0) - (a.actual_views ?? 0));
        if (sorted.length < 3) return null;
        const top3 = sorted.slice(0, 3);
        const podiumOrder = [top3[1], top3[0], top3[2]];
        const heights = [120, 160, 95];
        const medals = ["\u{1F948}", "\u{1F947}", "\u{1F949}"];
        const ranks = [2, 1, 3];
        const borderColors = ["border-zinc-400/40", "border-yellow-500/50", "border-amber-700/40"];
        const bgColors = ["bg-zinc-400/5", "bg-yellow-500/5", "bg-amber-700/5"];
        const glowColors = ["", "shadow-[0_0_40px_-5px_rgba(234,179,8,0.2)]", ""];

        return (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">{"\u{1F3C6}"}</span>
              <h3 className="text-lg font-black text-white uppercase tracking-wider">Top 3 Posts</h3>
            </div>
            <div className="flex items-end justify-center gap-3 sm:gap-4">
              {podiumOrder.map((post, i) => (
                <a
                  key={post.id}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`transition-all duration-300 hover:scale-105 flex flex-col items-center ${ranks[i] === 1 ? "w-36 sm:w-44" : "w-28 sm:w-36"}`}
                >
                  <span className={`text-2xl sm:text-3xl mb-2 ${ranks[i] === 1 ? "animate-bounce" : ""}`} style={ranks[i] === 1 ? { animationDuration: "2s" } : {}}>
                    {medals[i]}
                  </span>
                  <p className="text-[10px] text-zinc-500 mb-1 truncate max-w-full text-center">
                    {post.pages?.handle ?? "\u2014"}
                  </p>
                  <p className="text-[9px] text-violet-400 mb-2 truncate max-w-full">
                    {post.url.replace("https://www.instagram.com", "").replace(/\/$/, "")}
                  </p>
                  <div
                    className={`w-full rounded-t-xl border ${borderColors[i]} ${bgColors[i]} ${glowColors[i]} flex flex-col items-center justify-center`}
                    style={{ height: heights[i] }}
                  >
                    <span className={`font-black tabular-nums text-white ${ranks[i] === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                      {(post.actual_views ?? 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">views</span>
                    <p className="text-[10px] text-zinc-600 mt-1.5">{formatDate(post.posted_at).split("(")[1]?.replace(")", "") ?? ""}</p>
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
        <div className="flex items-center gap-6 pt-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-500"><span className="text-white font-bold">{filteredPosts.length}</span> posts</div>
          <div className="text-xs text-zinc-500">Expected: <span className="text-white font-bold">{filteredPosts.reduce((s, p) => s + (p.expected_views ?? 0), 0).toLocaleString()}</span></div>
          <div className="text-xs text-zinc-500">Actual: <span className="text-white font-bold">{filteredPosts.reduce((s, p) => s + (p.actual_views ?? 0), 0).toLocaleString()}</span></div>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Date of Posting</TableHead>
              <TableHead className="text-right">Expected Views</TableHead>
              <TableHead className="text-right">Actual Views</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              if (isLoading) return (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">Loading...</TableCell>
                </TableRow>
              );
              if (filteredPosts.length === 0) return (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    {posts.length === 0 ? "No posts yet. Click \"Add Post\" to get started." : "No posts in this date range."}
                  </TableCell>
                </TableRow>
              );
              return filteredPosts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">
                    {editingId === post.id ? (
                      <Select value={editPageId} onValueChange={setEditPageId}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allPages.map((p) => (
                            <SelectItem key={p.id} value={p.id}>@{p.handle}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      post.pages?.handle ?? "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <a href={post.url} target="_blank" rel="noopener noreferrer"
                      className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm max-w-[280px] truncate">
                      {post.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </TableCell>
                  {editingId === post.id ? (
                    <>
                      <TableCell>
                        <Input type="date" value={editPostedAt}
                          onChange={(e) => setEditPostedAt(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          className="h-8 w-36 cursor-pointer" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={editExpected}
                          onChange={(e) => setEditExpected(e.target.value)}
                          className="w-28 ml-auto text-right h-8" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={editActual}
                          onChange={(e) => setEditActual(e.target.value)}
                          className="w-28 ml-auto text-right h-8" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-400"
                            onClick={() => saveEdit(post.id)} disabled={editMutation.isPending}>
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
                      <TableCell className="text-sm text-zinc-500">{formatDate(post.posted_at)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(post.expected_views ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(post.actual_views ?? 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white"
                            onClick={() => startEdit(post)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400"
                            onClick={() => removeMutation.mutate(post.id)} disabled={removeMutation.isPending}>
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
