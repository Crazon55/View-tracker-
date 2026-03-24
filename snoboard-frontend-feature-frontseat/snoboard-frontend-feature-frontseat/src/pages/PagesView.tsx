import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPages, createPage, deletePage, updatePage } from "@/services/api";
import type { Page } from "@/types";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, ExternalLink } from "lucide-react";

export default function PagesView() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [autoScrape, setAutoScrape] = useState(false);

  const { data: pages = [], isLoading } = useQuery<Page[]>({
    queryKey: ["pages"],
    queryFn: getPages,
  });

  const addMutation = useMutation({
    mutationFn: createPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Page added");
      setOpen(false);
      setHandle("");
      setName("");
      setAutoScrape(false);
    },
    onError: () => toast.error("Failed to add page"),
  });

  const removeMutation = useMutation({
    mutationFn: deletePage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Page deleted");
    },
    onError: () => toast.error("Failed to delete page"),
  });

  const toggleAutoScrape = useMutation({
    mutationFn: ({ id, auto_scrape }: { id: string; auto_scrape: boolean }) =>
      updatePage(id, { auto_scrape }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      toast.success("Auto-scrape updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    addMutation.mutate({
      handle: handle.trim(),
      name: name.trim() || undefined,
      auto_scrape: autoScrape,
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Pages</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage Instagram accounts. Toggle "Auto Scrape" for Main IP accounts.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Page
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Add Instagram Page</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="handle">Handle</Label>
                <Input
                  id="handle"
                  placeholder="@username"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name (optional)</Label>
                <Input
                  id="name"
                  placeholder="Page display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Auto Scrape (Main IP)</Label>
                  <p className="text-xs text-zinc-500">
                    Automatically scrape reels from this account weekly
                  </p>
                </div>
                <Switch checked={autoScrape} onCheckedChange={setAutoScrape} />
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Page"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Handle</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Auto Scrape</TableHead>
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
            ) : pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                  No pages added yet. Click "Add Page" to get started.
                </TableCell>
              </TableRow>
            ) : (
              pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">@{page.handle}</TableCell>
                  <TableCell className="text-zinc-500">
                    {page.name || "-"}
                  </TableCell>
                  <TableCell>
                    {page.profile_url ? (
                      <a
                        href={page.profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(page as any).auto_scrape ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-0">Main IP</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Manual</Badge>
                    )}
                    <Switch
                      className="ml-2"
                      checked={(page as any).auto_scrape ?? false}
                      onCheckedChange={(checked) =>
                        toggleAutoScrape.mutate({ id: page.id, auto_scrape: checked })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-red-400"
                      onClick={() => removeMutation.mutate(page.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
