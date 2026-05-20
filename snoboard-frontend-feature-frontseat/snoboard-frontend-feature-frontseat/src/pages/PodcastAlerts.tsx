import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Bell, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PODCAST_CHANNELS,
  MIN_GUEST_ALERT_DURATION_SECONDS,
  GUEST_ALERT_MAX_AGE_DAYS,
  NEW_EPISODES_PODCAST_MAX_AGE_DAYS,
  matchGuestsInText,
} from "@/config/podcastChannels";
import PodcastCard from "@/components/PodcastCard";

const CACHE_KEY = "podcast_alerts_cache_v7";
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Published within the last `days` full calendar windows (relative to now). */
function publishedWithinDays(iso: string, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * MS_PER_DAY;
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

async function enrichWithVideoDetails(episodes: Episode[]): Promise<Episode[]> {
  const durationMap = new Map<string, number>();
  const descriptionMap = new Map<string, string>();
  const ids = episodes.map((e) => e.videoId);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${batch.join(",")}&key=${YT_API_KEY}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const data = await res.json() as { items: any[] };
        for (const item of data.items ?? []) {
          const id = item.id as string;
          durationMap.set(id, parseDurationSeconds(item.contentDetails?.duration ?? ""));
          descriptionMap.set(id, String(item.snippet?.description ?? ""));
        }
      }
    } catch {}
  }
  return episodes.map((e) => {
    const fullDesc = descriptionMap.get(e.videoId) ?? e.description;
    const matchedGuests = matchGuestsInText(e.title, fullDesc);
    const secs = durationMap.get(e.videoId);
    const hasShortTag = /#shorts?\b/i.test(`${e.title} ${fullDesc}`);
    const durationSeconds = secs ?? 0;
    const isShort =
      hasShortTag || (secs != null && secs > 0 ? secs <= 60 : false);
    return { ...e, description: fullDesc, matchedGuests, durationSeconds, isShort };
  });
}

async function fetchChannelFeed(channelId: string, channelName: string): Promise<Episode[]> {
  const playlistId = "UU" + channelId.slice(2);
  const rawItems: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    u.searchParams.set("part", "snippet");
    u.searchParams.set("maxResults", "50");
    u.searchParams.set("playlistId", playlistId);
    u.searchParams.set("key", YT_API_KEY);
    if (pageToken) u.searchParams.set("pageToken", pageToken);

    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`YouTube API error for ${channelName}: ${res.status}`);

    const data = await res.json() as { items?: any[]; nextPageToken?: string };
    rawItems.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return rawItems.map((item: any) => {
    const s = item.snippet;
    const videoId: string = s.resourceId?.videoId ?? "";
    if (!videoId) return null;

    const description: string = s.description ?? "";

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
      matchedGuests: [] as string[],
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
type EpisodeFilter = "all" | "podcasts";

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

  const nonShortEpisodes = episodes.filter((e) => !e.isShort);

  /**
   * Guest tab: watchlisted guest, not Short (≤60s), uploaded within 14 days, and ≥40 minutes
   * when duration is known (or unknown duration when the API omits length).
   */
  const guestAlerts = episodes.filter((e) => {
    if (e.matchedGuests.length === 0 || e.isShort) return false;
    if (!publishedWithinDays(e.publishedAt, GUEST_ALERT_MAX_AGE_DAYS)) return false;
    if (e.durationSeconds >= MIN_GUEST_ALERT_DURATION_SECONDS) return true;
    if (e.durationSeconds === 0) return true;
    return false;
  });

  /**
   * New Episodes: never show Shorts (≤60s). "All" = non-Short only. "Podcasts" = non-Short + ≤7 days.
   */
  const filteredEpisodes =
    episodeFilter === "podcasts"
      ? nonShortEpisodes.filter((e) => publishedWithinDays(e.publishedAt, NEW_EPISODES_PODCAST_MAX_AGE_DAYS))
      : nonShortEpisodes;

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
              Guest alerts: watchlisted founders & CEOs, <span className="text-zinc-500">40+ min</span>,{" "}
              <span className="text-zinc-500">≤{GUEST_ALERT_MAX_AGE_DAYS} days</span> old. Shorts (≤60s) are not shown on this page.
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
            {!isLoading && nonShortEpisodes.length > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === "new-episodes" ? "bg-white/20 text-white" : "bg-zinc-700 text-zinc-400"
              )}>
                {nonShortEpisodes.length}
              </span>
            )}
          </button>
        </div>

        {/* Episode type filter — only for New Episodes tab */}
        {tab === "new-episodes" && !isLoading && (
          <p className="text-zinc-600 text-xs">
            Videos ≤60s (Shorts) are excluded from this page.
          </p>
        )}
        {tab === "new-episodes" && !isLoading && (
          <div className="flex gap-2">
            {(["all", "podcasts"] as EpisodeFilter[]).map((f) => {
              const count =
                f === "all"
                  ? nonShortEpisodes.length
                  : nonShortEpisodes.filter((e) =>
                      publishedWithinDays(e.publishedAt, NEW_EPISODES_PODCAST_MAX_AGE_DAYS),
                    ).length;
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
                ? `No guest alerts in the last ${GUEST_ALERT_MAX_AGE_DAYS} days matching your criteria (40+ min, watchlisted guest, no Shorts)`
                : episodeFilter === "podcasts"
                  ? `No podcast-length uploads in the last ${NEW_EPISODES_PODCAST_MAX_AGE_DAYS} days`
                  : "No episodes loaded"}
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
