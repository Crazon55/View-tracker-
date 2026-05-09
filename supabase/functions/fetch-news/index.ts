import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RSS_FEEDS = [
  { url: "https://inc42.com/feed/", label: "Inc42" },
  { url: "https://techcrunch.com/feed/", label: "TechCrunch" },
  { url: "https://www.business-standard.com/rss/companies/start-ups.rss", label: "Business Standard" },
  { url: "https://www.moneycontrol.com/rss/business.xml", label: "Moneycontrol" },
  { url: "https://www.newsbytesapp.com/feed", label: "NewsBytesApp" },
  { url: "https://www.fortuneindia.com/feed", label: "Fortune India" },
  { url: "https://news.google.com/rss/search?q=startup+india+funding+rounds&hl=en-IN&gl=IN&ceid=IN:en", label: "Google News" },
  { url: "https://news.google.com/rss/search?q=venture+capital+india&hl=en-IN&gl=IN&ceid=IN:en", label: "Google News" },
  { url: "https://news.google.com/rss/search?q=business+startup+India+funding&hl=en-IN&gl=IN&ceid=IN:en", label: "Google News" },
];

const KEYWORDS = ["startup", "venture capital", "funding", "business"];

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return plain ? plain[1].trim() : "";
}

function cleanHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const articles: any[] = [];
  const sourceStats: Record<string, number> = {};

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, label }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return;
        const xml = await res.text();

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        let count = 0;
        const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
        while ((match = itemRegex.exec(xml)) !== null) {
          const item = match[1];
          const title = cleanHtml(extractTag(item, "title"));
          const link = extractTag(item, "link") || extractTag(item, "guid");
          const desc = cleanHtml(extractTag(item, "description")).slice(0, 400);
          const pubDateRaw = extractTag(item, "pubDate");

          if (!title || !link) continue;

          // Skip articles older than 3 days
          if (pubDateRaw) {
            const pubDate = new Date(pubDateRaw);
            if (!isNaN(pubDate.getTime()) && pubDate.getTime() < cutoff) continue;
          }

          const combined = `${title} ${desc}`.toLowerCase();
          if (!KEYWORDS.some((kw) => combined.includes(kw))) continue;

          articles.push({ title, summary: desc || null, url: link, source: label, keywords: ["auto"] });
          count++;
        }
        sourceStats[label] = (sourceStats[label] || 0) + count;
      } catch {
        // skip failed source
      }
    })
  );

  // Deduplicate by title
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    const key = a.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    return new Response(
      JSON.stringify({ inserted: 0, message: "No matching articles found", sourceStats }),
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  const { error } = await supabase
    .from("news_articles")
    .upsert(unique, { onConflict: "url", ignoreDuplicates: true });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  return new Response(
    JSON.stringify({ inserted: unique.length, sourceStats }),
    { headers: { "Content-Type": "application/json", ...CORS } }
  );
});
