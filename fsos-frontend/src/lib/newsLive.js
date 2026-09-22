// Live News Feed sources — same pipeline snoboard uses, read straight from Supabase:
//   news_articles  ← Supabase edge function `fetch-news` (RSS: Inc42, TechCrunch, Google News…)
//   linkedin_feed  ← n8n (Apify) posting into the snoboard ingest endpoint
//   news_feed_feedback / news_feed_saved ← votes & bookmarks (shared with snoboard)
// Inshorts has no table; it's scraped live through the dev-server proxy (src/setupProxy.js).
const URL_ = (process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

export const liveNewsConfigured = !!(URL_ && KEY);

const headers = (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra });

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: headers(init.headers), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const SOURCE_LABELS = {
  "inc42.com": "Inc42", "yourstory.com": "YourStory", "entrackr.com": "Entrackr", "moneycontrol.com": "Moneycontrol",
  "economictimes.indiatimes.com": "Economic Times", "firstpost.com": "Firstpost", "business-standard.com": "Business Standard",
  "thehindubusinessline.com": "Hindu BL", "businessinsider.in": "Business Insider", "indianstartupnews.com": "Indian Startup News",
  "fortuneindia.com": "Fortune India", "indiatoday.in": "India Today", "indianexpress.com": "Indian Express",
  "livemint.com": "Mint", "techcrunch.com": "TechCrunch", "aajtak.in": "Aaj Tak",
};
function sourceLabel(url, fallback) {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const hit = Object.keys(SOURCE_LABELS).find((k) => host.includes(k));
    if (hit) return SOURCE_LABELS[hit];
  } catch (e) { /* ignore */ }
  return SOURCE_LABELS[fallback] || fallback || "News";
}

async function fetchNewsArticles() {
  const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const rows = await rest(`news_articles?select=*&created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc`);
  return (rows || []).map((r) => {
    const url = String(r.url || "").trim();
    return {
      id: url || r.id, type: "news", title: r.title, body: r.summary || r.body || null, url,
      source: sourceLabel(url, r.source), publishedAt: r.published_date || r.created_at || "",
    };
  });
}

async function fetchLinkedIn() {
  const cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await rest(`linkedin_feed?select=*&published_at=gte.${cutoff}&order=published_at.desc`);
  return (rows || []).map((r) => ({
    id: r.url || r.id, type: "linkedin", title: r.name || "LinkedIn", body: r.body || "", url: r.url,
    source: r.name || "LinkedIn", publishedAt: r.published_at || "", authorUrl: r.author_url || "",
    likes: r.likes || 0, comments: r.comments || 0,
  }));
}

// Inshorts embeds its feed as `window.__STATE__ = {...}` in the page HTML.
const INSHORTS_CATEGORIES = ["startup", "business", "technology"];
async function fetchInshorts() {
  const seen = new Set();
  const out = [];
  await Promise.allSettled(INSHORTS_CATEGORIES.map(async (category) => {
    const res = await fetch(`/inshorts-proxy/en/read/${category}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/window\.__STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/);
    if (!m) return;
    let state;
    try { state = JSON.parse(m[1]); } catch (e) { return; }
    (state?.news_list?.list || []).forEach((entry) => {
      const o = entry.news_obj || {};
      if (!o.hash_id || !o.title || seen.has(o.hash_id)) return;
      seen.add(o.hash_id);
      const inshortsUrl = o.old_hash_id ? `https://inshorts.com/en/news/${o.old_hash_id}` : (o.shortened_url || "");
      out.push({
        id: o.hash_id, type: "inshorts", title: o.title.trim(), body: (o.content || "").trim() || null,
        url: (o.source_url || "").trim() || inshortsUrl, source: `Inshorts${o.source_name ? ` · ${o.source_name}` : ""}`,
        publishedAt: typeof o.created_at === "number" && o.created_at > 1e12 ? new Date(o.created_at).toISOString() : "",
        category,
      });
    });
  }));
  return out;
}

/** All live sources. Each source fails independently; `status` says which ones answered. */
export async function fetchLiveFeed() {
  const [news, linkedin, inshorts] = await Promise.allSettled([fetchNewsArticles(), fetchLinkedIn(), fetchInshorts()]);
  const ok = (r) => r.status === "fulfilled";
  const items = [news, linkedin, inshorts].filter(ok).flatMap((r) => r.value);
  items.sort((a, b) => (new Date(b.publishedAt).getTime() || 0) - (new Date(a.publishedAt).getTime() || 0));
  return {
    items,
    status: {
      news: ok(news) ? news.value.length : null,
      linkedin: ok(linkedin) ? linkedin.value.length : null,
      inshorts: ok(inshorts) ? inshorts.value.length : null,
    },
  };
}

/** Votes + saved items stored in Supabase (shared with snoboard). */
export async function fetchRemoteState() {
  const [fb, saved] = await Promise.allSettled([
    rest("news_feed_feedback?select=article_url,vote"),
    rest("news_feed_saved?select=article_url,article_data&order=created_at.desc"),
  ]);
  const feedback = {};
  if (fb.status === "fulfilled") (fb.value || []).forEach((r) => { feedback[r.article_url] = r.vote; });
  const savedItems = saved.status === "fulfilled" ? (saved.value || []).map((r) => r.article_data).filter((x) => x?.id) : [];
  return { feedback, savedItems, ok: fb.status === "fulfilled" && saved.status === "fulfilled" };
}

export function pushVote(item, vote) {
  return rest("news_feed_feedback?on_conflict=article_url", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ article_url: item.id, vote, article_title: item.title, article_type: item.type, updated_at: new Date().toISOString() }),
  });
}

export function pushSaved(item, saved) {
  if (!saved) return rest(`news_feed_saved?article_url=eq.${encodeURIComponent(item.id)}`, { method: "DELETE" });
  return rest("news_feed_saved?on_conflict=article_url", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ article_url: item.id, article_data: item }),
  });
}

/** Runs the same `fetch-news` edge function the schedule runs — pulls fresh RSS into news_articles. */
export async function triggerNewsScrape() {
  const res = await fetch(`${URL_}/functions/v1/fetch-news`, { method: "POST", headers: headers(), body: "{}", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`fetch-news: ${res.status}`);
  return res.json();
}
