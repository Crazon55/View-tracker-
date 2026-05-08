import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { createTicket } from "@/services/api";
import { toast } from "sonner";
import { ExternalLink, Newspaper, RefreshCw, Ticket, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type NewsArticle = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  keywords: string[] | null;
  created_at: string;
};

const KEYWORDS = ["All", "Startup", "Venture capital", "Funding", "Business"];

const SOURCE_LABELS: Record<string, string> = {
  "inc42.com": "Inc42",
  "techcrunch.com": "TechCrunch",
  "moneycontrol.com": "Moneycontrol",
  "business-standard.com": "Business Standard",
  "newsbytesapp.com": "NewsBytesApp",
  "fortuneindia.com": "Fortune India",
  "news.google.com": "Google News",
};

function sourceName(url: string | null): string {
  if (!url) return "Unknown";
  try {
    const host = new URL(url).hostname.replace("www.", "");
    for (const [key, label] of Object.entries(SOURCE_LABELS)) {
      if (host.includes(key)) return label;
    }
    return host;
  } catch {
    return url;
  }
}

async function fetchArticles(): Promise<NewsArticle[]> {
  const { data, error } = await supabase
    .from("news_articles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data as NewsArticle[]) || [];
}

async function fetchGoogleNewsRSS() {
  const feeds = [
    "https://news.google.com/rss/search?q=startup+india+funding&hl=en-IN&gl=IN&ceid=IN:en",
    "https://news.google.com/rss/search?q=venture+capital+india&hl=en-IN&gl=IN&ceid=IN:en",
    "https://news.google.com/rss/search?q=funding+round+startup&hl=en-IN&gl=IN&ceid=IN:en",
  ];

  const articles: Omit<NewsArticle, "id" | "created_at">[] = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`);
      if (!res.ok) continue;
      const json = await res.json();
      const parser = new DOMParser();
      const xml = parser.parseFromString(json.contents, "text/xml");
      const items = xml.querySelectorAll("item");
      items.forEach((item) => {
        const title = item.querySelector("title")?.textContent || "";
        const link = item.querySelector("link")?.textContent || "";
        const desc = item.querySelector("description")?.textContent || "";
        const cleanDesc = desc.replace(/<[^>]+>/g, "").slice(0, 300);
        if (title && link) {
          articles.push({
            title: title.trim(),
            summary: cleanDesc.trim() || null,
            url: link.trim(),
            source: sourceName(link),
            keywords: ["auto"],
          });
        }
      });
    } catch {
      // skip failed feed
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    const key = a.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 20);
}

export default function NewsFeed() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [ticketedIds, setTicketedIds] = useState<Set<string>>(new Set());

  const { data: articles = [], isLoading, refetch } = useQuery({
    queryKey: ["news-articles"],
    queryFn: fetchArticles,
    staleTime: 5 * 60_000,
  });

  const refreshMut = useMutation({
    mutationFn: async () => {
      const fresh = await fetchGoogleNewsRSS();
      if (!fresh.length) throw new Error("No articles fetched");
      const { error } = await supabase.from("news_articles").upsert(
        fresh.map((a) => ({ ...a })),
        { onConflict: "url", ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(`Fetched ${count} fresh articles`);
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Fetch failed"),
  });

  const ticketMut = useMutation({
    mutationFn: async (article: NewsArticle) => {
      return createTicket({
        title: article.title,
        description: `${article.summary || ""}\n\nSource: ${article.url}`.trim(),
        urgency: "normal",
        tags: ["news", "auto"],
      });
    },
    onSuccess: (_, article) => {
      setTicketedIds((prev) => new Set([...prev, article.id]));
      toast.success("Ticket created");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create ticket"),
  });

  const filtered = articles.filter((a) => {
    const text = `${a.title} ${a.summary || ""}`.toLowerCase();
    const matchesKeyword =
      filter === "All" || text.includes(filter.toLowerCase());
    const matchesSearch =
      !search.trim() || text.includes(search.toLowerCase());
    return matchesKeyword && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Newspaper className="w-6 h-6 text-violet-400" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                News Feed
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Startup · VC · Funding · Business — auto-refreshed daily at 10:30 AM
              </p>
            </div>
          </div>
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", refreshMut.isPending && "animate-spin")} />
            {refreshMut.isPending ? "Fetching…" : "Fetch Latest"}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {KEYWORDS.map((kw) => (
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

        {/* Article count */}
        <p className="text-xs text-zinc-600 mb-4">
          {isLoading ? "Loading…" : `${filtered.length} article${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {/* Articles */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading articles…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No articles yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Click <strong className="text-zinc-400">Fetch Latest</strong> to pull today's news, or wait for the 10:30 AM auto-refresh.
            </p>
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
                      {article.source && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                          {article.source}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600">
                        {new Date(article.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug mb-2">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                        {article.summary}
                      </p>
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
