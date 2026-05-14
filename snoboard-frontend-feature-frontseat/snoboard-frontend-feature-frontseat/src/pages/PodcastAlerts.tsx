import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Bell, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { PODCAST_CHANNELS, GUEST_WATCHLIST } from "@/config/podcastChannels";
import PodcastCard from "@/components/PodcastCard";

const CACHE_KEY = "podcast_alerts_cache_v1";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export type Episode = {
  videoId: string;
  title: string;
  channelName: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
  description: string;
  matchedGuests: string[];
};

async function fetchChannelFeed(channelId: string, channelName: string): Promise<Episode[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=15`;

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`rss2json failed for ${channelName}: ${res.status}`);

  const data = await res.json() as { status: string; items: any[] };
  if (data.status !== "ok") throw new Error(`Feed error for ${channelName}: ${data.status}`);

  return data.items
    .map((item: any) => {
      const videoId =
        item.link?.split("v=")[1]?.split("&")[0] ||
        item.guid?.split("v=")[1]?.split("&")[0] ||
        "";
      if (!videoId) return null;

      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : "";
      const thumbnailUrl = item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const description = (item.description || item.content || "").replace(/<[^>]*>/g, "");

      const searchText = `${item.title ?? ""} ${description}`.toLowerCase();
      const matchedGuests = GUEST_WATCHLIST.filter((g) =>
        searchText.includes(g.toLowerCase())
      );

      return {
        videoId,
        title: item.title || "",
        channelName,
        publishedAt,
        thumbnailUrl,
        url: item.link || `https://www.youtube.com/watch?v=${videoId}`,
        description,
        matchedGuests,
      } satisfies Episode;
    })
    .filter((e): e is Episode => e !== null);
}

async function fetchAllPodcasts(): Promise<{ episodes: Episode[]; failedCount: number }> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached) as { data: Episode[]; ts: number };
      if (Date.now() - ts < CACHE_TTL) return { episodes: data, failedCount: 0 };
    }
  } catch {}

  const channels = PODCAST_CHANNELS.filter((ch) => !ch.channelId.startsWith("REPLACE"));
  const results = await Promise.allSettled(
    channels.map((ch) => fetchChannelFeed(ch.channelId, ch.name))
  );

  const failedCount = results.filter((r) => r.status === "rejected").length;

  const episodes = results
    .filter((r): r is PromiseFulfilledResult<Episode[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Only cache if we got something back
  if (episodes.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: episodes, ts: Date.now() }));
    } catch {}
  }

  return { episodes, failedCount };
}

type Tab = "guest-alerts" | "new-episodes";

export default function PodcastAlerts() {
  const [tab, setTab] = useState<Tab>("guest-alerts");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["podcast-alerts", refreshKey],
    queryFn: fetchAllPodcasts,
    staleTime: CACHE_TTL,
    retry: 1,
  });

  const episodes = data?.episodes ?? [];
  const failedCount = data?.failedCount ?? 0;
  const guestAlerts = episodes.filter((e) => e.matchedGuests.length > 0);
  const displayed = tab === "guest-alerts" ? guestAlerts : episodes;

  function handleRefresh() {
    localStorage.removeItem(CACHE_KEY);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-6 pt-24 pb-16">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Bell className="w-5 h-5 text-violet-400 shrink-0" />
              <h1 className="text-2xl font-bold tracking-tight">Podcast Alerts</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Tracking {PODCAST_CHANNELS.filter((c) => !c.channelId.startsWith("REPLACE")).length} channels
              {!isLoading && guestAlerts.length > 0 && (
                <> · <span className="text-violet-400 font-medium">{guestAlerts.length} guest alert{guestAlerts.length !== 1 ? "s" : ""}</span></>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Failed channel warning */}
        {!isLoading && failedCount > 0 && (
          <p className="text-xs text-amber-500/80">
            {failedCount} channel{failedCount > 1 ? "s" : ""} failed to load — try refreshing.
          </p>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("guest-alerts")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tab === "guest-alerts"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            )}
          >
            <Bell className="w-3.5 h-3.5" />
            Guest Alerts
            {!isLoading && guestAlerts.length > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === "guest-alerts" ? "bg-white/20 text-white" : "bg-violet-500/20 text-violet-300"
              )}>
                {guestAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("new-episodes")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tab === "new-episodes"
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            )}
          >
            <Mic className="w-3.5 h-3.5" />
            New Episodes
            {!isLoading && episodes.length > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === "new-episodes" ? "bg-white/20 text-white" : "bg-zinc-700 text-zinc-400"
              )}>
                {episodes.length}
              </span>
            )}
          </button>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden animate-pulse">
                <div className="aspect-video bg-zinc-800" />
                <div className="p-3.5 space-y-2.5">
                  <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-800 rounded w-1/2" />
                  <div className="flex justify-between">
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                    <div className="h-3 bg-zinc-800 rounded w-1/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-sm">Failed to load episodes. Check your connection and try refreshing.</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && displayed.length === 0 && (
          <div className="text-center py-20">
            <Mic className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm font-medium">
              {tab === "guest-alerts" ? "No notable guest episodes found" : "No new episodes in the last 7 days"}
            </p>
            <p className="text-zinc-600 text-xs mt-1">Try refreshing or check back later</p>
          </div>
        )}

        {/* Episode grid */}
        {!isLoading && !isError && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map((episode) => (
              <PodcastCard key={`${episode.videoId}-${episode.channelName}`} episode={episode} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
