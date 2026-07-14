import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Bookmark, BookmarkCheck, Search, Linkedin, Newspaper, ThumbsUp, ThumbsDown, MessageSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── API Keys ─────────────────────────────────────────────────────────────────
const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY as string;
const TAVILY_URL = "https://api.tavily.com/search";
const APIFY_TOKEN = import.meta.env.VITE_APIFY_TOKEN as string;
const LINKEDIN_ACTOR_ID = "LQQIXN9Othf8f7R5n";
const BACKEND_URL = (import.meta.env.VITE_API_URL as string) || "";

// ─── Keywords ─────────────────────────────────────────────────────────────────
const KEYWORDS = [
  "Indian Tech", "Indian Food Brands", "Indian Startups",
  "Indian Unicorns", "Shark Tank India", "Make in India",
  "MSME", "Startup India", "Startup Funding India", "Indian Founders",
  "Business & Startup",
];

// ─── LinkedIn Founders ────────────────────────────────────────────────────────
const LINKEDIN_HANDLES = [
  { name: "Namita Thapar", username: "linkedin.com/in/namita-thapar", url: "https://www.linkedin.com/in/namita-thapar" },
  { name: "Anupam Mittal", username: "linkedin.com/in/anupammittal007", url: "https://www.linkedin.com/in/anupammittal007" },
  { name: "Aman Gupta", username: "linkedin.com/in/aman-gupta-7217a515", url: "https://www.linkedin.com/in/aman-gupta-7217a515" },
  { name: "Kunal Shah", username: "linkedin.com/in/kunalshah1", url: "https://www.linkedin.com/in/kunalshah1" },
  { name: "Ghazal Alagh", username: "linkedin.com/in/ghazal-alagh-9755a0128", url: "https://www.linkedin.com/in/ghazal-alagh-9755a0128" },
  { name: "Nikhil Kamath", username: "linkedin.com/in/nikhilkamathcio", url: "https://www.linkedin.com/in/nikhilkamathcio" },
  { name: "Nithin Kamath", username: "linkedin.com/in/nithin-kamath-81136242", url: "https://www.linkedin.com/in/nithin-kamath-81136242" },
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
  type: "news" | "linkedin" | "inshorts";
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

function parseRelativeTime(val: string): string | null {
  const now = Date.now();
  if (/just now|moments? ago/i.test(val)) return new Date(now - 60000).toISOString();
  if (/yesterday/i.test(val)) return new Date(now - 86400000).toISOString();
  const m = val.match(/(\d+)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:ou?r?s?)?|d(?:ay?s?)?|w(?:ee?k?s?)?|mo(?:nth?s?)?|y(?:ea?r?s?)?)/i);
  if (m) {
    const n = parseInt(m[1]);
    const u = m[2].toLowerCase();
    const ms = u.startsWith("mo") ? 2592000000 : u.startsWith("m") ? 60000 :
      u.startsWith("s") ? 1000 : u.startsWith("h") ? 3600000 :
        u.startsWith("d") ? 86400000 : u.startsWith("w") ? 604800000 :
          u.startsWith("y") ? 31536000000 : 0;
    if (ms) return new Date(now - n * ms).toISOString();
  }
  return null;
}

function parseLinkedInDate(item: any): string {
  // 1. Relative fields first — unambiguous about how old the post is
  for (const f of ["timeSincePosted", "relative", "relativeTime", "timeAgo", "postTime", "postedAgo", "postedTime"]) {
    const v = item[f];
    if (v && typeof v === "string") {
      const parsed = parseRelativeTime(v);
      if (parsed) return parsed;
    }
  }

  // 2. Absolute date fields — prefer post-time fields (timestamp/date) over scrape-time fields (createdAt/publishedAt)
  for (const f of ["timestamp", "date", "postedAt", "postedDate", "postDate", "datePosted", "published_at", "dateCreated", "publishedAt", "createdAt", "created_at"]) {
    const v = item[f];
    if (v == null || v === "") continue;
    if (typeof v === "number" && v > 1e9) return new Date(v > 1e12 ? v : v * 1000).toISOString();
    if (typeof v === "string") {
      if (/^\d{10,13}$/.test(v.trim())) {
        const n = Number(v.trim());
        return new Date(n > 1e12 ? n : n * 1000).toISOString();
      }
      if (/\d{4}/.test(v)) {
        const d = new Date(v.replace(" ", "T"));
        if (!isNaN(d.getTime())) return d.toISOString();
        const d2 = new Date(v);
        if (!isNaN(d2.getTime())) return d2.toISOString();
      }
    }
  }

  // 3. Last resort: scan all string fields for relative time patterns
  for (const key of Object.keys(item)) {
    const v = item[key];
    if (typeof v !== "string" || v.length > 120) continue;
    const parsed = parseRelativeTime(v);
    if (parsed) return parsed;
  }

  return "";
}

function getMatchedKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return KEYWORDS.filter((k) => lower.includes(k.toLowerCase())).slice(0, 3);
}

// ─── Topic filters (Tech / Startup / Founder / Political) ─────────────────────
type TopicFilter = "all" | "tech" | "startup" | "founder" | "political";

const TOPIC_FILTERS: { key: TopicFilter; label: string }[] = [
  { key: "all", label: "All Topics" },
  { key: "tech", label: "Tech" },
  { key: "startup", label: "Startup" },
  { key: "founder", label: "Founder" },
  { key: "political", label: "Political" },
];

const TOPIC_KEYWORDS: Record<Exclude<TopicFilter, "all">, string[]> = {
  tech: [
    "tech", "technology", "technolog", "ai ", " ai", "artificial intelligence",
    "software", " app ", "digital", "chip", "semiconductor", "iphone", "android",
    "saas", "cloud", "cyber", "5g", "robot", "machine learning", "openai",
    "google", "microsoft", "apple", "amd", "intel", "nvidia", "smartphone",
    "electric vehicle", " oled", "gaming", "data centre", "data center",
    "infosys", "wipro", "tcs", "hcl", "tech mahindra", "gadget", "laptop",
    "smartwatch", "blockchain", "crypto", "fintech platform",
  ],
  startup: [
    "startup", "start-up", "start up", "unicorn", "decacorn", "series a",
    "series b", "series c", "series d", "funding round", "raised", "venture capital",
    " vc ", "seed round", "pre-seed", "ipo", "valuation", "incubator",
    "accelerator", "y combinator", "shark tank", "d2c", "msme", "startup india",
    "zepto", "zomato", "swiggy", "ola", "cred", "nykaa", "meesho", "blinkit",
    "groww", "zerodha", "razorpay", "freshworks", "boAt", "mamaearth",
  ],
  founder: [
    "founder", "co-founder", "cofounder", " ceo ", "entrepreneur", "industrialist",
    "billionaire", "promoter", "managing director", "mukesh ambani", "ratan tata",
    "gautam adani", "noel tata", "kunal shah", "nikhil kamath", "nithin kamath",
    "namita thapar", "anupam mittal", "aman gupta", "ghazal alagh", "peyush bansal",
    "vineeta singh", "azim premji", "tata sons", "founders", "entrepreneurs",
    "shark tank india", "self-made", "family office",
  ],
  political: [
    "politic", "election", "bjp", "congress party", "modi", "parliament",
    "lok sabha", "rajya sabha", "minister", "government", "govt", "policy",
    "regulation", " rbi ", "budget", "democracy", "campaign", "chief minister",
    "narendra", "rahul gandhi", "nda", "opposition", "diplomat", "sanction",
    "cabinet", "legislat", "bill passed", "protest", "alliance", "coalition",
    "state assembly", "municipal", "bureaucrat",
  ],
};

function matchesTopic(item: FeedItem, topic: TopicFilter): boolean {
  if (topic === "all") return true;

  if (item.type === "inshorts" && item.category) {
    const cat = item.category.toLowerCase();
    if (topic === "tech" && cat === "technology") return true;
    if (topic === "startup" && cat === "startup") return true;
  }

  const text = `${item.title} ${item.body || ""}`.toLowerCase();
  return TOPIC_KEYWORDS[topic].some((kw) => text.includes(kw));
}

function detectPrimaryTopic(item: FeedItem): TopicFilter | null {
  for (const { key } of TOPIC_FILTERS) {
    if (key !== "all" && matchesTopic(item, key)) return key;
  }
  return null;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "Recent";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Fetch: News (from backend → Supabase, never Tavily direct) ──────────────
async function fetchNews(): Promise<FeedItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/news-articles`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((item: any): FeedItem => {
      const text = `${item.title} ${item.summary || ""}`;
      return {
        id: item.url,
        type: "news",
        title: item.title,
        body: item.summary || null,
        url: item.url,
        source: item.source || "News",
        publishedAt: item.published_date || item.created_at || "",
        matchedKeywords: getMatchedKeywords(text),
      };
    });
  } catch { return []; }
}

// ─── Fetch: LinkedIn (via backend — populated by n8n) ────────────────────────
async function fetchLinkedIn(): Promise<FeedItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/linkedin-feed`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((item: any): FeedItem => ({
      id: item.url || item.id,
      type: "linkedin",
      title: item.name || "LinkedIn",
      body: item.body || "",
      url: item.url,
      source: "LinkedIn",
      publishedAt: item.published_at || "",
      matchedKeywords: getMatchedKeywords(item.body || ""),
      authorUrl: item.author_url || "",
      likes: item.likes || 0,
      comments: item.comments || 0,
    }));
  } catch { return []; }
}

// ─── Fetch: Inshorts (live scrape via backend, cached 10 min) ────────────────
async function fetchInshorts(): Promise<FeedItem[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/inshorts-feed`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles ?? []).map((item: any): FeedItem => {
      const text = `${item.title} ${item.content || ""}`;
      return {
        id: item.hash_id || item.id,
        type: "inshorts",
        title: item.title,
        body: item.content || null,
        url: item.source_url || item.url || item.inshorts_url,
        source: item.source_name || "Inshorts",
        publishedAt: item.published_at || "",
        matchedKeywords: getMatchedKeywords(text),
        category: item.category,
      };
    });
  } catch { return []; }
}


// ─── Fetch: All Sources Combined ─────────────────────────────────────────────
async function fetchAllFeed(): Promise<FeedItem[]> {
  const [news, linkedin, inshorts] = await Promise.allSettled([
    fetchNews(),
    fetchLinkedIn(),
    fetchInshorts(),
  ]);

  const all: FeedItem[] = [
    ...(news.status === "fulfilled" ? news.value : []),
    ...(linkedin.status === "fulfilled" ? linkedin.value : []),
    ...(inshorts.status === "fulfilled" ? inshorts.value : []),
  ];

  return all.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });
}

// ─── Saved (Supabase via backend) ────────────────────────────────────────────
async function fetchSaved(): Promise<Map<string, FeedItem>> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/news-feed/saved`);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, FeedItem>();
    for (const row of (data.data ?? [])) {
      const item: FeedItem = row.article_data;
      if (item?.id) map.set(item.id, item);
    }
    return map;
  } catch { return new Map(); }
}

async function addSaved(item: FeedItem) {
  await fetch(`${BACKEND_URL}/api/v1/news-feed/saved`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ article_url: item.url, article_data: item }),
  });
}

async function removeSaved(item: FeedItem) {
  await fetch(`${BACKEND_URL}/api/v1/news-feed/saved/${encodeURIComponent(item.url)}`, { method: "DELETE" });
}

// ─── Feedback / Learning (Supabase via backend) ───────────────────────────────

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

async function fetchFeedback(): Promise<Record<string, Vote>> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/news-feed/feedback`);
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, Vote> = {};
    for (const row of (data.data ?? [])) map[row.article_url] = row.vote;
    return map;
  } catch { return {}; }
}

function loadRules(): Set<ArticleCategory> {
  try { return new Set(JSON.parse(localStorage.getItem("nf-rules") || "[]")); } catch { return new Set(); }
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

function recordNo(url: string, item: FeedItem): ArticleCategory {
  fetch(`${BACKEND_URL}/api/v1/news-feed/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ article_url: url, vote: "no", article_title: item.title, article_type: item.type }),
  });
  const category = detectCategory(item);
  if (category !== "general") {
    const rules = loadRules();
    rules.add(category);
    localStorage.setItem("nf-rules", JSON.stringify([...rules]));
  }
  return category;
}

function recordYes(url: string) {
  fetch(`${BACKEND_URL}/api/v1/news-feed/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ article_url: url, vote: "yes" }),
  });
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
  localStorage.removeItem("nf-rules");
}

// ─── Source Badge ─────────────────────────────────────────────────────────────
function SourceBadge({ item }: { item: FeedItem }) {
  if (item.type === "linkedin") {
    return (
      <span className="news-byline news-byline--linkedin inline-flex items-center gap-1">
        <Linkedin className="w-2.5 h-2.5" />
        LinkedIn
      </span>
    );
  }
  if (item.type === "inshorts") {
    return (
      <span className="news-byline news-byline--inshorts inline-flex items-center gap-1">
        <Zap className="w-2.5 h-2.5" />
        Inshorts{item.source ? ` · ${item.source}` : ""}
      </span>
    );
  }
  return (
    <span className="news-byline news-byline--news">
      {item.source}
    </span>
  );
}

const TOPIC_LABELS: Record<Exclude<TopicFilter, "all">, string> = {
  tech: "Tech",
  startup: "Startup",
  founder: "Founder",
  political: "Political",
};

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
  const isLead = idx === 0;
  const topic = detectPrimaryTopic(item);

  return (
    <article className={cn("news-card", isLead && "news-card--lead", vote === "yes" && "is-yes")}>
      {!isLead && (
        <span className="news-story-no" aria-hidden="true">§{idx + 1}</span>
      )}
      <div className="news-card-inner">
        {topic && (
          <p className="news-kicker">{TOPIC_LABELS[topic]}</p>
        )}

        <div className="news-byline-row">
          <SourceBadge item={item} />
          <span className="news-dateline-sep">|</span>
          <span className="news-dateline">{formatDate(item.publishedAt)}</span>
          {isLead && (
            <>
              <span className="news-dateline-sep">|</span>
              <span className="news-dateline">Lead Story</span>
            </>
          )}
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "news-headline",
              isLead ? "news-headline--lead" : "news-headline--item",
              !isLead && "mb-2",
            )}>
              {item.type === "linkedin" ? (
                <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-2)] transition-colors">
                  {item.title}
                </a>
              ) : item.title}
            </h3>

            {item.body && (
              <p className={cn(
                "news-deck",
                isLead ? "news-deck--lead news-deck--dropcap line-clamp-3" : "line-clamp-4",
              )}>
                {item.body}
              </p>
            )}

            {item.type === "linkedin" && (
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 text-[10px] fglass-meta">
                  <ThumbsUp className="w-3 h-3" />
                  {formatCompact(item.likes || 0)}
                </div>
                <div className="flex items-center gap-1 text-[10px] fglass-meta">
                  <MessageSquare className="w-3 h-3" />
                  {formatCompact(item.comments || 0)}
                </div>
              </div>
            )}

            {topic && (
              <span className={cn("news-section-tag", `news-section-tag--${topic}`)}>
                {TOPIC_LABELS[topic]}
              </span>
            )}

            {item.matchedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.matchedKeywords.map((k) => (
                  <span key={k} className="text-[9px] px-2 py-0.5 rounded-sm bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono uppercase tracking-wide">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={cn(
            "flex flex-col gap-2 items-end shrink-0",
            isLead ? "news-col-rule w-[100px]" : "news-col-rule",
          )}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="news-btn"
            >
              <ExternalLink className="w-3 h-3" />
              {item.type === "linkedin" ? "View Post" : "Read"}
            </a>

            <div className="flex gap-1.5">
              <button
                onClick={() => onYes(item)}
                title="Good content — learn more like this"
                className={cn(
                  "news-btn px-2.5",
                  vote === "yes" && "border-emerald-500/40 text-emerald-300 bg-emerald-500/15",
                )}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => onNo(item)}
                title="Not relevant — hide and learn to block similar"
                className="news-btn px-2.5 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10"
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>

            <button
              onClick={() => onSave(item)}
              className={cn("news-btn news-btn--save", isSaved && "is-saved")}
            >
              {isSaved
                ? <><BookmarkCheck className="w-3 h-3" /> Saved</>
                : <><Bookmark className="w-3 h-3" /> Save</>
              }
            </button>
          </div>
        </div>
      </div>
      {isLead && (
        <div className="news-fold-rule" aria-hidden="true">Also in this edition</div>
      )}
    </article>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type FilterTab = "All" | "News" | "Inshorts" | "LinkedIn" | "Saved";
const FILTER_TABS: FilterTab[] = ["All", "News", "Inshorts", "LinkedIn", "Saved"];

export default function NewsFeed() {
  const [filter, setFilter] = useState<FilterTab>("All");
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<Map<string, FeedItem>>(new Map());
  const [feedback, setFeedback] = useState<Record<string, Vote>>({});
  const [rules, setRules] = useState<Set<ArticleCategory>>(loadRules);

  useEffect(() => {
    fetchSaved().then(setSaved);
    fetchFeedback().then(setFeedback);
  }, []);

  const { data: allItems = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["unified-feed"],
    queryFn: fetchAllFeed,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  function handleScrape() {
    refetch();
  }

  function toggleSave(item: FeedItem) {
    setSaved((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        removeSaved(item);
        toast.success("Removed from saved");
      } else {
        next.set(item.id, item);
        addSaved(item);
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

  const linkedInCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;

  const filtered = baseList.filter((item) => {
    if (filter !== "Saved" && isArticleBlocked(item, feedback, rules)) return false;

    if (item.type === "linkedin" && filter !== "Saved") {
      if (item.publishedAt) {
        const t = new Date(item.publishedAt).getTime();
        if (!isNaN(t) && t < linkedInCutoff) return false;
      }
      // No parseable date → include (assume Apify just fetched it fresh)
    }

    const matchesFilter =
      filter === "All" ||
      filter === "Saved" ||
      (filter === "News" && item.type === "news") ||
      (filter === "Inshorts" && item.type === "inshorts") ||
      (filter === "LinkedIn" && item.type === "linkedin");

    const text = `${item.title} ${item.body || ""}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.toLowerCase());
    const matchesTopicFilter = matchesTopic(item, topicFilter);

    return matchesFilter && matchesSearch && matchesTopicFilter;
  });

  const visibleBase = baseList.filter((item) => {
    if (filter !== "Saved" && isArticleBlocked(item, feedback, rules)) return false;
    if (item.type === "linkedin" && filter !== "Saved") {
      if (item.publishedAt) {
        const t = new Date(item.publishedAt).getTime();
        if (!isNaN(t) && t < linkedInCutoff) return false;
      }
    }
    const matchesFilter =
      filter === "All" ||
      filter === "Saved" ||
      (filter === "News" && item.type === "news") ||
      (filter === "Inshorts" && item.type === "inshorts") ||
      (filter === "LinkedIn" && item.type === "linkedin");
    return matchesFilter;
  });

  const topicCounts = Object.fromEntries(
    TOPIC_FILTERS.filter((t) => t.key !== "all").map(({ key }) => [
      key,
      visibleBase.filter((item) => matchesTopic(item, key)).length,
    ]),
  ) as Record<Exclude<TopicFilter, "all">, number>;

  const noCount = Object.values(feedback).filter((v) => v === "no").length;
  const learnedPatterns = getLearnedPatternCount();

  const newsCount = allItems.filter((i) => i.type === "news" && !isArticleBlocked(i, feedback, rules)).length;
  const inshortsCount = allItems.filter((i) => i.type === "inshorts" && !isArticleBlocked(i, feedback, rules)).length;
  const linkedinCount = allItems.filter((i) => {
    if (i.type !== "linkedin" || isArticleBlocked(i, feedback, rules)) return false;
    if (!i.publishedAt) return true; // unknown date → assume recent
    const t = new Date(i.publishedAt).getTime();
    return isNaN(t) || t >= linkedInCutoff;
  }).length;

  return (
    <div className="news-page overflow-x-hidden">
      <div className="news-page-inner">

        {/* Masthead */}
        <div className="mb-8">
          <div className="news-rule" />
          <div className="news-rule-thin mt-0.5 mb-4" />
          <div className="flex items-end justify-between px-1">
            <div className="text-left pb-1">
              <p className="news-meta leading-relaxed">Est. 2024</p>
              <p className="news-meta">Vol. I</p>
            </div>
            <div className="text-center flex-1 px-4">
              <h1 className="news-masthead-title">NEWS PIECES</h1>
              <p className="news-masthead-ornament" aria-hidden="true">❧</p>
              <p className="news-masthead-tagline">India business intelligence — curated daily</p>
              <p className="news-masthead-sub">News · Inshorts · LinkedIn</p>
            </div>
            <div className="text-right pb-1">
              <p className="news-meta">
                {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <button
                onClick={handleScrape}
                disabled={isFetching}
                className="inline-flex items-center gap-1 news-meta hover:text-[var(--accent-2)] transition-colors disabled:opacity-40 mt-1 ml-auto"
              >
                <RefreshCw className={cn("w-2.5 h-2.5", isFetching && "animate-spin")} />
                {isFetching ? "Scraping…" : "Scrape Feed"}
              </button>
              {(noCount > 0 || learnedPatterns > 0) && (
                <div className="flex items-center gap-2 mt-1 justify-end">
                  <span className="text-[7px] tracking-[0.15em] fglass-meta">
                    {noCount} hidden · {learnedPatterns} patterns learned
                  </span>
                  <button
                    onClick={handleResetLearning}
                    className="text-[7px] tracking-[0.15em] uppercase fglass-meta hover:text-red-400 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="news-rule-thin mt-4 mb-0.5" />
          <div className="news-rule" />
        </div>

        {/* Filter Tabs */}
        <div className="news-tabs">
          <div className="flex items-center flex-wrap">
            {FILTER_TABS.filter((t) => t !== "Saved").map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn("news-tab", filter === tab && "is-on")}
              >
                {tab === "LinkedIn" && <Linkedin className="w-2.5 h-2.5" />}
                {tab === "News" && <Newspaper className="w-2.5 h-2.5" />}
                {tab === "Inshorts" && <Zap className="w-2.5 h-2.5" />}
                {tab}
                {tab === "News" && newsCount > 0 && (
                  <span className="news-tab-count font-mono">({newsCount})</span>
                )}
                {tab === "Inshorts" && inshortsCount > 0 && (
                  <span className="news-tab-count font-mono">({inshortsCount})</span>
                )}
                {tab === "LinkedIn" && linkedinCount > 0 && (
                  <span className="news-tab-count font-mono">({linkedinCount})</span>
                )}
              </button>
            ))}

            <div className="w-px h-4 bg-white/10 mx-2 self-center" />

            <button
              onClick={() => setFilter("Saved")}
              className={cn("news-tab", filter === "Saved" && "is-on-saved")}
            >
              <BookmarkCheck className="w-3 h-3" />
              Saved {saved.size > 0 && `(${saved.size})`}
            </button>

            <div className="ml-auto relative pb-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fglass-meta" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search feed…"
                className="news-search"
              />
            </div>
          </div>
        </div>

        {/* Topic filters */}
        {filter !== "Saved" && (
          <div className="news-filter-bar">
            <span className="news-filter-label shrink-0">Topic:</span>
            {TOPIC_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTopicFilter(key)}
                className={cn("news-pill", topicFilter === key && "is-on")}
              >
                {label}
                {key !== "all" && topicCounts[key as Exclude<TopicFilter, "all">] > 0 && (
                  <span className="news-pill-count font-mono">
                    ({topicCounts[key as Exclude<TopicFilter, "all">]})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Count */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <p className="news-count-line shrink-0">
            {isLoading
              ? "Loading edition…"
              : filter === "Saved"
                ? `${filtered.length} saved item${filtered.length !== 1 ? "s" : ""}`
                : `${filtered.length} item${filtered.length !== 1 ? "s" : ""} in circulation`}
          </p>
          <div className="h-px flex-1 bg-white/[0.08]" />
        </div>

        {/* Source summary pills */}
        {!isLoading && filter === "All" && allItems.length > 0 && (
          <div className="news-filter-bar">
            <span className="news-filter-label">Sources:</span>
            {newsCount > 0 && (
              <span className="news-source-pill is-on">
                <Newspaper className="w-3 h-3" /> {newsCount} news articles
              </span>
            )}
            {inshortsCount > 0 && (
              <span className="news-source-pill news-source-pill--inshorts">
                <Zap className="w-3 h-3" /> {inshortsCount} Inshorts cards
              </span>
            )}
            {linkedinCount > 0 && (
              <span className="news-source-pill news-source-pill--linkedin">
                <Linkedin className="w-3 h-3" /> {linkedinCount} LinkedIn posts
              </span>
            )}
          </div>
        )}

        {/* States */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin fglass-meta" />
            <p className="news-count-line">Fetching the latest edition…</p>
          </div>
        ) : error ? (
          <div className="news-card border-t-red-500/50 p-8 text-center">
            <p className="news-headline news-headline--item mb-1">— Correction —</p>
            <p className="news-deck">{(error as Error).message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="news-card p-12 text-center">
            {filter === "Saved" ? (
              <>
                <BookmarkCheck className="w-8 h-8 fglass-meta mx-auto mb-3" />
                <p className="news-headline news-headline--item">No Saved Items</p>
                <p className="news-deck mt-1">Save any article or post to bookmark it here.</p>
              </>
            ) : (
              <>
                <Newspaper className="w-8 h-8 fglass-meta mx-auto mb-3" />
                <p className="news-headline news-headline--item">No Items in Circulation</p>
                <p className="news-deck mt-1">Nothing found matching your filters.</p>
              </>
            )}
          </div>
        ) : (
          <div className="news-edition-grid">
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
