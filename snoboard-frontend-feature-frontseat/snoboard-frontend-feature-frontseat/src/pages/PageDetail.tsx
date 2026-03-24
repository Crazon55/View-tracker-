import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPageDetail, upsertDashboardViews } from "@/services/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Eye, Heart, MessageCircle, Trophy, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function DonutChart({
  reelViews, postViews, label, size = 160,
}: { reelViews: number; postViews: number; label: string; size?: number }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = reelViews + postViews;
  const gap = 0.02; // small gap between segments

  // If no views, show empty ring
  const reelFrac = total > 0 ? reelViews / total : 0;
  const postFrac = total > 0 ? postViews / total : 0;

  const reelLen = reelFrac * circumference * (1 - gap);
  const postLen = postFrac * circumference * (1 - gap);
  const gapLen = total > 0 && postViews > 0 ? circumference * gap : 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={stroke} />
        {/* Reel views arc (pink → violet) */}
        {reelViews > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="url(#donut-reel)" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${reelLen} ${circumference - reelLen}`}
            strokeDashoffset={0}
          />
        )}
        {/* Post views arc (emerald) */}
        {postViews > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#10b981" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${postLen} ${circumference - postLen}`}
            strokeDashoffset={-(reelLen + gapLen)}
          />
        )}
        <defs>
          <linearGradient id="donut-reel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums mt-0.5">
          {total.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function PageDetail() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dvReelInput, setDvReelInput] = useState<string | null>(null);
  const [dvPostInput, setDvPostInput] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["page-detail", pageId],
    queryFn: () => getPageDetail(pageId!),
    enabled: !!pageId,
  });

  // Pre-fill inputs with current values when data loads
  const currentDVData = data?.current_dashboard_views;
  const reelInputValue = dvReelInput ?? String(currentDVData?.reel_views ?? 0);
  const postInputValue = dvPostInput ?? String(currentDVData?.post_views ?? 0);

  const dvMutation = useMutation({
    mutationFn: (d: { reel_views: number; post_views: number }) =>
      upsertDashboardViews(pageId!, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-detail", pageId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Instagram Dashboard Views updated");
      setDvReelInput(null);
      setDvPostInput(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const page = data?.page;
  const reels = data?.reels ?? [];
  const posts = data?.posts ?? [];
  const currentDV = data?.current_dashboard_views;
  const currentMonth = data?.current_month
    ? new Date(data.current_month).toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  const totalReelViews = reels.reduce((s: number, r: any) => s + (r.views ?? 0), 0);
  const totalLikes = reels.reduce((s: number, r: any) => s + (r.likes ?? 0), 0);
  const totalComments = reels.reduce((s: number, r: any) => s + (r.comments ?? 0), 0);
  const totalPostViews = posts.reduce((s: number, p: any) => s + (p.actual_views ?? 0), 0);
  const igReelViews = currentDV?.reel_views ?? 0;
  const igPostViews = currentDV?.post_views ?? 0;
  const combinedViews = igReelViews + igPostViews;

  // Top 5 reels
  const top5 = [...reels].sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Back + Header */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 text-zinc-500 hover:text-white"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-black text-white">@{page?.handle}</h1>
            {page?.name && <p className="text-zinc-500 mt-1">{page.name}</p>}
            <p className="text-xs text-zinc-600 mt-1">{currentMonth} (resets on the 1st)</p>
          </div>
          {page?.profile_url && (
            <a href={page.profile_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
        </div>

        {/* Instagram Dashboard Views Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            <h2 className="text-xl font-bold text-white">Instagram Dashboard Views</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Enter total views from your Instagram Insights dashboard for this month.
            This combines with Post Views for the total.
          </p>

          <div className="flex items-center gap-6">
            {/* Donut */}
            <DonutChart reelViews={igReelViews} postViews={igPostViews} label="Total Views" />

            {/* Breakdown */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between bg-zinc-950/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                  <span className="text-sm text-zinc-500">IG Reel Views</span>
                </div>
                <span className="text-lg font-bold text-white tabular-nums">{igReelViews.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between bg-zinc-950/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-zinc-500">IG Post Views</span>
                </div>
                <span className="text-lg font-bold text-white tabular-nums">{igPostViews.toLocaleString()}</span>
              </div>
              <div className="h-px bg-zinc-800 mx-1" />
              <div className="flex items-center justify-between bg-violet-500/10 border border-violet-500/20 rounded-lg px-4 py-3">
                <span className="text-sm text-violet-400">Combined Total</span>
                <span className="text-lg font-bold text-violet-400 tabular-nums">{combinedViews.toLocaleString()}</span>
              </div>
              <div className="h-px bg-zinc-800 mx-1" />
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 pt-1">Update from Instagram Insights</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500">Reel Views</label>
                  <Input
                    type="number"
                    value={reelInputValue}
                    onChange={(e) => setDvReelInput(e.target.value)}
                    className="bg-zinc-950 border-zinc-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500">Post Views</label>
                  <Input
                    type="number"
                    value={postInputValue}
                    onChange={(e) => setDvPostInput(e.target.value)}
                    className="bg-zinc-950 border-zinc-700"
                  />
                </div>
              </div>
              <Button
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                disabled={dvMutation.isPending}
                onClick={() => dvMutation.mutate({
                  reel_views: Number(reelInputValue) || 0,
                  post_views: Number(postInputValue) || 0,
                })}
              >
                {dvMutation.isPending ? "Saving..." : "Update Views"}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard icon={Eye} label="Reel Views" value={totalReelViews} color="text-violet-400" />
          <StatCard icon={Heart} label="Total Likes" value={totalLikes} color="text-pink-400" />
          <StatCard icon={MessageCircle} label="Total Comments" value={totalComments} color="text-blue-400" />
          <StatCard icon={Eye} label="Post Views" value={totalPostViews} color="text-emerald-400" />
        </div>

        {/* Top 5 Reels */}
        {top5.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Top 5 Reels</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {top5.map((reel: any, i: number) => (
                <a
                  key={reel.id}
                  href={reel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-violet-500/50 transition-colors"
                >
                  <span className="text-2xl font-black text-violet-400">#{i + 1}</span>
                  <p className="text-2xl font-bold text-white tabular-nums mt-2">
                    {(reel.views ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">views</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                    <span>{(reel.likes ?? 0).toLocaleString()} likes</span>
                    <span>{(reel.comments ?? 0).toLocaleString()} cmts</span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">{formatDate(reel.posted_at)}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* All Reels */}
        {reels.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              Reels <Badge variant="secondary" className="ml-2 text-xs">{reels.length}</Badge>
            </h2>
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reels.map((reel: any, i: number) => (
                    <TableRow key={reel.id} className="border-zinc-800">
                      <TableCell className="font-mono text-zinc-600 text-xs">{i + 1}</TableCell>
                      <TableCell>
                        <a href={reel.url} target="_blank" rel="noopener noreferrer"
                          className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm max-w-[250px] truncate">
                          {reel.url.replace("https://www.instagram.com", "")}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">{formatDate(reel.posted_at)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">{(reel.views ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-zinc-500">{(reel.likes ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-zinc-500">{(reel.comments ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* All Posts */}
        {posts.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              Posts <Badge variant="secondary" className="ml-2 text-xs">{posts.length}</Badge>
            </h2>
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead>#</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((post: any, i: number) => (
                    <TableRow key={post.id} className="border-zinc-800">
                      <TableCell className="font-mono text-zinc-600 text-xs">{i + 1}</TableCell>
                      <TableCell>
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="text-violet-400 hover:underline inline-flex items-center gap-1 text-sm">
                          {post.url.replace("https://www.instagram.com", "")}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-zinc-500">{(post.expected_views ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">{(post.actual_views ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
