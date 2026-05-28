import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Bookmark, BookmarkCheck, Search, Linkedin, TrendingUp, Newspaper, ThumbsUp, ThumbsDown, MessageSquare, Heart, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── API Keys ─────────────────────────────────────────────────────────────────
const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY as string;
const TAVILY_URL = "https://api.tavily.com/search";
const APIFY_TOKEN = import.meta.env.VITE_APIFY_TOKEN as string;
const LINKEDIN_ACTOR_ID = "LQQIXN9Othf8f7R5n";
const BACKEND_URL = (import.meta.env.VITE_API_URL as string) || "";

// ─── Keywords ─────────────────────────────────────────────────────────────────
const KEYWORDS = [
  "Indian Startups", "Indian Unicorns", "Shark Tank India", "Make in India",
  "MSME", "Startup India", "Startup Funding India", "Indian Founders",
  "Business & Startup", "D2C", "B2B", "B2C", "Startup", "Unicorn",
  "Decacorn", "IPO", "Funding", "Valuation", "Revenue", "Profit", "Loss",
];

// ─── LinkedIn Founders ────────────────────────────────────────────────────────
const LINKEDIN_HANDLES = [
  { name: "Namita Thapar",  username: "linkedin.com/in/namita-thapar",           url: "https://www.linkedin.com/in/namita-thapar" },
  { name: "Anupam Mittal",  username: "linkedin.com/in/anupammittal007",         url: "https://www.linkedin.com/in/anupammittal007" },
  { name: "Aman Gupta",     username: "linkedin.com/in/aman-gupta-7217a515",     url: "https://www.linkedin.com/in/aman-gupta-7217a515" },
  { name: "Kunal Shah",     username: "linkedin.com/in/kunalshah1",              url: "https://www.linkedin.com/in/kunalshah1" },
  { name: "Ghazal Alagh",   username: "linkedin.com/in/ghazal-alagh-9755a0128", url: "https://www.linkedin.com/in/ghazal-alagh-9755a0128" },
  { name: "Nikhil Kamath",  username: "linkedin.com/in/nikhilkamathcio",         url: "https://www.linkedin.com/in/nikhilkamathcio" },
  { name: "Nithin Kamath",  username: "linkedin.com/in/nithin-kamath-81136242",  url: "https://www.linkedin.com/in/nithin-kamath-81136242" },
];

// ─── News Domains ─────────────────────────────────────────────────────────────
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
  "livemint.com": "Mint",
};

const NEWS_QUERIES = [
  "India startup founder breaking news today viral",
  "Indian billionaire businessman wealth India trending today",
  "India startup unicorn IPO funding announcement today",
  "Shark Tank India founder Indian brand viral news",
  "India business scandal controversy trending today",
  "popular Indian company startup founder news today",
  "Indian startup funding unicorn IPO India today",
  "Shark Tank India founders Indian brands D2C news today",
  "Indian founder startup valuation revenue profit India",
  "Make in India MSME Startup India news today",
  "India breaking startup business news today",
  "Indian billionaire businessman wealth India news",
  "popular Indian company brand news today",
  "Indian unicorn decacorn IPO funding announcement",
];

// Article must contain at least one of these to pass — prevents global news leaking in
const INDIA_REQUIRED_KEYWORDS = [
  "india", "indian", "shark tank", "msme", "rupee", "crore", "lakh",
  "zepto", "zomato", "swiggy", "ola", "paytm", "flipkart", "meesho",
  "mamaearth", "boat", "cred", "zerodha", "groww", "nykaa", "blinkit",
  "razorpay", "freshworks", "infosys", "tata", "reliance", "adani",
  "ambani", "mukesh", "ratan", "byju", "unacademy", "vedantu",
  "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "pune",
  "ola electric", "ather", "dunzo", "curefit", "licious", "mensa",
  "oyo", "myntra", "bigbasket", "pepperfry", "urban company",
  "nazara", "dream11", "games24x7", "khatabook", "ofbusiness",
  "namita", "anupam mittal", "aman gupta", "kunal shah", "ghazal",
  "nikhil kamath", "nithin kamath", "peyush bansal", "vineeta singh",
];

// Brands that always pass through — even if a learned pattern would block them.
// "Zepto reports net loss" is relevant; "Shree Manufacturing reports net loss" is not.
const KNOWN_BRANDS = new Set([
  "zepto", "zomato", "blinkit", "swiggy", "ola", "paytm", "flipkart", "meesho",
  "mamaearth", "boat", "cred", "zerodha", "groww", "nykaa", "razorpay",
  "freshworks", "infosys", "wipro", "tcs", "hcl", "tech mahindra",
  "tata", "reliance", "adani", "bajaj", "mahindra", "hero",
  "oyo", "myntra", "bigbasket", "urban company", "lenskart",
  "dream11", "games24x7", "nazara", "mpl",
  "byju", "unacademy", "vedantu", "physicswallah", "pw",
  "ather", "ola electric", "pure ev", "revolt",
  "dunzo", "curefit", "licious", "mensa",
  "khatabook", "ofbusiness", "udaan", "delhivery", "shiprocket",
  "slice", "jupiter", "fi money", "open", "cashfree",
  "sharechat", "moj", "dailyhunt", "josh",
  "namita thapar", "anupam mittal", "aman gupta", "kunal shah",
  "ghazal alagh", "nikhil kamath", "nithin kamath", "peyush bansal", "vineeta singh",
  "mukesh ambani", "ratan tata", "gautam adani", "azim premji",
]);

function titleHasKnownBrand(title: string): boolean {
  const lower = title.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) return true;
  }
  return false;
}

// ─── Unified Feed Item Type ───────────────────────────────────────────────────
type FeedItem = {
  id: string;
  type: "news" | "linkedin" | "x";
  title: string;
  body: string | null;
  url: string;
  source: string;
  publishedAt: string;
  matchedKeywords: string[];
  // linkedin extras
  authorUrl?: string;
  likes?: number;
  comments?: number;
  // x extras
  postCount?: string;
  category?: string;
};

// ─── IST Work Hours Helpers ───────────────────────────────────────────────────
function getISTMinutes(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.getHours() * 60 + ist.getMinutes();
}

function isWorkHoursIST(): boolean {
  const m = getISTMinutes();
  return m >= 10 * 60 + 30 && m <= 18 * 60 + 30; // 10:30 – 18:30
}

function isTodayIST(dateStr: string): boolean {
  if (!dateStr) return false;
  const utcMs = new Date().getTime() + new Date().getTimezoneOffset() * 60000;
  const istNow = new Date(utcMs + 5.5 * 60 * 60 * 1000);
  const articleUtcMs = new Date(dateStr).getTime() + new Date().getTimezoneOffset() * 60000;
  const istArticle = new Date(articleUtcMs + 5.5 * 60 * 60 * 1000);
  return istNow.toDateString() === istArticle.toDateString();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    for (const [k, v] of Object.entries(NEWS_SOURCE_LABELS)) {
      if (host.includes(k)) return v;
    }
    return host;
  } catch { return "News"; }
}

function parseLinkedInDate(item: any): string {
  // Try absolute date fields first
  const abs = item.publishedAt || item.date || item.postedAt || item.createdAt || item.postedDate;
  if (abs && typeof abs === "string" && abs.match(/\d{4}/)) {
    const d = new Date(abs);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Handle relative formats: "5d", "2h", "1w", "3mo", "5 days", "5 days ago", "just now"
  const rel: string = item.timeSincePosted || item.time || item.relativeTime || "";
  if (rel) {
    const now = Date.now();
    if (/just now|moments? ago/i.test(rel)) return new Date(now - 60000).toISOString();
    const m = rel.match(/(\d+)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:ou?r?s?)?|d(?:ay?s?)?|w(?:ee?k?s?)?|mo(?:nth?s?)?|y(?:ea?r?s?)?)/i);
    if (m) {
      const n = parseInt(m[1]);
      const u = m[2].toLowerCase();
      const ms =
        u.startsWith("s") ? 1000 :
        u.startsWith("mo") ? 2592000000 :
        u.startsWith("m") ? 60000 :
        u.startsWith("h") ? 3600000 :
        u.startsWith("d") ? 86400000 :
        u.startsWith("w") ? 604800000 :
        u.startsWith("y") ? 31536000000 : 0;
      if (ms) return new Date(now - n * ms).toISOString();
    }
  }

  // Unknown date — use a week ago so it doesn't appear as today
  return new Date(Date.now() - 7 * 86400000).toISOString();
}

function getMatchedKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).slice(0, 3);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Fetch: News ──────────────────────────────────────────────────────────────
async function fetchNews(): Promise<FeedItem[]> {
  if (!TAVILY_API_KEY) throw new Error("VITE_TAVILY_API_KEY is not set");

  const results = await Promise.allSettled(
    NEWS_QUERIES.map((query) =>
      fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          topic: "news",
          days: 2,
          max_results: 20,
          search_depth: "advanced",
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
  const items: FeedItem[] = [];

  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item.title || !item.url || seen.has(item.url)) continue;

      // Hard date gate — no date or older than 3 days = skip entirely
      if (!item.published_date) continue;
      const pubDate = new Date(item.published_date);
      if (isNaN(pubDate.getTime()) || pubDate.getTime() < threeDaysAgo) continue;

      const text = `${item.title} ${item.content || ""}`.toLowerCase();
      const isIndia = INDIA_REQUIRED_KEYWORDS.some((k) => text.includes(k));
      if (!isIndia) continue;
      seen.add(item.url);
      items.push({
        id: item.url,
        type: "news",
        title: item.title,
        body: item.content?.slice(0, 350) || null,
        url: item.url,
        source: sourceLabel(item.url),
        publishedAt: item.published_date,
        matchedKeywords: getMatchedKeywords(text),
      });
    }
  }

  return items;
}

// ─── Fetch: LinkedIn ──────────────────────────────────────────────────────────
async function fetchLinkedIn(): Promise<FeedItem[]> {
  if (!APIFY_TOKEN) return [];

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
      if (!res.ok) return [] as FeedItem[];
      const items: any[] = await res.json();
      return items.map((item): FeedItem => ({
        id: item.url || item.id || crypto.randomUUID(),
        type: "linkedin",
        title: handle.name,
        body: item.text || item.content || item.description || "",
        url: item.url || item.postUrl || handle.url,
        source: "LinkedIn",
        publishedAt: parseLinkedInDate(item),
        matchedKeywords: getMatchedKeywords(item.text || item.content || ""),
        authorUrl: handle.url,
        likes: item.likes || item.likeCount || item.numLikes || 0,
        comments: item.comments || item.commentCount || item.numComments || 0,
      }));
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

// ─── Fetch: X Trending + Explorer via backend proxy ──────────────────────────
async function fetchXTrending(): Promise<FeedItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/x-feed`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const asOf: string = data.as_of || new Date().toISOString();
    const items: FeedItem[] = [];

    // Trending topics
    for (const t of (data.trends ?? [])) {
      if (!t.name) continue;
      items.push({
        id: t.url || t.name,
        type: "x",
        title: t.name,
        body: t.tweet_volume ? `${Number(t.tweet_volume).toLocaleString()} posts` : null,
        url: t.url || `https://x.com/search?q=${encodeURIComponent(t.name)}`,
        source: "X Trending",
        publishedAt: asOf,
        matchedKeywords: getMatchedKeywords(t.name),
        postCount: t.tweet_volume ? `${Number(t.tweet_volume).toLocaleString()}` : undefined,
      });
    }

    // Live tweets from Explorer search
    for (const tweet of (data.tweets ?? [])) {
      if (!tweet.text) continue;
      let publishedAt = asOf;
      try {
        const d = new Date(tweet.created_at);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      } catch { /* keep asOf */ }
      items.push({
        id: tweet.id,
        type: "x",
        title: tweet.user_name ? `${tweet.user_name} · @${tweet.user_screen_name}` : `@${tweet.user_screen_name}`,
        body: tweet.text,
        url: tweet.url,
        source: "X",
        publishedAt,
        matchedKeywords: getMatchedKeywords(tweet.text),
        likes: tweet.favorites || 0,
        comments: tweet.retweets || 0,
        authorUrl: `https://x.com/${tweet.user_screen_name}`,
      });
    }

    return items;
  } catch {
    return [];
  }
}

// ─── Fetch: All Sources Combined ─────────────────────────────────────────────
async function fetchAllFeed(): Promise<FeedItem[]> {
  const [news, linkedin, xItems] = await Promise.allSettled([
    fetchNews(),
    fetchLinkedIn(),
    fetchXTrending(),
  ]);

  const all: FeedItem[] = [
    ...(news.status === "fulfilled" ? news.value : []),
    ...(linkedin.status === "fulfilled" ? linkedin.value : []),
    ...(xItems.status === "fulfilled" ? xItems.value : []),
  ];

  return all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// ─── Saved ────────────────────────────────────────────────────────────────────
const SAVED_KEY = "news-saved-articles";

function loadSaved(): Map<string, FeedItem> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return new Map();
    const arr: FeedItem[] = JSON.parse(raw);
    return new Map(arr.map((a) => [a.id, a]));
  } catch { return new Map(); }
}

function persistSaved(map: Map<string, FeedItem>) {
  localStorage.setItem(SAVED_KEY, JSON.stringify([...map.values()]));
}

// ─── Feedback / Learning ──────────────────────────────────────────────────────
const FEEDBACK_KEY = "nf-feedback";
const RULES_KEY = "nf-rules";

// Body fragments that mean Tavily scraped a login/paywall page, not real content
const ARTIFACT_MARKERS = [
  "{{firstname}}", "edit logout", "login / sign up", "login/sign up",
  "sign up my reads", "my account newsletters", "हिंदी में",
];

type Vote = "yes" | "no";

// Categories the system can understand and learn to auto-block
type ArticleCategory =
  | "routine-filing"          // quarterly/annual BSE results from unknown company
  | "unknown-company-finance" // profit/loss from a company nobody knows
  | "scraping-artifact"       // body is a paywall template
  | "general";                // everything else

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  "routine-filing": "routine quarterly filing from an unknown company",
  "unknown-company-finance": "financial news from a company you don't cover",
  "scraping-artifact": "article the scraper couldn't read (paywall)",
  "general": "article",
};

function loadFeedback(): Record<string, Vote> {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "{}"); } catch { return {}; }
}
function loadRules(): Set<ArticleCategory> {
  try { return new Set(JSON.parse(localStorage.getItem(RULES_KEY) || "[]")); } catch { return new Set(); }
}

function isScrapingArtifact(body: string | null): boolean {
  if (!body) return false;
  const lower = body.toLowerCase();
  return ARTIFACT_MARKERS.some((m) => lower.includes(m));
}

// Reads the article itself to understand WHY it might be getting No'd.
// One No is enough to activate a category rule — no counting required.
function detectCategory(item: FeedItem): ArticleCategory {
  if (item.type === "news" && isScrapingArtifact(item.body)) return "scraping-artifact";
  // known brands are never categorised as filterable — their financial news is relevant
  if (titleHasKnownBrand(item.title)) return "general";

  const text = `${item.title} ${item.body || ""}`.toLowerCase();

  // Routine BSE/NSE quarterly or annual filing:
  // "XYZ Company reports standalone net loss of Rs N crore in March quarter"
  const isFinancialResult =
    (text.includes("standalone") || text.includes("consolidated")) &&
    (text.includes("net loss") || text.includes("net profit")) &&
    (text.includes("quarter") || /\bq[1-4]\b/.test(text) || text.includes(" fy") || /march|june|september|december/.test(text));
  if (isFinancialResult) return "routine-filing";

  // Unknown company finance: has a corporate suffix + financial language, no known brand
  const hasCorporateSuffix =
    / limited\b| ltd\b| pvt\b|industries\b|enterprises\b|corporation\b/.test(text);
  const hasFinanceWord =
    text.includes("profit") || text.includes("loss") ||
    text.includes("revenue") || (text.includes("crore") && text.includes("report"));
  if (hasCorporateSuffix && hasFinanceWord) return "unknown-company-finance";

  return "general";
}

// Returns the category that was learned so the caller can show a useful toast.
function recordNo(url: string, item: FeedItem): ArticleCategory {
  const fb = loadFeedback();
  fb[url] = "no";
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(fb));

  const category = detectCategory(item);
  if (category !== "general") {
    const rules = loadRules();
    rules.add(category);
    localStorage.setItem(RULES_KEY, JSON.stringify([...rules]));
  }
  return category;
}

function recordYes(url: string) {
  const fb = loadFeedback();
  fb[url] = "yes";
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(fb));
}

function isArticleBlocked(item: FeedItem, feedback: Record<string, Vote>, rules: Set<ArticleCategory>): boolean {
  // explicit No always hides, regardless of category
  if (feedback[item.id] === "no") return true;
  // scraping artifact — auto-blocked without needing a No
  if (item.type === "news" && isScrapingArtifact(item.body)) return true;
  // known brand — never blocked by category rules
  if (titleHasKnownBrand(item.title)) return false;
  // apply learned category rules
  const category = detectCategory(item);
  return category !== "general" && rules.has(category);
}

function getLearnedPatternCount(): number {
  return loadRules().size;
}

function resetLearning() {
  localStorage.removeItem(FEEDBACK_KEY);
  localStorage.removeItem(RULES_KEY);
}

// ─── Source Badge ─────────────────────────────────────────────────────────────
function SourceBadge({ item }: { item: FeedItem }) {
  if (item.type === "linkedin") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-[0.3em] uppercase text-blue-400/90 font-sans">
        <Linkedin className="w-2.5 h-2.5" />
        LinkedIn
      </span>
    );
  }
  if (item.type === "x") {
    if (item.source === "X") {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-[0.3em] uppercase text-zinc-300 font-sans">
          <span className="font-black text-[10px] leading-none">𝕏</span>
          Post
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-[0.3em] uppercase text-zinc-300 font-sans">
        <TrendingUp className="w-2.5 h-2.5" />
        X Trending
      </span>
    );
  }
  return (
    <span className="text-[9px] font-black tracking-[0.3em] uppercase text-amber-400/80 font-sans">
      {item.source}
    </span>
  );
}

// ─── Feed Card ────────────────────────────────────────────────────────────────
function FeedCard({
  item,
  idx,
  isSaved,
  onSave,
  vote,
  onYes,
  onNo,
}: {
  item: FeedItem;
  idx: number;
  isSaved: boolean;
  onSave: (item: FeedItem) => void;
  vote: Vote | null;
  onYes: (item: FeedItem) => void;
  onNo: (item: FeedItem) => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border bg-zinc-900/40 border-t-2 hover:border-zinc-700 hover:bg-zinc-900/70 transition-all duration-150",
      vote === "yes"
        ? "border-emerald-800 border-t-emerald-500/60"
        : "border-zinc-800 border-t-amber-500/50"
    )}>
      <div className="p-5 sm:p-6">
        {/* Byline row */}
        <div className="flex items-center gap-2 mb-3">
          <SourceBadge item={item} />
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-[9px] tracking-[0.1em] text-zinc-600 font-sans">
            {formatDate(item.publishedAt)}
          </span>
        </div>

        <div className="flex items-start gap-5">
          <div className="flex-1 min-w-0">
            {/* Title / Author */}
            <h3 className={cn(
              "font-serif font-black text-white leading-tight mb-2",
              idx === 0 ? "text-2xl" : "text-xl"
            )}>
              {item.type === "linkedin" ? (
                <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  {item.title}
                </a>
              ) : item.title}
            </h3>

            {/* Body */}
            {item.body && (
              <>
                <div className="h-px bg-zinc-800 mb-2" />
                <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-4 font-sans">
                  {item.body}
                </p>
              </>
            )}

            {/* LinkedIn engagement */}
            {item.type === "linkedin" && (
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <ThumbsUp className="w-3 h-3" />
                  {formatCompact(item.likes || 0)}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <MessageSquare className="w-3 h-3" />
                  {formatCompact(item.comments || 0)}
                </div>
              </div>
            )}

            {/* X tweet engagement */}
            {item.type === "x" && item.source === "X" && (
              <div className="flex items-center gap-4 mt-2">
                {(item.likes || 0) > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                    <Heart className="w-3 h-3" />
                    {formatCompact(item.likes || 0)}
                  </div>
                )}
                {(item.comments || 0) > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                    <Repeat2 className="w-3 h-3" />
                    {formatCompact(item.comments || 0)}
                  </div>
                )}
              </div>
            )}

            {/* X trending post count */}
            {item.type === "x" && item.source === "X Trending" && item.postCount && (
              <p className="text-[10px] text-zinc-600 mt-1 font-sans">
                {item.postCount} posts · {item.category}
              </p>
            )}

            {/* Keyword tags */}
            {item.matchedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.matchedKeywords.map((k) => (
                  <span key={k} className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="shrink-0 flex flex-col gap-2 items-end border-l border-zinc-800 pl-5">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {item.type === "linkedin" ? "View Post" : item.type === "x" && item.source === "X" ? "View Tweet" : "Read"}
            </a>

            {/* Yes / No feedback */}
            <div className="flex gap-1.5">
              <button
                onClick={() => onYes(item)}
                title="Good content — learn more like this"
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  vote === "yes"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-white/[0.03] border-white/10 text-zinc-500 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400"
                )}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => onNo(item)}
                title="Not relevant — hide and learn to block similar"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-white/[0.03] border-white/10 text-zinc-500 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-colors"
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>

            {/* Save */}
            <button
              onClick={() => onSave(item)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                isSaved
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
              )}
            >
              {isSaved
                ? <><BookmarkCheck className="w-3 h-3" /> Saved</>
                : <><Bookmark className="w-3 h-3" /> Save</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type FilterTab = "All" | "News" | "LinkedIn" | "X Trending" | "Saved";
const FILTER_TABS: FilterTab[] = ["All", "News", "LinkedIn", "X Trending", "Saved"];

export default function NewsFeed() {
  const [filter, setFilter] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<Map<string, FeedItem>>(loadSaved);
  const [feedback, setFeedback] = useState<Record<string, Vote>>(loadFeedback);
  const [rules, setRules] = useState<Set<ArticleCategory>>(loadRules);

  const { data: allItems = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["unified-feed"],
    queryFn: fetchAllFeed,
    staleTime: 60 * 60_000,
    refetchInterval: () => isWorkHoursIST() ? 60 * 60_000 : false,
    retry: 1,
  });

  function toggleSave(item: FeedItem) {
    setSaved((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        persistSaved(next);
        toast.success("Removed from saved");
      } else {
        next.set(item.id, item);
        persistSaved(next);
        toast.success("Saved");
      }
      return next;
    });
  }

  function handleYes(item: FeedItem) {
    recordYes(item.id);
    setFeedback((prev) => ({ ...prev, [item.id]: "yes" }));
    toast.success("Got it — more like this");
  }

  function handleNo(item: FeedItem) {
    const category = recordNo(item.id, item);
    setFeedback((prev) => ({ ...prev, [item.id]: "no" }));
    setRules(loadRules());
    const label = CATEGORY_LABELS[category];
    if (category !== "general") {
      toast(`Hidden + learned — will auto-block ${label} from now on`, { icon: "🚫" });
    } else {
      toast("Hidden", { icon: "🚫" });
    }
  }

  function handleResetLearning() {
    resetLearning();
    setFeedback({});
    setRules(new Set());
    toast.success("Learning reset — starting fresh");
  }

  const baseList = filter === "Saved" ? [...saved.values()] : allItems;

  const filtered = baseList.filter((item) => {
    if (filter !== "Saved" && isArticleBlocked(item, feedback, rules)) return false;

    const matchesFilter =
      filter === "All" ||
      filter === "Saved" ||
      (filter === "News" && item.type === "news") ||
      (filter === "LinkedIn" && item.type === "linkedin") ||
      (filter === "X Trending" && item.type === "x");

    const text = `${item.title} ${item.body || ""}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const noCount = Object.values(feedback).filter((v) => v === "no").length;
  const learnedPatterns = getLearnedPatternCount();

  const newsCount = allItems.filter((i) => i.type === "news" && !isArticleBlocked(i, feedback, rules)).length;
  const linkedinCount = allItems.filter((i) => i.type === "linkedin" && !isArticleBlocked(i, feedback, rules)).length;
  const xCount = allItems.filter((i) => i.type === "x" && !isArticleBlocked(i, feedback, rules)).length;

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">

        {/* Masthead */}
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
                News · LinkedIn · X Trending
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
              {(noCount > 0 || learnedPatterns > 0) && (
                <div className="flex items-center gap-2 mt-1 justify-end">
                  <span className="text-[7px] tracking-[0.15em] text-zinc-700 font-sans">
                    {noCount} hidden · {learnedPatterns} patterns learned
                  </span>
                  <button
                    onClick={handleResetLearning}
                    className="text-[7px] tracking-[0.15em] uppercase text-zinc-700 hover:text-red-500 transition-colors font-sans"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="h-px bg-zinc-700 mt-4 mb-0.5" />
          <div className="h-[2px] bg-amber-500/50" />
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 border-b border-zinc-800">
          <div className="flex items-center">
            {FILTER_TABS.filter((t) => t !== "Saved").map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-[9px] tracking-[0.25em] uppercase font-black font-sans border-b-2 -mb-px transition-colors whitespace-nowrap",
                  filter === tab
                    ? "border-amber-400 text-amber-300"
                    : "border-transparent text-zinc-600 hover:text-zinc-300"
                )}
              >
                {tab === "LinkedIn" && <Linkedin className="w-2.5 h-2.5" />}
                {tab === "X Trending" && <TrendingUp className="w-2.5 h-2.5" />}
                {tab === "News" && <Newspaper className="w-2.5 h-2.5" />}
                {tab}
                {tab === "News" && newsCount > 0 && (
                  <span className="text-[8px] text-zinc-600 font-mono">({newsCount})</span>
                )}
                {tab === "LinkedIn" && linkedinCount > 0 && (
                  <span className="text-[8px] text-zinc-600 font-mono">({linkedinCount})</span>
                )}
                {tab === "X Trending" && xCount > 0 && (
                  <span className="text-[8px] text-zinc-600 font-mono">({xCount})</span>
                )}
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
                placeholder="Search feed…"
                className="pl-7 pr-3 py-1 text-[10px] bg-transparent border-0 text-zinc-400 placeholder:text-zinc-700 outline-none focus:text-zinc-200 w-44 font-sans"
              />
            </div>
          </div>
        </div>

        {/* Count */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-zinc-800" />
          <p className="text-[9px] tracking-[0.3em] uppercase text-zinc-600 font-sans shrink-0">
            {isLoading
              ? "Loading edition…"
              : filter === "Saved"
              ? `${filtered.length} saved item${filtered.length !== 1 ? "s" : ""}`
              : `${filtered.length} item${filtered.length !== 1 ? "s" : ""} in circulation`}
          </p>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* Source summary pills */}
        {!isLoading && filter === "All" && allItems.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-sans">Sources:</span>
            {newsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Newspaper className="w-2.5 h-2.5" /> {newsCount} news articles
              </span>
            )}
            {linkedinCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Linkedin className="w-2.5 h-2.5" /> {linkedinCount} LinkedIn posts
              </span>
            )}
            {xCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-full bg-zinc-700/50 text-zinc-300 border border-zinc-600/30">
                <TrendingUp className="w-2.5 h-2.5" /> {xCount} X trends
              </span>
            )}
          </div>
        )}

        {/* States */}
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
                <p className="font-serif text-xl font-black text-white">No Saved Items</p>
                <p className="text-[11px] text-zinc-600 mt-1 font-sans tracking-wide">Save any article or post to bookmark it here.</p>
              </>
            ) : (
              <>
                <Newspaper className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="font-serif text-xl font-black text-white">No Items in Circulation</p>
                <p className="text-[11px] text-zinc-600 mt-1 font-sans tracking-wide">Nothing found matching your filters.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((item, idx) => (
              <FeedCard
                key={item.id}
                item={item}
                idx={idx}
                isSaved={saved.has(item.id)}
                onSave={toggleSave}
                vote={feedback[item.id] ?? null}
                onYes={handleYes}
                onNo={handleNo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
