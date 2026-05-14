import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Newspaper, RefreshCw, Bookmark, BookmarkCheck, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY as string;
const TAVILY_URL = "https://api.tavily.com/search";

type NewsArticle = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published_at: string;
};

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score: number;
};

const FILTER_KEYWORDS = ["All", "Startup", "Venture capital", "Funding", "Business"];

const SEARCH_QUERIES = [
  "India startup funding news",
  "India venture capital investment news",
  "India business startup news",
];

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      topic: "news",
      days: 3,
      max_results: 20,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as TavilyResult[];
}

function sourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const map: Record<string, string> = {
      "inc42.com": "Inc42",
      "techcrunch.com": "TechCrunch",
      "moneycontrol.com": "Moneycontrol",
      "business-standard.com": "Business Standard",
      "economictimes.indiatimes.com": "Economic Times",
      "livemint.com": "Mint",
      "yourstory.com": "YourStory",
      "entrackr.com": "Entrackr",
      "fortuneindia.com": "Fortune India",
      "ndtv.com": "NDTV",
      "hindustantimes.com": "Hindustan Times",
    };
    for (const [key, label] of Object.entries(map)) {
      if (host.includes(key)) return label;
    }
    return host;
  } catch {
    return "News";
  }
}

async function fetchTavilyNews(): Promise<NewsArticle[]> {
  if (!TAVILY_API_KEY) throw new Error("VITE_TAVILY_API_KEY is not set in .env");

  const results = await Promise.allSettled(SEARCH_QUERIES.map(tavilySearch));

  const all: NewsArticle[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item.title || !item.url) continue;
      all.push({
        id: item.url,
        title: item.title,
        summary: item.content?.slice(0, 400) || null,
        url: item.url,
        source: sourceFromUrl(item.url),
        published_at: item.published_date ?? new Date().toISOString(),
      });
    }
  }

  // Deduplicate by URL, sort newest first
  const seen = new Set<string>();
  return all
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
}

function formatNewspaperDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const SAVED_KEY = "news-saved-articles";

function loadSaved(): Map<string, NewsArticle> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return new Map();
    const arr: NewsArticle[] = JSON.parse(raw);
    return new Map(arr.map((a) => [a.id, a]));
  } catch {
    return new Map();
  }
}

function persistSaved(map: Map<string, NewsArticle>) {
  localStorage.setItem(SAVED_KEY, JSON.stringify([...map.values()]));
}

export default function NewsFeed() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<Map<string, NewsArticle>>(loadSaved);

  const { data: articles = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["news-tavily"],
    queryFn: fetchTavilyNews,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  function toggleSave(article: NewsArticle) {
    setSaved((prev) => {
      const next = new Map(prev);
      if (next.has(article.id)) {
        next.delete(article.id);
        persistSaved(next);
        toast.success("Removed from saved");
      } else {
        next.set(article.id, article);
        persistSaved(next);
        toast.success("Article saved");
      }
      return next;
    });
  }

  const baseList = filter === "Saved"
    ? [...saved.values()]
    : articles;

  const filtered = baseList.filter((a) => {
    const text = `${a.title} ${a.summary || ""}`.toLowerCase();
    return (
      (filter === "Saved" || filter === "All" || text.includes(filter.toLowerCase())) &&
      (!search.trim() || text.includes(search.toLowerCase()))
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* ── Masthead ─────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="h-[2px] bg-amber-500/50" />
          <div className="h-px bg-zinc-700 mt-0.5 mb-4" />
          <div className="flex items-end justify-between px-1">
            <div className="text-left pb-1">
              <p className="text-[8px] tracking-[0.3em] uppercase text-zinc-600 font-sans leading-relaxed">Est. 2024</p>
              <p className="text-[8px] tracking-[0.3em] uppercase text-zinc-600 font-sans">Vol. I</p>
            </div>
            <div className="text-center flex-1 px-4">
              <h1 className="font-serif text-4xl sm:text-5xl font-black text-white tracking-tight leading-none">
                NEWS PIECES
              </h1>
              <p className="text-[9px] tracking-[0.35em] uppercase text-zinc-500 mt-2 font-sans">
                India · Business · Venture Capital · Funding
              </p>
            </div>
            <div className="text-right pb-1">
              <p className="text-[8px] tracking-[0.2em] uppercase text-zinc-600 font-sans">
                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1 text-[8px] tracking-[0.2em] uppercase text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-40 mt-1 ml-auto font-sans"
              >
                <RefreshCw className={cn("w-2.5 h-2.5", isFetching && "animate-spin")} />
                {isFetching ? "Fetching…" : "Fetch Edition"}
              </button>
            </div>
          </div>
          <div className="h-px bg-zinc-700 mt-4 mb-0.5" />
          <div className="h-[2px] bg-amber-500/50" />
        </div>

        {/* ── Section Nav ──────────────────────────────────────── */}
        <div className="mb-6 border-b border-zinc-800">
          <div className="flex items-center">
            {FILTER_KEYWORDS.map((kw) => (
              <button
                key={kw}
                onClick={() => setFilter(kw)}
                className={cn(
                  "px-4 py-2 text-[9px] tracking-[0.25em] uppercase font-black font-sans border-b-2 -mb-px transition-colors whitespace-nowrap",
                  filter === kw
                    ? "border-amber-400 text-amber-300"
                    : "border-transparent text-zinc-600 hover:text-zinc-300"
                )}
              >
                {kw}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-700 mx-2 self-center" />
            <button
              onClick={() => setFilter("Saved")}
              className={cn(
                "inline-flex items-center gap-1 px-4 py-2 text-[9px] tracking-[0.25em] uppercase font-black font-sans border-b-2 -mb-px transition-colors whitespace-nowrap",
                filter === "Saved"
                  ? "border-emerald-400 text-emerald-300"
                  : "border-transparent text-zinc-600 hover:text-zinc-300"
              )}
            >
              <BookmarkCheck className="w-3 h-3" />
              Saved {saved.size > 0 && `(${saved.size})`}
            </button>
            <div className="ml-auto relative pb-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles…"
                className="pl-7 pr-3 py-1 text-[10px] bg-transparent border-0 text-zinc-400 placeholder:text-zinc-700 outline-none focus:text-zinc-200 w-44 font-sans"
              />
            </div>
          </div>
        </div>

        {/* ── Circulation count ────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-zinc-800" />
          <p className="text-[9px] tracking-[0.3em] uppercase text-zinc-600 font-sans shrink-0">
            {isLoading ? "Loading edition…" : filter === "Saved" ? `${filtered.length} saved article${filtered.length !== 1 ? "s" : ""}` : `${filtered.length} article${filtered.length !== 1 ? "s" : ""} in circulation`}
          </p>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* ── States ───────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
            <p className="text-[10px] tracking-[0.3em] uppercase text-zinc-600 font-sans">Fetching the latest edition…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-800/40 bg-red-900/10 border-t-2 border-t-red-700/60 p-8 text-center">
            <p className="font-serif text-xl font-black text-white mb-1">— Correction —</p>
            <p className="text-xs text-zinc-500 font-sans">{(error as Error).message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 border-t-2 border-t-amber-500/30 p-12 text-center">
            {filter === "Saved" ? (
              <>
                <BookmarkCheck className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="font-serif text-xl font-black text-white">No Saved Articles</p>
                <p className="text-[11px] text-zinc-600 mt-1 font-sans tracking-wide">Hit Save on any article to bookmark it here.</p>
              </>
            ) : (
              <>
                <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="font-serif text-xl font-black text-white">No Articles in Circulation</p>
                <p className="text-[11px] text-zinc-600 mt-1 font-sans tracking-wide">No stories found in the last 3 days.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((article, idx) => (
              <div
                key={article.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 border-t-2 border-t-amber-500/50 hover:border-zinc-700 hover:bg-zinc-900/70 transition-all duration-150"
              >
                <div className="p-5 sm:p-6">
                  {/* Byline row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black tracking-[0.3em] uppercase text-amber-400/80 font-sans">
                      {article.source}
                    </span>
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-[9px] tracking-[0.1em] text-zinc-600 font-sans">
                      {formatNewspaperDate(article.published_at)}
                    </span>
                  </div>

                  <div className="flex items-start gap-5">
                    <div className="flex-1 min-w-0">
                      {/* Headline */}
                      <h3 className={cn(
                        "font-serif font-black text-white leading-tight mb-3",
                        idx === 0 ? "text-2xl" : "text-xl"
                      )}>
                        {article.title}
                      </h3>

                      {/* Body */}
                      {article.summary && (
                        <>
                          <div className="h-px bg-zinc-800 mb-2" />
                          <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-3 font-sans">
                            {article.summary}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex flex-col gap-2 items-end border-l border-zinc-800 pl-5">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Read
                      </a>
                      <button
                        onClick={() => toggleSave(article)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          saved.has(article.id)
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                            : "bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
                        )}
                      >
                        {saved.has(article.id)
                          ? <><BookmarkCheck className="w-3 h-3" /> Saved</>
                          : <><Bookmark className="w-3 h-3" /> Save</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
