import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCompetitorContent, updateCompetitorEntry, type CompetitorCategory } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, ExternalLink, Eye, Heart, Calendar, CheckCircle2, XCircle,
  LayoutGrid, Table as TableIcon, Telescope, RefreshCw, Linkedin,
  Newspaper, TrendingUp, MessageSquare, ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Keywords (shared across LinkedIn + News filtering) ───────────────────────
const KEYWORDS = [
  "Indian Startups", "Indian Unicorns", "Shark Tank India", "Make in India",
  "MSME", "Startup India", "Startup Funding India", "Indian Founders",
  "D2C", "B2B", "B2C", "Startup", "Unicorn", "Decacorn", "IPO", "Funding",
  "Valuation", "Revenue", "Profit", "Loss",
];

// ─── LinkedIn Config ──────────────────────────────────────────────────────────
const LINKEDIN_HANDLES = [
  { name: "Namita Thapar",  username: "linkedin.com/in/namita-thapar",           url: "https://www.linkedin.com/in/namita-thapar" },
  { name: "Anupam Mittal",  username: "linkedin.com/in/anupammittal007",         url: "https://www.linkedin.com/in/anupammittal007" },
  { name: "Aman Gupta",     username: "linkedin.com/in/aman-gupta-7217a515",     url: "https://www.linkedin.com/in/aman-gupta-7217a515" },
  { name: "Kunal Shah",     username: "linkedin.com/in/kunalshah1",              url: "https://www.linkedin.com/in/kunalshah1" },
  { name: "Ghazal Alagh",   username: "linkedin.com/in/ghazal-alagh-9755a0128", url: "https://www.linkedin.com/in/ghazal-alagh-9755a0128" },
  { name: "Nikhil Kamath",  username: "linkedin.com/in/nikhilkamathcio",         url: "https://www.linkedin.com/in/nikhilkamathcio" },
  { name: "Nithin Kamath",  username: "linkedin.com/in/nithin-kamath-81136242",  url: "https://www.linkedin.com/in/nithin-kamath-81136242" },
];
const LINKEDIN_ACTOR_ID = "LQQIXN9Othf8f7R5n";
const APIFY_TOKEN = import.meta.env.VITE_APIFY_TOKEN as string;

// ─── News Config ──────────────────────────────────────────────────────────────
const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY as string;
const TAVILY_URL = "https://api.tavily.com/search";

const NEWS_DOMAINS = [
  "inc42.com", "yourstory.com", "entrackr.com", "moneycontrol.com",
  "economictimes.indiatimes.com", "firstpost.com", "business-standard.com",
  "thehindubusinessline.com", "businessinsider.in", "indianstartupnews.com",
  "fortuneindia.com", "indiatoday.in", "indianexpress.com", "livemint.com",
  "techcrunch.com",
];

const NEWS_SOURCE_LABELS: Record<string, string> = {
  "inc42.com": "Inc42", "yourstory.com": "YourStory", "entrackr.com": "Entrackr",
  "moneycontrol.com": "Moneycontrol", "economictimes.indiatimes.com": "Economic Times",
  "firstpost.com": "Firstpost", "business-standard.com": "Business Standard",
  "thehindubusinessline.com": "Hindu BL", "businessinsider.in": "Business Insider",
  "indianstartupnews.com": "Indian Startup News", "fortuneindia.com": "Fortune India",
  "indiatoday.in": "India Today", "indianexpress.com": "Indian Express",
  "livemint.com": "Mint", "techcrunch.com": "TechCrunch",
};

const NEWS_QUERIES = [
  "Indian startup funding unicorn IPO news",
  "Shark Tank India founders D2C B2B startup news",
  "India startup valuation revenue profit loss news",
  "Make in India MSME business startup news",
];

// ─── Competitor tab config (unchanged) ───────────────────────────────────────
const COMPETITOR_TABS: { key: CompetitorCategory; label: string; color: string }[] = [
  { key: "tech_reels", label: "Tech Reels", color: "bg-blue-600" },
  { key: "fbs_reels",  label: "FBS Reels",  color: "bg-amber-600" },
  { key: "fbs_posts",  label: "FBS Posts",  color: "bg-emerald-600" },
];

const BUCKETS = ["1M+", "500k-1M", "250k-500k", "100k-250k", "50-100k", "<50k"] as const;

const BUCKET_COLORS: Record<string, string> = {
  "1M+":       "bg-red-500/20 text-red-400 border-red-500/30",
  "500k-1M":   "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "250k-500k": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "100k-250k": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "50-100k":   "bg-lime-500/20 text-lime-400 border-lime-500/30",
  "<50k":      "bg-zinc-700/50 text-zinc-400 border-zinc-600/30",
};

type IntelSection = "x_trending" | "linkedin" | "news";
const COMPETITOR_KEYS = new Set<string>(["tech_reels", "fbs_reels", "fbs_posts"]);

// ─── Types ────────────────────────────────────────────────────────────────────
type LinkedInPost = {
  id: string;
  authorName: string;
  authorUrl: string;
  text: string;
  url: string;
  publishedAt: string;
  likes: number;
  comments: number;
};

type NewsItem = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
  matchedKeywords: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    for (const [k, v] of Object.entries(NEWS_SOURCE_LABELS)) {
      if (host.includes(k)) return v;
    }
    return host;
  } catch { return "News"; }
}

function getMatchedKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).slice(0, 3);
}

// ─── Fetch: LinkedIn ──────────────────────────────────────────────────────────
async function fetchLinkedInPosts(): Promise<LinkedInPost[]> {
  if (!APIFY_TOKEN) throw new Error("VITE_APIFY_TOKEN not set");

  const results = await Promise.allSettled(
    LINKEDIN_HANDLES.map(async (handle) => {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${LINKEDIN_ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: handle.username, limit: 3 }),
          signal: AbortSignal.timeout(130000),
        }
      );
      if (!res.ok) return [] as LinkedInPost[];
      const items: any[] = await res.json();
      return items.map((item) => ({
        id: item.url || item.id || crypto.randomUUID(),
        authorName: handle.name,
        authorUrl: handle.url,
        text: item.text || item.content || item.description || "",
        url: item.url || item.postUrl || handle.url,
        publishedAt: item.publishedAt || item.date || item.postedAt || new Date().toISOString(),
        likes: item.likes || item.likeCount || item.numLikes || 0,
        comments: item.comments || item.commentCount || item.numComments || 0,
      }));
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<LinkedInPost[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// ─── Fetch: News ──────────────────────────────────────────────────────────────
async function fetchNews(): Promise<NewsItem[]> {
  if (!TAVILY_API_KEY) throw new Error("VITE_TAVILY_API_KEY not set");

  const results = await Promise.allSettled(
    NEWS_QUERIES.map((query) =>
      fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          topic: "news",
          days: 3,
          max_results: 15,
          include_answer: false,
          include_domains: NEWS_DOMAINS,
        }),
        signal: AbortSignal.timeout(15000),
      })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => d.results ?? [])
    )
  );

  const seen = new Set<string>();
  const items: NewsItem[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item.title || !item.url || seen.has(item.url)) continue;
      const matched = getMatchedKeywords(`${item.title} ${item.content || ""}`);
      if (matched.length === 0) continue;
      seen.add(item.url);
      items.push({
        id: item.url,
        title: item.title,
        summary: item.content?.slice(0, 350) || null,
        url: item.url,
        source: sourceLabel(item.url),
        publishedAt: item.published_date ?? new Date().toISOString(),
        matchedKeywords: matched,
      });
    }
  }

  return items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// ─── LinkedIn Feed Component ──────────────────────────────────────────────────
function LinkedInFeed() {
  const { data: posts = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["linkedin-posts"],
    queryFn: fetchLinkedInPosts,
    staleTime: 60 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
        <p className="text-xs text-zinc-600">Fetching founder posts from {LINKEDIN_HANDLES.length} profiles…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-900/10 p-8 text-center">
        <p className="text-sm text-red-400">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">
          {posts.length} posts · {LINKEDIN_HANDLES.length} founders tracked
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Linkedin className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No recent posts found from tracked founders.</p>
        </div>
      ) : (
        posts.map((post) => (
          <div
            key={post.id}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <a
                  href={post.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-white hover:text-blue-400 transition-colors"
                >
                  {post.authorName}
                </a>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {new Date(post.publishedAt).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </p>
              </div>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View Post
              </a>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed line-clamp-5 mb-3">{post.text}</p>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                <ThumbsUp className="w-3 h-3" />
                <span>{formatCompact(post.likes)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                <MessageSquare className="w-3 h-3" />
                <span>{formatCompact(post.comments)}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── News Intel Component ─────────────────────────────────────────────────────
function NewsIntel() {
  const { data: articles = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["news-intel"],
    queryFn: fetchNews,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-zinc-600" />
        <p className="text-xs text-zinc-600">Fetching relevant news…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-900/10 p-8 text-center">
        <p className="text-sm text-red-400">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">
          {articles.length} articles · keyword-filtered · last 3 days
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No keyword-matched articles in the last 3 days.</p>
        </div>
      ) : (
        articles.map((article) => (
          <div
            key={article.id}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-amber-400/80">
                {article.source}
              </span>
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] text-zinc-600">
                {new Date(article.publishedAt).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short",
                })}
              </span>
            </div>

            <h3 className="text-base font-bold text-white leading-tight mb-2">{article.title}</h3>

            {article.summary && (
              <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3 mb-3">
                {article.summary}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {article.matchedKeywords.map((k) => (
                  <span
                    key={k}
                    className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Read
              </a>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── X Trending Placeholder ───────────────────────────────────────────────────
function XTrendingFeed() {
  return (
    <div className="text-center py-24 text-zinc-600">
      <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm font-semibold text-zinc-400 mb-1">X Trending</p>
      <p className="text-xs max-w-sm mx-auto leading-relaxed">
        Live X trending data is available in the <span className="text-amber-400">News Pieces</span> page under the X Trending tab.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompetitorResearch() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CompetitorCategory>("tech_reels");
  const [intelSection, setIntelSection] = useState<IntelSection | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"gallery" | "table">("gallery");

  const isIntel = intelSection !== null;

  const { data: rawData = [], isLoading } = useQuery<any[]>({
    queryKey: ["competitor", tab, bucket],
    queryFn: () => getCompetitorContent(tab, bucket || undefined),
    enabled: !isIntel,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      updateCompetitorEntry(tab, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor", tab] });
      toast.success("Updated");
    },
  });

  const entries = search.trim()
    ? rawData.filter(
        (e) =>
          (e.account_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.account_handle || "").toLowerCase().includes(search.toLowerCase())
      )
    : rawData;

  const isPostsTab = tab === "fbs_posts";
  const sortKey = isPostsTab ? "likes" : "views";

  const accountMap = new Map<string, { name: string; handle: string; entries: any[]; topMetric: number; totalEntries: number }>();
  for (const entry of entries) {
    const key = entry.account_handle || entry.account_name;
    if (!accountMap.has(key)) {
      accountMap.set(key, { name: entry.account_name, handle: entry.account_handle, entries: [], topMetric: 0, totalEntries: 0 });
    }
    const acc = accountMap.get(key)!;
    acc.entries.push(entry);
    acc.totalEntries++;
    const metric = entry[sortKey] || 0;
    if (metric > acc.topMetric) acc.topMetric = metric;
  }
  const accounts = [...accountMap.values()].sort((a, b) => b.topMetric - a.topMetric);

  if (!isIntel && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
              <Telescope className="w-7 h-7 text-violet-400" />
              Competitor Research
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track competitor reels, posts, and live market intelligence</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {/* Competitor tabs */}
          {COMPETITOR_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setIntelSection(null); setBucket(null); setSearch(""); }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all",
                !isIntel && tab === t.key
                  ? `${t.color} text-white shadow-lg`
                  : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
              )}
            >
              {t.label}
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-6 bg-zinc-700 mx-1" />

          {/* Intel tabs */}
          <button
            onClick={() => setIntelSection("x_trending")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all",
              intelSection === "x_trending"
                ? "bg-zinc-700 text-white shadow-lg"
                : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            X Trending
          </button>
          <button
            onClick={() => setIntelSection("linkedin")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all",
              intelSection === "linkedin"
                ? "bg-blue-700 text-white shadow-lg"
                : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
            )}
          >
            <Linkedin className="w-3.5 h-3.5" />
            LinkedIn
          </button>
          <button
            onClick={() => setIntelSection("news")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all",
              intelSection === "news"
                ? "bg-amber-700 text-white shadow-lg"
                : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
            )}
          >
            <Newspaper className="w-3.5 h-3.5" />
            News
          </button>
        </div>

        {/* ── Intel Sections ─────────────────────────────────────────────── */}
        {intelSection === "x_trending" && <XTrendingFeed />}
        {intelSection === "linkedin"   && <LinkedInFeed />}
        {intelSection === "news"       && <NewsIntel />}

        {/* ── Competitor Sections (existing, unchanged) ──────────────────── */}
        {!isIntel && (
          <>
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="inline-flex items-center bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
                <button
                  onClick={() => setBucket(null)}
                  className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${
                    !bucket ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                {BUCKETS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBucket(bucket === b ? null : b)}
                    className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full font-medium transition-all ${
                      bucket === b ? "bg-violet-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search accounts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-violet-500/50 h-9"
                />
              </div>

              <div className="inline-flex items-center bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setView("gallery")}
                  className={`p-1.5 rounded-md transition-all ${view === "gallery" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="Gallery view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`p-1.5 rounded-md transition-all ${view === "table" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="Table view"
                >
                  <TableIcon className="w-4 h-4" />
                </button>
              </div>

              <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono">
                {entries.length} entries
              </Badge>
            </div>

            {/* Gallery View */}
            {view === "gallery" && (
              <div className="space-y-8">
                {accounts.length === 0 ? (
                  <div className="text-center py-16 text-zinc-600">
                    <Telescope className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No competitor content yet. Data will appear after n8n runs the daily scrape.</p>
                  </div>
                ) : (
                  accounts.map((account) => (
                    <div key={account.handle} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-bold text-white">{account.name}</h3>
                        <span className="text-xs text-zinc-500">@{account.handle}</span>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                          {account.totalEntries} {tab.includes("reel") ? "reels" : "posts"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {account.entries
                          .sort((a: any, b: any) => (b[sortKey] || 0) - (a[sortKey] || 0))
                          .map((entry: any) => (
                            <div
                              key={entry.id}
                              className={`bg-zinc-900 border rounded-xl p-4 hover:border-zinc-600 transition-all group ${
                                entry.usage === "used"
                                  ? "border-emerald-500/30 bg-emerald-500/5"
                                  : "border-zinc-800"
                              }`}
                            >
                              <p className="text-sm font-semibold text-white truncate mb-1">{entry.account_name}</p>
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-zinc-500 hover:text-violet-400 truncate block mb-3"
                              >
                                instagram.com/p/...{entry.url?.split("/").slice(-2, -1)[0]?.slice(-6)}/
                              </a>

                              <Badge
                                variant="outline"
                                className={`text-[10px] mb-3 ${BUCKET_COLORS[entry.view_bucket] || BUCKET_COLORS["<50k"]}`}
                              >
                                {entry.view_bucket}
                              </Badge>

                              <div className="space-y-1.5 mb-3">
                                {isPostsTab ? (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Heart className="w-3 h-3 text-pink-500" />
                                    <span className="text-white font-mono font-bold">{formatCompact(entry.likes || 0)}</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <Eye className="w-3 h-3 text-zinc-600" />
                                      <span className="text-white font-mono font-bold">{formatCompact(entry.views || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <Heart className="w-3 h-3 text-zinc-600" />
                                      <span className="text-zinc-400 font-mono">{formatCompact(entry.likes || 0)}</span>
                                    </div>
                                  </>
                                )}
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Calendar className="w-3 h-3 text-white" />
                                  <span className="text-zinc-500">{entry.posted_at?.slice(0, 10) || "—"}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <a
                                  href={entry.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 flex items-center justify-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg py-1.5 text-[10px] font-medium transition-all"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open
                                </a>
                                <button
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: entry.id,
                                      data: { usage: entry.usage === "used" ? "not_used" : "used" },
                                    })
                                  }
                                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-2 text-[10px] font-medium transition-all ${
                                    entry.usage === "used"
                                      ? "bg-emerald-500/20 text-emerald-400 hover:bg-red-500/20 hover:text-red-400"
                                      : "bg-zinc-800 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400"
                                  }`}
                                  title={entry.usage === "used" ? "Mark as not used" : "Mark as used"}
                                >
                                  {entry.usage === "used" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                  {entry.usage === "used" ? "Used" : "Not used"}
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Table View */}
            {view === "table" && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                      <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Name</th>
                      <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Handle</th>
                      {isPostsTab ? (
                        <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Likes</th>
                      ) : (
                        <>
                          <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Likes</th>
                          <th className="text-right py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Views</th>
                        </>
                      )}
                      <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Bucket</th>
                      <th className="text-left py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Posted</th>
                      <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Link</th>
                      <th className="text-center py-3 px-4 text-xs text-zinc-500 uppercase tracking-wider">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={isPostsTab ? 7 : 8} className="text-center text-zinc-600 py-12">
                          No content yet. Data will appear after n8n runs the daily scrape.
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry: any) => (
                        <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                          <td className="py-3 px-4 text-sm font-medium text-white">{entry.account_name}</td>
                          <td className="py-3 px-4 text-xs text-zinc-500">@{entry.account_handle}</td>
                          {isPostsTab ? (
                            <td className="py-3 px-4 text-sm text-right font-mono font-bold text-white">{formatCompact(entry.likes || 0)}</td>
                          ) : (
                            <>
                              <td className="py-3 px-4 text-sm text-right font-mono text-zinc-400">{formatCompact(entry.likes || 0)}</td>
                              <td className="py-3 px-4 text-sm text-right font-mono font-bold text-white">{formatCompact(entry.views || 0)}</td>
                            </>
                          )}
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className={`text-[10px] ${BUCKET_COLORS[entry.view_bucket] || BUCKET_COLORS["<50k"]}`}>
                              {entry.view_bucket}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-zinc-500">{entry.posted_at?.slice(0, 10) || "—"}</td>
                          <td className="py-3 px-4 text-center">
                            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                              <ExternalLink className="w-4 h-4 inline" />
                            </a>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() =>
                                updateMutation.mutate({
                                  id: entry.id,
                                  data: { usage: entry.usage === "used" ? "not_used" : "used" },
                                })
                              }
                              className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${
                                entry.usage === "used"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {entry.usage === "used" ? "Used" : "Not used"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary stats */}
            {entries.length > 0 && (
              <div className="flex items-center gap-6 mt-4 text-xs text-zinc-600">
                <span>Total entries: <span className="text-white font-bold">{entries.length}</span></span>
                <span>Accounts: <span className="text-white font-bold">{accounts.length}</span></span>
                <span>Avg {isPostsTab ? "likes" : "views"}: <span className="text-white font-bold">{formatCompact(Math.round(entries.reduce((s: number, e: any) => s + (e[sortKey] || 0), 0) / entries.length))}</span></span>
                <span>1M+ hits: <span className="text-amber-400 font-bold">{entries.filter((e: any) => e.view_bucket === "1M+").length}</span></span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
