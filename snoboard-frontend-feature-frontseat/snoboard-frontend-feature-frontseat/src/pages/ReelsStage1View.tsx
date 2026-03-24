import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getManualReels, getPages, createReel, updateReel, deleteReel, createPage } from "@/services/api";
import type { Reel, Page } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
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
import { Plus, Trash2, ExternalLink, Pencil, Check, X } from "lucide-react";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export default function ReelsStage1View() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Form state
  const [pageId, setPageId] = useState("");
  const [url, setUrl] = useState("");
  const [postedAt, setPostedAt] = useState("");
  const [views, setViews] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [showNewPage, setShowNewPage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editViews, setEditViews] = useState("");
  const [editPostedAt, setEditPostedAt] = useState("");

  const { data: reels = [], isLoading } = useQuery<Reel[]>({
    queryKey: ["reels", "manual"],
    queryFn: getManualReels,
  });

  const { data: pages = [] } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const addMutation = useMutation({
    mutationFn: createReel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels", "manual"] });
      toast.success("Reel added to Stage 1");
      resetForm();
    },
    onError: () => toast.error("Failed to add reel"),
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
      queryClient.invalidateQueries({ queryKey: ["reels", "manual"] });
      toast.success("Reel updated");
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update reel"),
  });

  const removeMutation = useMutation({
    mutationFn: deleteReel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels", "manual"] });
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
    setNewHandle("");
    setShowNewPage(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let finalPageId = pageId;

    // If user typed a new handle but didn't click Add yet, create the page first
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

    addMutation.mutate({
      page_id: finalPageId,
      url: url.trim(),
      posted_at: postedAt || undefined,
      views: views ? Number(views) : undefined,
      auto_scrape: false,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Reels Stage 1</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manually tracked reels
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
              <DialogTitle>Add Reel (Stage 1)</DialogTitle>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewPage(false)}
                    >
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

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Time of Posting</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : reels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  No Stage 1 reels yet. Click "Add Reel" to get started.
                </TableCell>
              </TableRow>
            ) : (
              reels.map((reel) => (
                <TableRow key={reel.id}>
                  <TableCell className="font-medium">
                    {reel.pages?.handle ?? "-"}
                  </TableCell>
                  <TableCell>
                    <a
                      href={reel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm max-w-[280px] truncate"
                    >
                      {reel.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </TableCell>

                  {editingId === reel.id ? (
                    <>
                      <TableCell>
                        <Input
                          type="datetime-local"
                          value={editPostedAt}
                          onChange={(e) => setEditPostedAt(e.target.value)}
                          className="h-8 w-44"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={editViews}
                          onChange={(e) => setEditViews(e.target.value)}
                          className="w-28 ml-auto text-right h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-violet-400"
                            onClick={() => saveEdit(reel.id)}
                            disabled={editMutation.isPending}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-sm text-zinc-500">
                        {formatDate(reel.posted_at)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {reel.views?.toLocaleString() ?? "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500 hover:text-white"
                            onClick={() => startEdit(reel)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-500 hover:text-red-400"
                            onClick={() => removeMutation.mutate(reel.id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
