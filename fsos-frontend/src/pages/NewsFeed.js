import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { useDemo, useAccess } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { canCreateIdea } from "../domain/roles";
import { liveNewsConfigured, fetchLiveFeed, fetchRemoteState, pushVote, pushSaved, triggerNewsScrape } from "../lib/newsLive";
import { cn } from "../lib/utils";
import { toast } from "sonner";

// ─── Keywords & topics (ported from snoboard NewsFeed) ────────────────────────
const KEYWORDS = [
  "Indian Tech", "Indian Food Brands", "Indian Startups", "Indian Unicorns", "Shark Tank India",
  "Make in India", "MSME", "Startup India", "Startup Funding India", "Indian Founders",
];

// Brands that always pass through — "Zepto reports net loss" is relevant,
// "Shree Manufacturing reports net loss" is not.
const KNOWN_BRANDS = [
  "zepto", "zomato", "blinkit", "swiggy", "ola", "paytm", "flipkart", "meesho", "mamaearth", "boat", "cred",
  "zerodha", "groww", "nykaa", "razorpay", "freshworks", "infosys", "wipro", "tcs", "tata", "reliance", "adani",
  "bajaj", "mahindra", "oyo", "myntra", "bigbasket", "lenskart", "dream11", "byju", "unacademy", "physicswallah",
  "ather", "rapido", "honasa", "namita thapar", "anupam mittal", "aman gupta", "kunal shah", "ghazal alagh",
  "nikhil kamath", "nithin kamath", "peyush bansal", "vineeta singh", "mukesh ambani", "ratan tata",
];

const TOPICS = [
  { key: "all", label: "All topics" },
  { key: "tech", label: "Tech" },
  { key: "startup", label: "Startup" },
  { key: "founder", label: "Founder" },
  { key: "political", label: "Political" },
];
const TOPIC_KEYWORDS = {
  tech: ["tech", "technolog", " ai ", " ai", "artificial intelligence", "software", " app ", "digital", "chip", "semiconductor",
    "saas", "cloud", "cyber", "5g", "robot", "gpu", "iphone", "infosys", "wipro", "tcs", "electric vehicle", " ev "],
  startup: ["startup", "start-up", "unicorn", "decacorn", "series a", "series b", "funding", "raised", "raises", "venture",
    "seed", "ipo", "valuation", "shark tank", "d2c", "msme", "startup india", "zepto", "swiggy", "cred", "nykaa", "meesho", "blinkit"],
  founder: ["founder", "co-founder", " ceo ", "entrepreneur", "billionaire", "promoter", "kunal shah", "nikhil kamath",
    "nithin kamath", "namita thapar", "anupam mittal", "aman gupta", "ghazal alagh", "peyush bansal", "shark tank india"],
  political: ["politic", "election", "parliament", "lok sabha", "minister", "government", "govt", "policy", "regulation",
    " rbi ", "rbi", "budget", "cabinet", "bill", "protest", "opposition"],
};
const TOPIC_TONE = {
  tech: "border-sky-200 bg-sky-50 text-sky-800",
  startup: "border-violet-200 bg-violet-50 text-violet-800",
  founder: "border-amber-200 bg-amber-50 text-amber-800",
  political: "border-rose-200 bg-rose-50 text-rose-800",
};

// ─── Learning: one "No" on a recognisable category blocks that whole category ──
const ARTIFACT_MARKERS = ["{{firstname}}", "edit logout", "login / sign up", "login/sign up", "sign up my reads", "my account newsletters", "हिंदी में"];
const CATEGORY_LABELS = {
  "routine-filing": "routine quarterly filings from unknown companies",
  "unknown-company-finance": "financial news from companies you don't cover",
  "scraping-artifact": "articles the scraper couldn't read (paywalls)",
};
const LINKEDIN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const hasKnownBrand = (title) => { const l = title.toLowerCase(); return KNOWN_BRANDS.some((b) => l.includes(b)); };
const isArtifact = (item) => item.type === "news" && !!item.body && ARTIFACT_MARKERS.some((m) => item.body.toLowerCase().includes(m));
const matchedKeywords = (item) => { const l = `${item.title} ${item.body || ""}`.toLowerCase(); return KEYWORDS.filter((k) => l.includes(k.toLowerCase())).slice(0, 3); };

function detectCategory(item) {
  if (isArtifact(item)) return "scraping-artifact";
  if (hasKnownBrand(item.title)) return "general";
  const text = `${item.title} ${item.body || ""}`.toLowerCase();
  const financialResult = (text.includes("standalone") || text.includes("consolidated"))
    && (text.includes("net loss") || text.includes("net profit"))
    && (text.includes("quarter") || /\bq[1-4]\b/.test(text) || text.includes(" fy") || /march|june|september|december/.test(text));
  if (financialResult) return "routine-filing";
  const corporate = / limited\b| ltd\b| pvt\b|industries\b|enterprises\b|corporation\b/.test(text);
  const finance = text.includes("profit") || text.includes("loss") || text.includes("revenue") || (text.includes("crore") && text.includes("report"));
  if (corporate && finance) return "unknown-company-finance";
  return "general";
}

function isBlocked(item, feedback, rules) {
  if (feedback[item.id] === "no") return true;
  if (isArtifact(item)) return true;
  if (hasKnownBrand(item.title)) return false;
  const c = detectCategory(item);
  return c !== "general" && rules.includes(c);
}

function matchesTopic(item, topic) {
  if (topic === "all") return true;
  if (item.type === "inshorts" && item.category) {
    if (topic === "tech" && item.category === "technology") return true;
    if (topic === "startup" && item.category === "startup") return true;
  }
  const text = ` ${item.title} ${item.body || ""} `.toLowerCase();
  return TOPIC_KEYWORDS[topic].some((k) => text.includes(k));
}
const primaryTopic = (item) => TOPICS.find((t) => t.key !== "all" && matchesTopic(item, t.key))?.key || null;
const withinLinkedInWindow = (item) => {
  if (item.type !== "linkedin" || !item.publishedAt) return true;
  const t = new Date(item.publishedAt).getTime();
  return Number.isNaN(t) || t >= Date.now() - LINKEDIN_WINDOW_MS;
};

const fmtCompact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n || 0));
const fmtWhen = (iso) => {
  if (!iso) return "Recent";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const TABS = ["All", "News", "Inshorts", "LinkedIn"];
const TYPE_OF_TAB = { News: "news", Inshorts: "inshorts", LinkedIn: "linkedin" };

export default function NewsFeed() {
  const { db, actions, actingUser } = useDemo();
  const { canEdit } = useAccess();
  const { openCreate } = useUI();
  const editable = canEdit("news");
  const [tab, setTab] = useState("All");
  const [topic, setTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [scraping, setScraping] = useState(false);
  const [live, setLive] = useState({ loading: liveNewsConfigured, items: null, status: null, at: null, error: null });
  const syncWarned = useRef(false);

  const loadLive = useCallback(async () => {
    setLive((l) => ({ ...l, loading: true }));
    try {
      const { items: liveItems, status } = await fetchLiveFeed();
      setLive({ loading: false, items: liveItems, status, at: new Date(), error: null });
    } catch (e) {
      setLive((l) => ({ ...l, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    if (!liveNewsConfigured) return;
    loadLive();
    fetchRemoteState().then((r) => { if (r.ok) actions.mergeNewsRemote(r); }).catch(() => {});
  }, [loadLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live mode once any live source answered with stories; otherwise the seeded demo feed.
  const isLive = !!live.items?.length;
  const { feedback, rules, saved } = db.newsState;
  const items = useMemo(
    () => [...(isLive ? live.items : db.news.items)].sort((a, b) => (new Date(b.publishedAt).getTime() || 0) - (new Date(a.publishedAt).getTime() || 0)),
    [isLive, live.items, db.news.items],
  );
  const syncFailed = () => {
    if (syncWarned.current) return;
    syncWarned.current = true;
    toast.warning("Couldn't sync to Supabase — kept on this device", { description: "The anon key may not have write access to the feedback / saved tables." });
  };
  const visible = useMemo(() => items.filter((i) => !isBlocked(i, feedback, rules) && withinLinkedInWindow(i)), [items, feedback, rules]);
  const counts = {
    news: visible.filter((i) => i.type === "news").length,
    inshorts: visible.filter((i) => i.type === "inshorts").length,
    linkedin: visible.filter((i) => i.type === "linkedin").length,
  };

  const base = tab === "Saved" ? saved.map((id) => items.find((i) => i.id === id) || db.newsState.savedItems?.[id]).filter(Boolean) : visible.filter((i) => tab === "All" || i.type === TYPE_OF_TAB[tab]);
  const topicCounts = Object.fromEntries(TOPICS.filter((t) => t.key !== "all").map((t) => [t.key, base.filter((i) => matchesTopic(i, t.key)).length]));
  const q = search.trim().toLowerCase();
  const filtered = base.filter((i) => (tab === "Saved" || matchesTopic(i, topic)) && (!q || `${i.title} ${i.body || ""}`.toLowerCase().includes(q)));
  const hiddenCount = Object.values(feedback).filter((v) => v === "no").length;

  const scrape = async () => {
    if (isLive || liveNewsConfigured) {
      setScraping(true);
      try {
        const r = await triggerNewsScrape();
        toast.success(r?.inserted ? `Pulled ${r.inserted} stor${r.inserted === 1 ? "y" : "ies"} from RSS` : "No new stories from the RSS sources", { description: "Ran the Supabase fetch-news function." });
      } catch (e) {
        toast.error("Couldn't run fetch-news", { description: `${e.message} — reloading what's already in Supabase.` });
      }
      await loadLive();
      setScraping(false);
      return;
    }
    setScraping(true);
    setTimeout(() => {
      const n = actions.scrapeNews();
      setScraping(false);
      toast(n ? `${n} fresh stor${n === 1 ? "y" : "ies"} pulled in` : "Feed is up to date — no new stories", { description: "Demo mode: stories come from a local queue, not live sources." });
    }, 700);
  };
  const vote = (item, v) => {
    if (isLive) pushVote(item, v).catch(syncFailed);
    if (v === "yes") { actions.voteNews(item.id, "yes"); toast.success("Got it — more like this"); return; }
    const c = detectCategory(item);
    const learn = c !== "general" ? c : null;
    actions.voteNews(item.id, "no", learn);
    toast(learn ? `Hidden + learned — will auto-block ${CATEGORY_LABELS[learn]} from now on` : "Hidden", { icon: "🚫" });
  };
  const toggleSave = (item) => {
    const was = saved.includes(item.id);
    actions.toggleNewsSaved(item.id, item);
    if (isLive) pushSaved(item, !was).catch(syncFailed);
    toast.success(was ? "Removed from saved" : "Saved");
  };
  const toIdea = canCreateIdea(actingUser, "HPN")
    ? (item) => openCreate("HPN", { title: item.title, sourceUrl: item.url })
    : null;

  return (
    <div className="mx-auto max-w-6xl p-6" data-testid="news-page">
      {/* Masthead */}
      <div className="mb-6">
        <div className="h-[3px] bg-stone-900" />
        <div className="mb-4 mt-0.5 h-px bg-stone-900" />
        <div className="flex items-end justify-between px-1">
          <div className="pb-1 font-mono text-[10px] uppercase tracking-[.2em] text-stone-500"><p>Est. 2024</p><p>Vol. I</p></div>
          <div className="flex-1 px-4 text-center">
            <h1 className="font-serif text-4xl tracking-[.08em] text-stone-900 lg:text-5xl">NEWS PIECES</h1>
            <p className="mt-1 text-stone-400" aria-hidden>❧</p>
            <p className="font-serif text-sm italic text-stone-600">India business intelligence — curated daily</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[.25em] text-stone-400">News · Inshorts · LinkedIn</p>
          </div>
          <div className="pb-1 text-right font-mono text-[10px] uppercase tracking-[.15em] text-stone-500">
            <p>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            <button onClick={scrape} disabled={scraping} data-testid="news-scrape" className="ml-auto mt-1 inline-flex items-center gap-1 hover:text-stone-900 disabled:opacity-40">
              <Icons.RefreshCw className={cn("h-2.5 w-2.5", scraping && "animate-spin")} />{scraping ? "Scraping…" : "Scrape feed"}
            </button>
            {(hiddenCount > 0 || rules.length > 0) && (
              <div className="mt-1 flex items-center justify-end gap-2 text-[9px]">
                <span>{hiddenCount} hidden · {rules.length} pattern{rules.length === 1 ? "" : "s"} learned</span>
                {editable && <button onClick={() => { actions.resetNewsLearning(); toast.success("Learning reset — starting fresh"); }} className="hover:text-rose-700" data-testid="news-reset">Reset</button>}
              </div>
            )}
          </div>
        </div>
        <div className="mb-0.5 mt-4 h-px bg-stone-900" />
        <div className="h-[3px] bg-stone-900" />
      </div>

      {/* Source tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-stone-300 pb-2">
        {TABS.map((t) => {
          const n = counts[TYPE_OF_TAB[t]];
          const Icon = { News: Icons.Newspaper, Inshorts: Icons.Zap, LinkedIn: Icons.Linkedin }[t];
          return (
            <button key={t} onClick={() => setTab(t)} data-testid={`news-tab-${t}`}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[.15em] transition-colors",
                tab === t ? "border-b-2 border-stone-900 text-stone-900" : "text-stone-500 hover:text-stone-900")}>
              {Icon && <Icon className="h-3 w-3" />}{t}{n > 0 && <span className="text-stone-400">({n})</span>}
            </button>
          );
        })}
        <span className="mx-2 h-4 w-px bg-stone-300" />
        <button onClick={() => setTab("Saved")} data-testid="news-tab-Saved"
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[.15em]", tab === "Saved" ? "border-b-2 border-amber-700 text-amber-800" : "text-stone-500 hover:text-stone-900")}>
          <Icons.BookmarkCheck className="h-3 w-3" />Saved{saved.length > 0 && <span className="text-stone-400">({saved.length})</span>}
        </button>
        <div className="relative ml-auto">
          <Icons.Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search feed…" data-testid="news-search"
            className="h-8 w-56 rounded-md border border-stone-200 bg-white pl-8 pr-3 text-sm placeholder:text-stone-400 focus:border-stone-400 focus:outline-none" />
        </div>
      </div>

      {tab !== "Saved" && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[.15em] text-stone-400">Topic:</span>
          {TOPICS.map((t) => (
            <button key={t.key} onClick={() => setTopic(t.key)} data-testid={`news-topic-${t.key}`}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", topic === t.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}>
              {t.label}{t.key !== "all" && topicCounts[t.key] > 0 && <span className="ml-1 font-mono text-[10px] opacity-70">({topicCounts[t.key]})</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-stone-200" />
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-stone-500" data-testid="news-count">
          {tab === "Saved" ? `${filtered.length} saved item${filtered.length === 1 ? "" : "s"}` : `${filtered.length} item${filtered.length === 1 ? "" : "s"} in circulation`}
        </p>
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#E6E1D8] bg-white p-12 text-center">
          {tab === "Saved"
            ? (<><Icons.BookmarkCheck className="mx-auto mb-3 h-8 w-8 text-stone-300" /><p className="font-serif text-lg text-stone-800">No saved items</p><p className="mt-1 text-sm text-stone-500">Save any article or post to bookmark it here.</p></>)
            : (<><Icons.Newspaper className="mx-auto mb-3 h-8 w-8 text-stone-300" /><p className="font-serif text-lg text-stone-800">No items in circulation</p><p className="mt-1 text-sm text-stone-500">Nothing matches your filters.</p></>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((item, idx) => (
            <FeedCard key={item.id} item={item} lead={idx === 0} n={idx + 1} vote={feedback[item.id] || null}
              isSaved={saved.includes(item.id)} editable={editable}
              onYes={() => vote(item, "yes")} onNo={() => vote(item, "no")} onSave={() => toggleSave(item)} onIdea={toIdea && (() => toIdea(item))} />
          ))}
        </div>
      )}
      <LiveStatus live={live} isLive={isLive} onReload={loadLive} />
    </div>
  );
}

function LiveStatus({ live, isLive, onReload }) {
  if (!liveNewsConfigured) {
    return <p className="mt-6 text-center text-[11px] text-stone-400">Demo mode — Supabase isn't configured (REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY), so seeded stories are shown.</p>;
  }
  const s = live.status || {};
  const part = (label, n) => <span className={n == null ? "text-rose-600" : n === 0 ? "text-stone-400" : "text-stone-600"}>{label} {n == null ? "unreachable" : n}</span>;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-stone-400" data-testid="news-live-status">
      <span className={cn("inline-flex items-center gap-1.5 font-semibold", isLive ? "text-emerald-700" : "text-amber-700")}>
        <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-emerald-500" : "bg-amber-500")} />
        {live.loading ? "Loading live feed…" : isLive ? "Live from Supabase" : "Live sources returned nothing — showing demo stories"}
      </span>
      {live.status && (<>{part("News", s.news)}·{part("Inshorts", s.inshorts)}·{part("LinkedIn (n8n)", s.linkedin)}</>)}
      {live.at && <span>· updated {live.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
      <button onClick={onReload} className="underline hover:text-stone-700">Reload</button>
    </div>
  );
}

function SourceByline({ item }) {
  if (item.type === "linkedin") return <span className="inline-flex items-center gap-1 font-semibold text-sky-800"><Icons.Linkedin className="h-3 w-3" />LinkedIn</span>;
  if (item.type === "inshorts") return <span className="inline-flex items-center gap-1 font-semibold text-rose-800"><Icons.Zap className="h-3 w-3" />{item.source}</span>;
  return <span className="font-semibold text-stone-800">{item.source}</span>;
}

function FeedCard({ item, lead, n, vote, isSaved, editable, onYes, onNo, onSave, onIdea }) {
  const topic = primaryTopic(item);
  const kws = matchedKeywords(item);
  const btn = "inline-flex items-center justify-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-900";
  return (
    <article className={cn("relative rounded-lg border bg-white p-5", lead ? "border-stone-300 md:col-span-2" : "border-[#E6E1D8]", vote === "yes" && "ring-1 ring-emerald-300")} data-testid={`news-card-${n}`}>
      {!lead && <span className="absolute right-4 top-3 font-serif text-xs italic text-stone-300" aria-hidden>§{n}</span>}
      {topic && <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-stone-400">{TOPICS.find((t) => t.key === topic).label}</p>}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
        <SourceByline item={item} /><span className="text-stone-300">|</span><span>{fmtWhen(item.publishedAt)}</span>
        {lead && <><span className="text-stone-300">|</span><span className="font-mono uppercase tracking-wider">Lead story</span></>}
      </div>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-serif leading-snug text-stone-900", lead ? "text-2xl" : "text-lg")}>
            {item.type === "linkedin" ? <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.title}</a> : item.title}
          </h3>
          {item.body && <p className={cn("mt-1.5 text-sm leading-relaxed text-stone-600", lead ? "line-clamp-3" : "line-clamp-4")}>{item.body}</p>}
          {item.type === "linkedin" && (
            <div className="mt-2 flex items-center gap-4 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1"><Icons.ThumbsUp className="h-3 w-3" />{fmtCompact(item.likes)}</span>
              <span className="inline-flex items-center gap-1"><Icons.MessageSquare className="h-3 w-3" />{fmtCompact(item.comments)}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {topic && <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", TOPIC_TONE[topic])}>{TOPICS.find((t) => t.key === topic).label}</span>}
            {kws.map((k) => <span key={k} className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-stone-500">{k}</span>)}
          </div>
        </div>
        <div className="flex w-[104px] shrink-0 flex-col items-stretch gap-1.5 border-l border-stone-100 pl-3">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={btn}><Icons.ExternalLink className="h-3 w-3" />{item.type === "linkedin" ? "View post" : "Read"}</a>
          {editable && (
            <div className="flex gap-1.5">
              <button onClick={onYes} title="Good content — more like this" data-testid={`news-yes-${n}`} className={cn(btn, "flex-1", vote === "yes" && "border-emerald-300 bg-emerald-50 text-emerald-800")}><Icons.ThumbsUp className="h-3 w-3" /></button>
              <button onClick={onNo} title="Not relevant — hide and learn to block similar" data-testid={`news-no-${n}`} className={cn(btn, "flex-1 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700")}><Icons.ThumbsDown className="h-3 w-3" /></button>
            </div>
          )}
          <button onClick={onSave} data-testid={`news-save-${n}`} className={cn(btn, isSaved && "border-amber-300 bg-amber-50 text-amber-800")}>
            {isSaved ? <><Icons.BookmarkCheck className="h-3 w-3" />Saved</> : <><Icons.Bookmark className="h-3 w-3" />Save</>}
          </button>
          {onIdea && <button onClick={onIdea} title="Start an HPN idea from this story" data-testid={`news-idea-${n}`} className={cn(btn, "border-amber-200 text-amber-800 hover:bg-amber-50")}><Icons.Flame className="h-3 w-3" />HPN idea</button>}
        </div>
      </div>
    </article>
  );
}
