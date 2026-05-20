import { ExternalLink, Calendar } from "lucide-react";
import type { Episode } from "@/pages/PodcastAlerts";

function formatVideoDuration(seconds: number): string {
  if (!seconds || seconds < 60) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

const GUEST_COLORS: Record<string, string> = {
  "Aman Gupta": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Mukesh Ambani": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Nikhil Kamath": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Deepinder Goyal": "bg-red-500/20 text-red-300 border-red-500/30",
  "Ashneer Grover": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Ritesh Agarwal": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

function guestColor(name: string): string {
  return GUEST_COLORS[name] || "bg-violet-500/20 text-violet-300 border-violet-500/30";
}

type Props = { episode: Episode };

export default function PodcastCard({ episode }: Props) {
  return (
    <a
      href={episode.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-600 transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-zinc-800">
        <img
          src={episode.thumbnailUrl}
          alt={episode.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `https://i.ytimg.com/vi/${episode.videoId}/hqdefault.jpg`;
          }}
        />
        {episode.durationSeconds >= 60 && (
          <div className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
            {formatVideoDuration(episode.durationSeconds)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
          <ExternalLink className="w-4 h-4 text-white drop-shadow" />
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        {/* Guest tags */}
        {episode.matchedGuests.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {episode.matchedGuests.map((guest) => (
              <span
                key={guest}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${guestColor(guest)}`}
              >
                {guest}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <p className="text-sm font-medium text-white leading-snug line-clamp-2 mb-2.5">
          {episode.title}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-violet-400 font-medium truncate">
            {episode.channelName}
          </span>
          <span className="text-xs text-zinc-600 flex items-center gap-1 shrink-0">
            <Calendar className="w-3 h-3" />
            {relativeTime(episode.publishedAt)}
          </span>
        </div>
      </div>
    </a>
  );
}
