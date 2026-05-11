import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createTicket } from "@/services/api";
import { toast } from "sonner";
import { ExternalLink, Newspaper, RefreshCw, Ticket, Search } from "lucide-react";
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

export default function NewsFeed() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [ticketedIds, setTicketedIds] = useState<Set<string>>(new Set());

  const { data: articles = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["news-tavily"],
    queryFn: fetchTavilyNews,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const ticketMut = useMutation({
    mutationFn: async (article: NewsArticle) =>
      createTicket({
        title: article.title,
        description: `${article.summary || ""}\n\nSource: ${article.url}`.trim(),
        urgency: "normal",
        tags: ["news", "auto"],
      }),
    onSuccess: (_, article) => {
      setTicketedIds((prev) => new Set([...prev, article.id]));
      toast.success("Ticket created");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create ticket"),
  });

  const filtered = articles.filter((a) => {
    const text = `${a.title} ${a.summary || ""}`.toLowerCase();
    return (
      (filter === "All" || text.includes(filter.toLowerCase())) &&
      (!search.trim() || text.includes(search.toLowerCase()))
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* ── Masthead ─────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="h-[3px] bg-amber-50/80" />
          <div className="h-px bg-amber-50/25 mt-0.5 mb-4" />
          <div className="flex items-end justify-between px-1">
            <div className="text-left pb-1">
              <p className="text-[8px] tracking-[0.3em] uppercase text-zinc-600 font-sans leading-relaxed">Est. 2024</p>
              <p className="text-[8px] tracking-[0.3em] uppercase text-zinc-600 font-sans">Vol. I</p>
            </div>
            <div className="text-center flex-1 px-4">
              <h1 className="font-serif text-4xl sm:text-5xl font-black text-amber-50 tracking-tight leading-none">
                The Startup Gazette
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
                className="inline-flex items-center gap-1 text-[8px] tracking-[0.2em] uppercase text-zinc-500 hover:text-amber-300 transition-colors disabled:opacity-40 mt-1 ml-auto font-sans"
              >
                <RefreshCw className={cn("w-2.5 h-2.5", isFetching && "animate-spin")} />
                {isFetching ? "Fetching…" : "Fetch Edition"}
              </button>
            </div>
          </div>
          <div className="h-px bg-amber-50/25 mt-4 mb-0.5" />
          <div className="h-[3px] bg-amber-50/80" />
        </div>

        {/* ── Section Nav ──────────────────────────────────────── */}
        <div className="mb-6 border-b border-zinc-700">
          <div className="flex items-center">
            {FILTER_KEYWORDS.map((kw) => (
              <button
                key={kw}
                onClick={() => setFilter(kw)}
                className={cn(
                  "px-4 py-2 text-[9px] tracking-[0.25em] uppercase font-black font-sans border-b-2 -mb-px transition-colors whitespace-nowrap",
                  filter === kw
                    ? "border-amber-400 text-amber-200"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                {kw}
              </button>
            ))}
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
            {isLoading ? "Loading edition…" : `${filtered.length} article${filtered.length !== 1 ? "s" : ""} in circulation`}
          </p>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* ── States ───────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-50/30" />
            <p className="text-[10px] tracking-[0.3em] uppercase text-zinc-600 font-sans">Fetching the latest edition…</p>
          </div>
        ) : error ? (
          <div className="bg-stone-100 border border-stone-200 border-t-4 border-t-red-900 p-8 text-center shadow-[4px_4px_0_0_rgba(0,0,0,0.5)]">
            <p className="font-serif text-xl font-black text-stone-900 mb-1">— CORRECTION —</p>
            <p className="text-xs text-stone-600 font-sans">{(error as Error).message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-stone-100 border border-stone-200 border-t-4 border-t-stone-900 p-12 text-center shadow-[4px_4px_0_0_rgba(0,0,0,0.5)]">
            <Newspaper className="w-8 h-8 text-stone-400 mx-auto mb-3" />
            <p className="font-serif text-xl font-black text-stone-900">No Articles in Circulation</p>
            <p className="text-[11px] text-stone-500 mt-1 font-sans tracking-wide">No stories found in the last 3 days.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {filtered.map((article, idx) => (
              <div
                key={article.id}
                className="bg-stone-100 border border-stone-200 border-t-4 border-t-stone-900 shadow-[4px_4px_0_0_rgba(0,0,0,0.45)] hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.55)] hover:-translate-y-0.5 transition-all duration-150"
              >
                <div className="p-5 sm:p-6">
                  {/* Byline row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black tracking-[0.3em] uppercase text-stone-900 font-sans">
                      {article.source}
                    </span>
                    <div className="flex-1 h-px bg-stone-400" />
                    <span className="text-[9px] tracking-[0.1em] text-stone-500 font-sans">
                      {formatNewspaperDate(article.published_at)}
                    </span>
                  </div>

                  <div className="flex items-start gap-5">
                    <div className="flex-1 min-w-0">
                      {/* Headline */}
                      <h3 className={cn(
                        "font-serif font-black text-stone-900 leading-tight mb-3",
                        idx === 0 ? "text-2xl" : "text-xl"
                      )}>
                        {article.title}
                      </h3>

                      {/* Body */}
                      {article.summary && (
                        <>
                          <div className="h-px bg-stone-300 mb-2" />
                          <p className="text-[11px] text-stone-700 leading-relaxed line-clamp-3 font-sans">
                            {article.summary}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex flex-col gap-2.5 items-end border-l border-stone-300 pl-5">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[9px] font-black tracking-[0.2em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors font-sans"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Read
                      </a>
                      <button
                        onClick={() => ticketMut.mutate(article)}
                        disabled={ticketMut.isPending || ticketedIds.has(article.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black tracking-[0.15em] uppercase border font-sans transition-colors whitespace-nowrap",
                          ticketedIds.has(article.id)
                            ? "border-emerald-700 text-emerald-700 cursor-default"
                            : "border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-stone-100 disabled:opacity-40"
                        )}
                      >
                        <Ticket className="w-3 h-3" />
                        {ticketedIds.has(article.id) ? "Filed" : "File Ticket"}
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
