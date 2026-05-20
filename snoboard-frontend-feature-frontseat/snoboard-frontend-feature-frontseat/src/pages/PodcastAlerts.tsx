import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Bell, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PODCAST_CHANNELS,
  GUEST_WATCHLIST,
  MIN_GUEST_ALERT_DURATION_SECONDS,
} from "@/config/podcastChannels";
import PodcastCard from "@/components/PodcastCard";

const CACHE_KEY = "podcast_alerts_cache_v4";
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
  isShort: boolean;
  /** From YouTube contentDetails; 0 if unknown. */
  durationSeconds: number;
};

const YT_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string;

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

async function enrichWithVideoDetails(episodes: Episode[]): Promise<Episode[]> {
  const durationMap = new Map<string, number>();
  const ids = episodes.map((e) => e.videoId);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(",")}&key=${YT_API_KEY}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const data = await res.json() as { items: any[] };
        for (const item of data.items ?? []) {
          durationMap.set(item.id, parseDurationSeconds(item.contentDetails?.duration ?? ""));
        }
      }
    } catch {}
  }
  return episodes.map((e) => {
    const secs = durationMap.get(e.videoId);
    const hasShortTag = /#shorts?\b/i.test(`${e.title} ${e.description}`);
    const durationSeconds = secs ?? 0;
    const isShort =
      hasShortTag || (secs != null && secs > 0 ? secs <= 60 : false);
    return { ...e, durationSeconds, isShort };
  });
}

async function fetchChannelFeed(channelId: string, channelName: string): Promise<Episode[]> {
  // Uploads playlist ID = channel ID with "UC" → "UU"
  const playlistId = "UU" + channelId.slice(2);
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=50&playlistId=${playlistId}&key=${YT_API_KEY}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`YouTube API error for ${channelName}: ${res.status}`);

  const data = await res.json() as { items: any[] };

  return (data.items ?? []).map((item: any) => {
    const s = item.snippet;
    const videoId: string = s.resourceId?.videoId ?? "";
    if (!videoId) return null;

    const description: string = s.description ?? "";
    const searchText = `${s.title ?? ""} ${description}`.toLowerCase();
    const matchedGuests = GUEST_WATCHLIST.filter((g) => searchText.includes(g.toLowerCase()));

    return {
      videoId,
      title: s.title ?? "",
      channelName,
      publishedAt: s.publishedAt ? new Date(s.publishedAt).toISOString() : "",
      thumbnailUrl:
        s.thumbnails?.medium?.url ||
        s.thumbnails?.high?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description,
      matchedGuests,
      isShort: false,
      durationSeconds: 0,
    } satisfies Episode;
  }).filter((e): e is Episode => e !== null);
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

  const raw = results
    .filter((r): r is PromiseFulfilledResult<Episode[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const episodes = await enrichWithVideoDetails(raw);

  if (episodes.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: episodes, ts: Date.now() }));
    } catch {}
  }

  return { episodes, failedCount };
}

type Tab = "guest-alerts" | "new-episodes";
type EpisodeFilter = "all" | "podcasts" | "shorts";

export default function PodcastAlerts() {
  const [tab, setTab] = useState<Tab>("guest-alerts");
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["podcast-alerts", refreshKey],
    queryFn: fetchAllPodcasts,
    staleTime: CACHE_TTL,
    retry: 1,
  });

  const episodes = data?.episodes ?? [];
  const failedCount = data?.failedCount ?? 0;

  /**
   * Guest tab: watchlisted name, not a Short, and ≥40 minutes (or unknown duration if the
   * videos API didn’t return length — then we trust the non-Short heuristic only).
   */
  const guestAlerts = episodes.filter((e) => {
    if (e.matchedGuests.length === 0 || e.isShort) return false;
    if (e.durationSeconds >= MIN_GUEST_ALERT_DURATION_SECONDS) return true;
    if (e.durationSeconds === 0) return true;
    return false;
  });

  const filteredEpisodes =
    episodeFilter === "podcasts" ? episodes.filter((e) => !e.isShort) :
    episodeFilter === "shorts"   ? episodes.filter((e) => e.isShort) :
    episodes;

  const displayed = tab === "guest-alerts" ? guestAlerts : filteredEpisodes;

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
            <p className="text-zinc-600 text-xs mt-1 max-w-xl">
              Guest alerts list <span className="text-zinc-500">watchlisted founders & CEOs</span> on{" "}
              <span className="text-zinc-500">episodes of 40+ minutes</span> (Shorts excluded). Use Refresh to bust the cache after updates.
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

        {/* Episode type filter — only for New Episodes tab */}
        {tab === "new-episodes" && !isLoading && (
          <div className="flex gap-2">
            {(["all", "podcasts", "shorts"] as EpisodeFilter[]).map((f) => {
              const count =
                f === "all" ? episodes.length :
                f === "podcasts" ? episodes.filter((e) => !e.isShort).length :
                episodes.filter((e) => e.isShort).length;
              return (
                <button
                  key={f}
                  onClick={() => setEpisodeFilter(f)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors capitalize",
                    episodeFilter === f
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  )}
                >
                  {f} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}

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
              {tab === "guest-alerts"
                ? "No guest alerts yet — no recent uploads matched a watchlisted name (40+ min, not Shorts)"
                : "No new episodes in the last 7 days"}
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
