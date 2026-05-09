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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Newspaper className="w-6 h-6 text-violet-400" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">News Feed</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Startup · VC · Funding · Business — last 3 days
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            {isFetching ? "Fetching…" : "Fetch Latest"}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {FILTER_KEYWORDS.map((kw) => (
              <button
                key={kw}
                onClick={() => setFilter(kw)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  filter === kw
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white"
                )}
              >
                {kw}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
            />
          </div>
        </div>

        <p className="text-xs text-zinc-600 mb-4">
          {isLoading ? "Loading…" : `${filtered.length} article${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Fetching news via Tavily…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-800/50 bg-red-900/10 p-8 text-center">
            <p className="text-red-400 text-sm font-semibold mb-1">Failed to load news</p>
            <p className="text-zinc-500 text-xs">{(error as Error).message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No articles found in the last 3 days.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((article) => (
              <div
                key={article.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                        {article.source}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(article.published_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug mb-2">{article.title}</h3>
                    {article.summary && (
                      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">{article.summary}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
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
                      onClick={() => ticketMut.mutate(article)}
                      disabled={ticketMut.isPending || ticketedIds.has(article.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        ticketedIds.has(article.id)
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-default"
                          : "bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                      )}
                    >
                      <Ticket className="w-3 h-3" />
                      {ticketedIds.has(article.id) ? "Ticketed" : "Add Ticket"}
                    </button>
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
