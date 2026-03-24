import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAutoReels, triggerScrape } from "@/services/api";
import type { Reel } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export default function ReelsMainView() {
  const queryClient = useQueryClient();

  const { data: reels = [], isLoading } = useQuery<Reel[]>({
    queryKey: ["reels", "auto"],
    queryFn: getAutoReels,
  });

  const scrapeMutation = useMutation({
    mutationFn: () => triggerScrape(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reels", "auto"] });
      toast.success(`Scrape complete: ${data.reels_updated} reels scraped`);
      if (data.errors?.length) {
        data.errors.slice(0, 3).forEach((err) => toast.error(err));
      }
    },
    onError: () => toast.error("Scrape failed"),
  });

  const scrapeAllMutation = useMutation({
    mutationFn: () => triggerScrape("2026-03-01"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reels", "auto"] });
      toast.success(`Full scrape complete: ${data.reels_updated} reels scraped`);
    },
    onError: () => toast.error("Scrape failed"),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Reels Main IPs</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Reels auto-scraped from Main IP accounts. Add accounts in the Pages tab with "Auto Scrape" on.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrapeAllMutation.mutate()}
            disabled={scrapeAllMutation.isPending || scrapeMutation.isPending}
          >
            {scrapeAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Scrape All (from Mar 1)
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => scrapeMutation.mutate()}
            disabled={scrapeMutation.isPending || scrapeAllMutation.isPending}
          >
            {scrapeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Scrape This Week
          </Button>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Time of Posting</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Likes</TableHead>
              <TableHead className="text-right">Comments</TableHead>
              <TableHead>Last Scraped</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : reels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                  No reels scraped yet. Mark pages as "Auto Scrape" in the Pages tab, then click "Scrape All".
                </TableCell>
              </TableRow>
            ) : (
              reels.map((reel) => (
                <TableRow key={reel.id}>
                  <TableCell className="font-medium">
                    @{reel.pages?.handle ?? "-"}
                  </TableCell>
                  <TableCell>
                    <a
                      href={reel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm max-w-[250px] truncate"
                    >
                      {reel.url.replace("https://www.instagram.com", "")}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {formatDate(reel.posted_at)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {reel.views?.toLocaleString() ?? "0"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {(reel as any).likes?.toLocaleString() ?? "0"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {(reel as any).comments?.toLocaleString() ?? "0"}
                  </TableCell>
                  <TableCell>
                    {reel.last_scraped_at ? (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {formatDate(reel.last_scraped_at)}
                      </Badge>
                    ) : (
                      <span className="text-zinc-500 text-sm">Never</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {reels.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">
          {reels.length} reels from {new Set(reels.map(r => r.pages?.handle)).size} accounts
        </p>
      )}
    </div>
  );
}
