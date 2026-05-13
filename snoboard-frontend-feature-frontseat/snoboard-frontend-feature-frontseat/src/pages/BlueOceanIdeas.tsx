import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Waves, Sparkles, Search, BookOpen, Instagram, ChevronDown, ChevronUp, Trash2, CheckCircle, RotateCcw, ExternalLink, Loader2, AlertCircle, Heart, MessageCircle, Eye, Calendar, Globe } from "lucide-react";
import { toast } from "sonner";

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY as string;

async function tavilySearchArticles(query: string): Promise<TavilyArticle[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: `${query} India`,
      topic: "general",
      max_results: 15,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as TavilyArticle[];
}

const INDIA_SUGGESTED_QUERIES = [
  // How-To
  "how to start a company in India step by step",
  "how to register startup India DPIIT 2025",
  "how to raise angel funding India first time founder",
  "how to build D2C brand India zero investment",
  "how to get into Y Combinator India founder",
  // Top 10 / Top 5
  "top 10 richest Indians how they made money",
  "top 5 Indian startups that failed and why",
  "top 10 Indian business podcasts founders must listen",
  "top 5 books every Indian entrepreneur must read",
  "top 10 Indian unicorns profitable ranked",
  // Wealth & people
  "Mukesh Ambani Reliance empire wealth breakdown",
  "Gautam Adani rise from scratch billion dollar",
  "Byju's collapse what went wrong inside story",
  "Zerodha Nithin Kamath bootstrapped profitable",
  "Narayana Murthy Infosys ₹10000 to billion story",
  "Dhirubhai Ambani rags to riches Reliance origin",
  "OYO Ritesh Agarwal rise and fall story",
  "Tata Group history succession Ratan Tata",
];
import {
  blueOceanGenerateArticles,
  blueOceanGenerateInstagram,
  getBlueOceanIdeas,
  createBlueOceanIdea,
  updateBlueOceanIdea,
  deleteBlueOceanIdea,
  blueOceanScrape,
  getBlueOceanScrapeJobs,
  getBlueOceanScrapedPosts,
  updateBlueOceanScrapedPost,
  deleteBlueOceanScrapedPost,
} from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ArticleIdea = {
  headline: string;
  format_type: string;
  why_evergreen: string;
  outline: string[];
};

type InstagramIdea = {
  hook_text: string;
  format: "carousel" | "static";
  hook_formula: string;
  slide_preview: string[];
  why_evergreen: string;
};

type SavedIdea = {
  id: string;
  type: "article" | "instagram";
  source: string;
  headline_or_hook: string;
  format_tag: string | null;
  why_evergreen: string | null;
  outline_or_slides: any;
  hook_formula: string | null;
  status: "saved" | "used" | "archived";
  source_account: string | null;
  engagement_data: any;
  created_at: string;
};

type ScrapedPost = {
  id: string;
  job_id: string;
  account_handle: string;
  url: string;
  caption: string;
  thumbnail_url: string;
  post_type: "carousel" | "static" | "reel";
  likes: number;
  comments: number;
  views: number;
  posted_at: string;
  is_blue_ocean: boolean;
};

type TavilyArticle = {
  title: string;
  url: string;
  content: string;
  score: number;
};

// ─── Utility ─────────────────────────────────────────────────────────────────

const FORMAT_COLORS: Record<string, string> = {
  "Listicle": "bg-blue-500/20 text-blue-300",
  "Case Study": "bg-amber-500/20 text-amber-300",
  "Comparison": "bg-purple-500/20 text-purple-300",
  "How-To": "bg-green-500/20 text-green-300",
  "Explainer": "bg-cyan-500/20 text-cyan-300",
  "carousel": "bg-violet-500/20 text-violet-300",
  "static": "bg-pink-500/20 text-pink-300",
};

function FormatBadge({ label }: { label: string }) {
  const cls = FORMAT_COLORS[label] || "bg-zinc-700 text-zinc-300";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Generate Form (shared) ───────────────────────────────────────────────────

function GenerateForm({
  onGenerate,
  loading,
  placeholder,
}: {
  onGenerate: (niche: string) => void;
  loading: boolean;
  placeholder: string;
}) {
  const [niche, setNiche] = useState("");
  return (
    <div className="flex gap-3 items-center">
      <input
        value={niche}
        onChange={(e) => setNiche(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !loading && onGenerate(niche)}
        placeholder={placeholder}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
      />
      <button
        onClick={() => onGenerate(niche)}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "Generating…" : "Generate Ideas"}
      </button>
    </div>
  );
}

// ─── Article Idea Card ────────────────────────────────────────────────────────

function ArticleIdeaCard({ idea, onSave }: { idea: ArticleIdea; onSave: (idea: ArticleIdea) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FormatBadge label={idea.format_type} />
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{idea.headline}</p>
        </div>
        <button
          onClick={() => onSave(idea)}
          className="shrink-0 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-zinc-400 italic">{idea.why_evergreen}</p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide outline" : "View outline"}
      </button>
      {expanded && (
        <ul className="space-y-1 pl-3 border-l border-zinc-700">
          {(idea.outline || []).map((point, i) => (
            <li key={i} className="text-xs text-zinc-400 leading-relaxed">{point}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Instagram Idea Card ──────────────────────────────────────────────────────

function InstagramIdeaCard({ idea, onSave }: { idea: InstagramIdea; onSave: (idea: InstagramIdea) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <FormatBadge label={idea.format} />
            <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded-full font-medium">{idea.hook_formula}</span>
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{idea.hook_text}</p>
        </div>
        <button
          onClick={() => onSave(idea)}
          className="shrink-0 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-zinc-400 italic">{idea.why_evergreen}</p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide slides" : "View slide preview"}
      </button>
      {expanded && (
        <ol className="space-y-1 pl-3 border-l border-zinc-700">
          {(idea.slide_preview || []).map((slide, i) => (
            <li key={i} className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-600 mr-1.5">#{i + 1}</span>{slide}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Saved Idea Row ───────────────────────────────────────────────────────────

function SavedIdeaRow({ idea, onStatusChange, onDelete }: {
  idea: SavedIdea;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const outline = Array.isArray(idea.outline_or_slides) ? idea.outline_or_slides : [];

  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${idea.status === "used" ? "border-green-800/50 bg-green-950/10" : "border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {idea.format_tag && <FormatBadge label={idea.format_tag} />}
            {idea.hook_formula && (
              <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded-full">{idea.hook_formula}</span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              idea.status === "used" ? "bg-green-500/20 text-green-400" :
              idea.status === "archived" ? "bg-zinc-700 text-zinc-500" :
              "bg-blue-500/20 text-blue-400"
            }`}>
              {idea.status}
            </span>
          </div>
          <p className="text-sm font-medium text-white leading-snug">{idea.headline_or_hook}</p>
          {idea.why_evergreen && (
            <p className="text-xs text-zinc-500 mt-1 italic">{idea.why_evergreen}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {idea.status !== "used" && (
            <button
              onClick={() => onStatusChange(idea.id, "used")}
              title="Mark as used"
              className="p-1.5 rounded-lg hover:bg-green-900/30 text-zinc-500 hover:text-green-400 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          {idea.status === "used" && (
            <button
              onClick={() => onStatusChange(idea.id, "saved")}
              title="Mark as saved"
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-green-500 hover:text-zinc-400 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(idea.id)}
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {outline.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : `${outline.length} points`}
          </button>
          {expanded && (
            <ol className="mt-2 space-y-1 pl-3 border-l border-zinc-700">
              {outline.map((pt: string, i: number) => (
                <li key={i} className="text-xs text-zinc-400">{pt}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tavily Article Card ──────────────────────────────────────────────────────

function TavilyArticleCard({ article, onSave }: { article: TavilyArticle; onSave: (a: TavilyArticle) => void }) {
  const [expanded, setExpanded] = useState(false);
  const host = (() => { try { return new URL(article.url).hostname.replace("www.", ""); } catch { return ""; } })();
  const short = article.content?.slice(0, 150);
  const hasMore = article.content?.length > 150;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {host && <p className="text-[10px] text-zinc-500 mb-1">{host}</p>}
          <p className="text-sm font-semibold text-white leading-snug">{article.title}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => onSave(article)}
            className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
      {article.content && (
        <p className="text-xs text-zinc-400 leading-relaxed">
          {expanded ? article.content : short}
          {hasMore && !expanded && "…"}
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)} className="ml-1 text-zinc-600 hover:text-zinc-300">
              {expanded ? "less" : "more"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Tavily Article Scrape Section ────────────────────────────────────────────

function TavilyArticleScrapeSection({ savedIdeas, saveMut, statusMut, deleteMut }: {
  savedIdeas: SavedIdea[];
  saveMut: any;
  statusMut: any;
  deleteMut: any;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TavilyArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    if (q) setQuery(q);
    setLoading(true);
    setError("");
    try {
      const data = await tavilySearchArticles(searchQuery);
      setResults(data);
      toast.success(`Found ${data.length} articles`);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      toast.error(e?.message || "Tavily search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Scrape from Web (Tavily)</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Search for existing evergreen articles about Indian wealth, founders, and business stories</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && runSearch()}
            placeholder="e.g. Ambani wealth story, Byju's collapse, Zerodha bootstrapped"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {loading ? "Searching…" : "Search Web"}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}
        {/* Suggested India queries */}
        <div className="mt-3">
          <p className="text-[10px] text-zinc-600 mb-2 uppercase tracking-wider">Quick searches</p>
          <div className="flex flex-wrap gap-1.5">
            {INDIA_SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => runSearch(q)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-white rounded-lg transition-colors disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {results.map((article, i) => (
            <TavilyArticleCard
              key={i}
              article={article}
              onSave={(a) => saveMut.mutate({
                headline: a.title,
                format_type: "Scrape",
                why_evergreen: a.content?.slice(0, 200) || "",
                outline: [a.url],
              })}
            />
          ))}
        </div>
      )}

      {/* Saved bank inline */}
      <SavedArticlesBank savedIdeas={savedIdeas} statusMut={statusMut} deleteMut={deleteMut} />
    </div>
  );
}

// ─── Saved Articles Bank (extracted for reuse) ────────────────────────────────

function SavedArticlesBank({ savedIdeas, statusMut, deleteMut }: {
  savedIdeas: SavedIdea[];
  statusMut: any;
  deleteMut: any;
}) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");

  const allFormats = [...new Set(savedIdeas.map((i) => i.format_tag).filter(Boolean))] as string[];
  const filtered = savedIdeas.filter((idea) => {
    if (filterStatus !== "all" && idea.status !== filterStatus) return false;
    if (filterFormat !== "all" && idea.format_tag !== filterFormat) return false;
    return true;
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-violet-400" />
          Saved Article Ideas
          {savedIdeas.length > 0 && (
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{savedIdeas.length}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">All status</option>
            <option value="saved">Saved</option>
            <option value="used">Used</option>
            <option value="archived">Archived</option>
          </select>
          {allFormats.length > 0 && (
            <select value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none">
              <option value="all">All formats</option>
              {allFormats.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 text-sm">
          {savedIdeas.length === 0 ? "No saved articles yet." : "No ideas match the current filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((idea) => (
            <SavedIdeaRow
              key={idea.id}
              idea={idea}
              onStatusChange={(id, status) => statusMut.mutate({ id, status })}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Articles Tab ─────────────────────────────────────────────────────────────

function ArticlesTab() {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"generate" | "scrape">("generate");
  const [generatedIdeas, setGeneratedIdeas] = useState<ArticleIdea[]>([]);

  const { data: savedIdeas = [], isLoading: loadingSaved } = useQuery<SavedIdea[]>({
    queryKey: ["blue-ocean-ideas", "article"],
    queryFn: () => getBlueOceanIdeas({ type: "article" }),
  });

  const saveMut = useMutation({
    mutationFn: (idea: ArticleIdea) => createBlueOceanIdea({
      type: "article",
      source: subTab === "scrape" ? "apify_scraped" : "ai_generated",
      headline_or_hook: idea.headline,
      format_tag: idea.format_type,
      why_evergreen: idea.why_evergreen,
      outline_or_slides: idea.outline,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "article"] });
      toast.success("Saved to bank");
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const generateMut = useMutation({
    mutationFn: (niche: string) => blueOceanGenerateArticles({ niche }),
    onSuccess: (data) => {
      setGeneratedIdeas(data);
      toast.success(`Generated ${data.length} article ideas`);
    },
    onError: (e: any) => toast.error(e?.message || "Generation failed"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateBlueOceanIdea(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "article"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBlueOceanIdea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "article"] });
      toast.success("Deleted");
    },
  });

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(["generate", "scrape"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subTab === t ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "generate" ? <><Sparkles className="w-3.5 h-3.5" />Generate Ideas (AI)</> : <><Globe className="w-3.5 h-3.5" />Scrape from Web</>}
          </button>
        ))}
      </div>

      {subTab === "generate" ? (
        <div className="space-y-8">
          <section>
            <div className="mb-4">
              <p className="text-xs text-zinc-500">Enter an optional niche/topic, or leave blank for general ideas</p>
            </div>
            <GenerateForm
              onGenerate={(niche) => generateMut.mutate(niche)}
              loading={generateMut.isPending}
              placeholder="e.g. how to start a startup India, top 10 richest Indians, Byju's collapse, Ambani empire"
            />
            {generateMut.isError && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />{(generateMut.error as any)?.message || "Generation failed"}
              </div>
            )}
            {generatedIdeas.length > 0 && (
              <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
                {generatedIdeas.map((idea, i) => (
                  <ArticleIdeaCard key={i} idea={idea} onSave={(idea) => saveMut.mutate(idea)} />
                ))}
              </div>
            )}
          </section>
          {loadingSaved ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : (
            <SavedArticlesBank savedIdeas={savedIdeas} statusMut={statusMut} deleteMut={deleteMut} />
          )}
        </div>
      ) : (
        <TavilyArticleScrapeSection
          savedIdeas={savedIdeas}
          saveMut={saveMut}
          statusMut={statusMut}
          deleteMut={deleteMut}
        />
      )}
    </div>
  );
}

// ─── Instagram Generate Section ───────────────────────────────────────────────

function InstagramGenerateSection() {
  const qc = useQueryClient();
  const [generatedIdeas, setGeneratedIdeas] = useState<InstagramIdea[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");

  const { data: savedIdeas = [], isLoading: loadingSaved } = useQuery<SavedIdea[]>({
    queryKey: ["blue-ocean-ideas", "instagram"],
    queryFn: () => getBlueOceanIdeas({ type: "instagram" }),
  });

  const generateMut = useMutation({
    mutationFn: (niche: string) => blueOceanGenerateInstagram({ niche }),
    onSuccess: (data) => {
      setGeneratedIdeas(data);
      toast.success(`Generated ${data.length} Instagram ideas`);
    },
    onError: (e: any) => toast.error(e?.message || "Generation failed"),
  });

  const saveMut = useMutation({
    mutationFn: (idea: InstagramIdea) => createBlueOceanIdea({
      type: "instagram",
      source: "ai_generated",
      headline_or_hook: idea.hook_text,
      format_tag: idea.format,
      why_evergreen: idea.why_evergreen,
      outline_or_slides: idea.slide_preview,
      hook_formula: idea.hook_formula,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "instagram"] });
      toast.success("Saved to bank");
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateBlueOceanIdea(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "instagram"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBlueOceanIdea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "instagram"] });
      toast.success("Deleted");
    },
  });

  const filteredSaved = savedIdeas.filter((idea) => {
    if (filterStatus !== "all" && idea.status !== filterStatus) return false;
    if (filterFormat !== "all" && idea.format_tag !== filterFormat) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Generate */}
      <section>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Generate Ideas (AI)</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Enter an optional niche/topic, or leave blank</p>
        </div>
        <GenerateForm
          onGenerate={(niche) => generateMut.mutate(niche)}
          loading={generateMut.isPending}
          placeholder="e.g. how to start company India, top 5 Indian unicorns, Adani story, Byju's fall"
        />
        {generateMut.isError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {(generateMut.error as any)?.message || "Generation failed"}
          </div>
        )}
        {generatedIdeas.length > 0 && (
          <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
            {generatedIdeas.map((idea, i) => (
              <InstagramIdeaCard
                key={i}
                idea={idea}
                onSave={(idea) => saveMut.mutate(idea)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Saved Bank */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-400" />
            Instagram Blue Ocean Bank
            {savedIdeas.length > 0 && (
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{savedIdeas.length}</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All status</option>
              <option value="saved">Saved</option>
              <option value="used">Used</option>
            </select>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All formats</option>
              <option value="carousel">Carousel</option>
              <option value="static">Static</option>
            </select>
          </div>
        </div>
        {loadingSaved ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : filteredSaved.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 text-sm">
            {savedIdeas.length === 0
              ? "No saved Instagram ideas yet. Generate some above and hit Save."
              : "No ideas match the current filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filteredSaved.map((idea) => (
              <SavedIdeaRow
                key={idea.id}
                idea={idea}
                onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Scraped Post Card ────────────────────────────────────────────────────────

function ScrapedPostCard({ post, onMarkBlueOcean, onDelete, onSaveToBank }: {
  post: ScrapedPost;
  onMarkBlueOcean: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  onSaveToBank: (post: ScrapedPost) => void;
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const shortCaption = post.caption?.slice(0, 120);
  const hasMore = post.caption?.length > 120;

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${post.is_blue_ocean ? "border-violet-700/60" : "border-zinc-800"}`}>
      {post.thumbnail_url && (
        <div className="h-36 bg-zinc-800 overflow-hidden">
          <img
            src={post.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">@{post.account_handle}</span>
            <FormatBadge label={post.post_type} />
            {post.is_blue_ocean && (
              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-semibold">Blue Ocean</span>
            )}
          </div>
          {post.url && (
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {post.caption && (
          <p className="text-xs text-zinc-400 leading-relaxed">
            {captionExpanded ? post.caption : shortCaption}
            {hasMore && !captionExpanded && "…"}
            {hasMore && (
              <button
                onClick={() => setCaptionExpanded(!captionExpanded)}
                className="ml-1 text-zinc-600 hover:text-zinc-300"
              >
                {captionExpanded ? "less" : "more"}
              </button>
            )}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmtNum(post.likes)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmtNum(post.comments)}</span>
          {post.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(post.views)}</span>}
          {post.posted_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{post.posted_at}</span>}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onMarkBlueOcean(post.id, !post.is_blue_ocean)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              post.is_blue_ocean
                ? "bg-violet-500/20 text-violet-300 hover:bg-violet-500/10"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            }`}
          >
            {post.is_blue_ocean ? "✓ Blue Ocean" : "Mark Blue Ocean"}
          </button>
          {post.is_blue_ocean && (
            <button
              onClick={() => onSaveToBank(post)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 transition-colors"
            >
              Save to Bank
            </button>
          )}
          <button
            onClick={() => onDelete(post.id)}
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Scrape Competitors Section ───────────────────────────────────────────────

function ScrapeCompetitorsSection() {
  const qc = useQueryClient();

  // Form state
  const [accountsText, setAccountsText] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [postTypeFilter, setPostTypeFilter] = useState("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("likes");
  const [viewFilter, setViewFilter] = useState("all");

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ["blue-ocean-scrape-jobs"],
    queryFn: getBlueOceanScrapeJobs,
    refetchInterval: 10_000,
  });

  const postsQuery = useQuery<ScrapedPost[]>({
    queryKey: ["blue-ocean-scraped-posts", selectedJobId, postTypeFilter, viewFilter, sortBy],
    queryFn: () => getBlueOceanScrapedPosts({
      job_id: selectedJobId || undefined,
      post_type: postTypeFilter !== "all" ? postTypeFilter : undefined,
      is_blue_ocean: viewFilter === "blue_ocean" ? true : undefined,
      sort: sortBy,
    }),
    enabled: true,
  });

  const scrapeMut = useMutation({
    mutationFn: () => {
      const accounts = accountsText.split("\n").map((a) => a.trim().replace(/^@/, "")).filter(Boolean);
      return blueOceanScrape({ accounts, date_from: dateFrom, date_to: dateTo, post_type: postTypeFilter });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-scrape-jobs"] });
      qc.invalidateQueries({ queryKey: ["blue-ocean-scraped-posts"] });
      toast.success(`Scrape complete — ${data.posts_found} posts found`);
      setSelectedJobId(data.job_id);
    },
    onError: (e: any) => toast.error(e?.message || "Scrape failed"),
  });

  const markMut = useMutation({
    mutationFn: ({ id, val }: { id: string; val: boolean }) => updateBlueOceanScrapedPost(id, { is_blue_ocean: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blue-ocean-scraped-posts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBlueOceanScrapedPost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blue-ocean-scraped-posts"] }),
  });

  const saveToBankMut = useMutation({
    mutationFn: (post: ScrapedPost) => createBlueOceanIdea({
      type: "instagram",
      source: "apify_scraped",
      headline_or_hook: post.caption?.split("\n")[0]?.slice(0, 200) || `Post by @${post.account_handle}`,
      format_tag: post.post_type,
      source_account: post.account_handle,
      engagement_data: { likes: post.likes, comments: post.comments, views: post.views, url: post.url },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blue-ocean-ideas", "instagram"] });
      toast.success("Saved to Instagram Blue Ocean Bank");
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const blueOceanCount = (postsQuery.data || []).filter((p) => p.is_blue_ocean).length;

  return (
    <div className="space-y-8">
      {/* Scrape Form */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Scrape from Competitors (Apify)</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-xs text-zinc-400 mb-1.5">Instagram accounts to scrape</label>
            <textarea
              value={accountsText}
              onChange={(e) => setAccountsText(e.target.value)}
              placeholder={"@zerodhaonline\n@financewithsharan\n@thefinancestory"}
              rows={5}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1">One handle per line, @ optional</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">To date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Post type</label>
              <select
                value={postTypeFilter}
                onChange={(e) => setPostTypeFilter(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"
              >
                <option value="all">All</option>
                <option value="carousels">Carousels only</option>
                <option value="statics">Statics only</option>
              </select>
            </div>
            <button
              onClick={() => scrapeMut.mutate()}
              disabled={scrapeMut.isPending || !accountsText.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {scrapeMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Scraping…</>
              ) : (
                <><Search className="w-4 h-4" /> Run Scrape</>
              )}
            </button>
          </div>
        </div>

        {scrapeMut.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {(scrapeMut.error as any)?.message || "Scrape failed"}
          </div>
        )}

        {/* Past Jobs */}
        {jobs.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2">Past scrape jobs</p>
            <div className="flex flex-wrap gap-2">
              {jobs.slice(0, 8).map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    selectedJobId === job.id
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                  }`}
                >
                  {(job.accounts || []).slice(0, 2).map((a: string) => `@${a}`).join(", ")}
                  {(job.accounts || []).length > 2 && ` +${job.accounts.length - 2}`}
                  {" · "}
                  <span className={job.status === "done" ? "text-green-400" : job.status === "failed" ? "text-red-400" : "text-amber-400"}>
                    {job.status === "done" ? `${job.posts_found} posts` : job.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Results */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">
            Scraped Posts
            {postsQuery.data && (
              <span className="ml-2 text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                {postsQuery.data.length} posts
                {blueOceanCount > 0 && ` · ${blueOceanCount} blue ocean`}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All posts</option>
              <option value="blue_ocean">Blue Ocean only</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="likes">Most liked</option>
              <option value="comments">Most commented</option>
              <option value="views">Most viewed</option>
              <option value="posted_at">Most recent</option>
            </select>
          </div>
        </div>

        {postsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : !postsQuery.data?.length ? (
          <div className="text-center py-16 text-zinc-600 text-sm">
            No scraped posts yet. Run a scrape above to pull competitor content.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {postsQuery.data.map((post) => (
              <ScrapedPostCard
                key={post.id}
                post={post}
                onMarkBlueOcean={(id, val) => markMut.mutate({ id, val })}
                onDelete={(id) => deleteMut.mutate(id)}
                onSaveToBank={(p) => saveToBankMut.mutate(p)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Instagram Tab ────────────────────────────────────────────────────────────

function InstagramTab() {
  const [subTab, setSubTab] = useState<"generate" | "scrape">("generate");

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(["generate", "scrape"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              subTab === t
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "generate" ? "Generate Ideas (AI)" : "Scrape from Competitors"}
          </button>
        ))}
      </div>
      {subTab === "generate" ? <InstagramGenerateSection /> : <ScrapeCompetitorsSection />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlueOceanIdeas() {
  const [tab, setTab] = useState<"articles" | "instagram">("articles");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="px-8 pt-20 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Waves className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Blue Ocean Ideas</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">
          India-focused evergreen content — How-To guides, Top 10 lists, wealth stories, billionaire journeys, startup rise &amp; fall, business dynasties. Works any time, forever.
        </p>

        {/* Top-level tabs */}
        <div className="flex gap-1 mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("articles")}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === "articles"
                ? "bg-violet-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Articles
          </button>
          <button
            onClick={() => setTab("instagram")}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === "instagram"
                ? "bg-violet-600 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Instagram className="w-3.5 h-3.5" />
            Instagram Posts
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        {tab === "articles" ? <ArticlesTab /> : <InstagramTab />}
      </div>
    </div>
  );
}
