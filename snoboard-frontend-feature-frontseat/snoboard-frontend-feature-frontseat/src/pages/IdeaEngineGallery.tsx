// Idea Engine — centralized gallery of ideas across ALL playbooks (Bizz / XF / Tech).
// Content Strategists land here. Ideas are shown flat (not grouped by playbook): each
// card surfaces who made it, total views, and which pages it was already posted on
// (so the same idea isn't re-posted), plus a button to open it in its playbook.
// Date-driven — always lands on today; yesterday is one click away. No "All" firehose.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ExternalLink, Eye, Search, X, Check, CalendarDays, Trophy, Heart, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIdeaBankRealtime } from "@/hooks/useIdeaBankRealtime";
import { canonicalRole } from "@/lib/accessModel";
import { createExpApi, type ExpApi } from "@/services/api";
import {
  CAROUSEL_FORMATS,
  PLAYBOOK_CONFIGS,
  REEL_VIDEO_FORMATS,
  type PlaybookId,
} from "@/lib/playbookExperimentConfig";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PLAYBOOKS: PlaybookId[] = ["bpb", "xf", "tech"];
const PB_SHORT: Record<PlaybookId, string> = { bpb: "Bizz", xf: "XF", tech: "Tech" };
const PB_ACCENT: Record<PlaybookId, string> = { bpb: "#a78bfa", xf: "#f472b6", tech: "#38bdf8" };

// One ExpApi per playbook, memoised at module load (they're just closures over a base URL).
const PB_API: Record<PlaybookId, ExpApi> = {
  bpb: createExpApi("bpb"),
  xf: createExpApi("xf"),
  tech: createExpApi("tech"),
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd(): string {
  return ymd(new Date());
}
const TODAY = todayYmd();
const YESTERDAY = ymd(new Date(Date.now() - 86400000));
const TOMORROW = ymd(new Date(Date.now() + 86400000));
const ENGINE_REVIEWER_EMAILS = new Set([
  "jaskaran.sethi@owledmedia.com",
  "om.verma@owledmedia.com",
]);

function sumViews(idea: any): number {
  const pv = idea.page_views as Record<string, number> | undefined;
  if (pv && Object.keys(pv).length) return Object.values(pv).reduce((a, b) => a + (Number(b) || 0), 0);
  return Number(idea.views) || 0;
}
function sumLikes(idea: any): number {
  const pl = idea.page_likes as Record<string, number> | undefined;
  if (pl && Object.keys(pl).length) return Object.values(pl).reduce((a, b) => a + (Number(b) || 0), 0);
  return Number(idea.likes) || 0;
}
function isCarousel(idea: any): boolean {
  return String(idea.content_type || "").trim().toLowerCase() === "carousel";
}
function isStatic(idea: any): boolean {
  return String(idea.content_type || "").trim().toLowerCase() === "static";
}
function contentKind(idea: any): "reel" | "carousel" | "static" {
  if (isCarousel(idea)) return "carousel";
  if (isStatic(idea)) return "static";
  return "reel";
}
// Statics are judged the same way as carousels — likes, not views.
function usesLikesMetric(idea: any): boolean {
  return isCarousel(idea) || isStatic(idea);
}
const KIND_LABEL: Record<"reel" | "carousel" | "static", string> = { reel: "Reel", carousel: "Carousel", static: "Static" };
const KIND_ACCENT: Record<"reel" | "carousel" | "static", string> = { reel: "#93c5fd", carousel: "#f9a8d4", static: "#F0C060" };
function matchesKindFilter(idea: any, kinds: { reel: boolean; carousel: boolean; static: boolean }): boolean {
  if (!kinds.reel && !kinds.carousel && !kinds.static) return true;
  return kinds[contentKind(idea)];
}
function pagesOf(idea: any): string[] {
  return String(idea.page_handle || "").split(",").map((s) => s.trim()).filter(Boolean);
}

type PageHook = { page: string; hook: string };

function parsePageHooks(raw: unknown): PageHook[] {
  if (Array.isArray(raw)) {
    const rows = raw.map((x) => {
      if (typeof x === "string") return { page: "", hook: x };
      if (x && typeof x === "object") {
        const o = x as { page?: unknown; hook?: unknown };
        return { page: String(o.page || "").trim(), hook: String(o.hook || "") };
      }
      return { page: "", hook: "" };
    }).filter((r) => r.hook.trim() || r.page);
    return rows.length ? rows : [{ page: "", hook: "" }];
  }
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return [{ page: "", hook: "" }];
  if (s.startsWith("[") || s.startsWith("{")) {
    try {
      return parsePageHooks(JSON.parse(s));
    } catch {
      /* legacy plain hook */
    }
  }
  return [{ page: "", hook: s }];
}

function serializePageHooks(rows: PageHook[]): string {
  const clean = rows.filter((r) => r.hook.trim() || r.page);
  if (!clean.length) return "";
  if (clean.length === 1 && !clean[0].page) return clean[0].hook.trim();
  return JSON.stringify(clean.map((r) => ({ page: r.page, hook: r.hook.trim() })));
}

function pageHooksForDisplay(raw: unknown): PageHook[] {
  return parsePageHooks(raw).filter((r) => r.hook.trim());
}

function assignedPageHooks(raw: unknown): PageHook[] {
  return parsePageHooks(raw).filter((r) => r.hook.trim() && r.page);
}

function pageHookMissingPage(rows: PageHook[]): boolean {
  return rows.some((r) => r.hook.trim() && !r.page);
}

function shortPage(pb: PlaybookId, page: string): string {
  return PLAYBOOK_CONFIGS[pb]?.pageShort?.[page] || page;
}

function copyBoardDay(idea: any): string {
  const d = String(idea?.day_date || "").slice(0, 10);
  if (d && d > todayYmd()) return d;
  return todayYmd();
}

async function distributeApprovedIdea(idea: any, engineRows: any[], copies: any[]): Promise<{ pages: string[] }> {
  const ids: string[] = idea._ids?.length ? idea._ids : [idea.id];
  const pb = idea._playbook as PlaybookId;
  const api = PB_API[pb];
  // Skip CD page-copies and Ideas Pool clones minted by "Send" — keep the engine row.
  const sources = engineRows.filter((r) => ids.includes(r.id) && !r.source_pool_id && !(r.frontseat_pool && r.origin_idea_id));
  const rows = sources.length ? sources : [{ ...idea }];
  const sentPages: string[] = [];

  for (const row of rows) {
    const hooks = assignedPageHooks(row.hook_variations);
    if (!hooks.length) continue;

    const originId = String(row.origin_idea_id || row.id);
    let poolId = "";
    const existingCopy = copies.find((c) => String(c.origin_idea_id) === originId && c.source_pool_id);
    if (existingCopy?.source_pool_id) poolId = String(existingCopy.source_pool_id);
    if (!poolId) {
      const localPool = engineRows.find((r) => r.frontseat_pool && String(r.origin_idea_id) === originId);
      if (localPool) poolId = String(localPool.id);
    }
    if (!poolId) {
      const bank = await api.getIdeaBank({ day_date: todayYmd(), include_open_pool: true, enrich_cross: false }).catch(() => [] as any[]);
      const found = (bank || []).find((r: any) => r.frontseat_pool && String(r.origin_idea_id) === originId);
      if (found) poolId = String(found.id);
    }
    if (!poolId) {
      poolId = String(row.id);
      await api.updateIdea(row.id, { frontseat_pool: true });
    }

    const already = new Set<string>();
    for (const c of copies) {
      const page = String(c.page_handle || "").trim();
      if (!page) continue;
      if (String(c.source_pool_id) === poolId || String(c.origin_idea_id) === originId || String(c.origin_idea_id) === String(row.id)) {
        already.add(page);
      }
    }

    const hasBaseEdit = !!(row.drive_link || row.frame_link);
    const day = copyBoardDay(row);
    const postedPages = pagesOf(row);
    const page_live_links: Record<string, string> = { ...(row.page_live_links || {}) };
    const page_posting_dates: Record<string, string> = { ...(row.page_posting_dates || {}) };
    const page_views: Record<string, number> = { ...(row.page_views || {}) };
    for (const p of postedPages) {
      if (!(p in page_live_links)) page_live_links[p] = "";
      if (!(p in page_views)) page_views[p] = 0;
    }

    for (const h of hooks) {
      if (already.has(h.page)) continue;
      await api.createIdea({
        page_handle: h.page,
        content_type: row.content_type || "Reel",
        content_format: row.content_format || "",
        video_format: row.video_format || "",
        topic: row.topic || "",
        script: row.script || "",
        status: hasBaseEdit ? "under_edit" : "approved",
        frontseat_pool: false,
        source_pool_id: poolId,
        day_date: day,
        source: "idea_engine",
        created_by: row.created_by || "",
        hook_variations: h.hook,
        comp_link: row.comp_link || "",
        yt_url: row.yt_url || "",
        yt_timestamps: row.yt_timestamps || "",
        frame_link: row.frame_link || "",
        drive_link: row.drive_link || "",
        kalakar_link: row.kalakar_link || "",
        origin_playbook: pb,
        origin_idea_id: originId,
        page_live_links,
        page_posting_dates,
        page_views,
      });
      already.add(h.page);
      if (!sentPages.includes(h.page)) sentPages.push(h.page);
    }
  }
  return { pages: sentPages };
}

// Per-page views for a single idea_bank row: prefer the page_views map, else put the
// row's total on its one page, else 0 per listed page.
function perPageViews(idea: any): Record<string, number> {
  const pv = (idea.page_views || {}) as Record<string, number>;
  const pages = pagesOf(idea);
  const out: Record<string, number> = {};
  if (Object.keys(pv).length) {
    for (const [p, v] of Object.entries(pv)) out[p.trim()] = Number(v) || 0;
  } else if (pages.length === 1) {
    out[pages[0]] = Number(idea.views) || 0;
  } else {
    for (const p of pages) out[p] = 0;
  }
  return out;
}
// Same as perPageViews, for likes (carousels).
function perPageLikes(idea: any): Record<string, number> {
  const pl = (idea.page_likes || {}) as Record<string, number>;
  const pages = pagesOf(idea);
  const out: Record<string, number> = {};
  if (Object.keys(pl).length) {
    for (const [p, v] of Object.entries(pl)) out[p.trim()] = Number(v) || 0;
  } else if (pages.length === 1) {
    out[pages[0]] = Number(idea.likes) || 0;
  } else {
    for (const p of pages) out[p] = 0;
  }
  return out;
}

function isContentDistributionCopy(idea: any): boolean {
  // Page copies created when an idea is assigned/scheduled in Content Distribution.
  // They share a topic and a new day_date (e.g. tomorrow) but are not new Idea Engine ideas.
  return Boolean(idea?.source_pool_id);
}

const ENGINE_STAGE: Record<string, string> = {
  new: "New",
  approved: "Approved",
  under_edit: "Under edit",
  changes: "Changes",
  review: "Review",
  gtg: "GTG",
  posted: "Posted",
  blocked: "Blocked",
};

function copiesMatchingIdea(idea: any, copies: any[]): any[] {
  const ids = new Set((idea._ids?.length ? idea._ids : [idea.id]).map(String));
  const topic = String(idea.topic || "").trim().toLowerCase();
  const pb = idea._playbook;
  const kind = contentKind(idea);
  return copies.filter((r) => {
    if (r._playbook !== pb) return false;
    if (ids.has(String(r.source_pool_id)) || (r.origin_idea_id && ids.has(String(r.origin_idea_id)))) return true;
    return !!topic && String(r.topic || "").trim().toLowerCase() === topic && contentKind(r) === kind;
  });
}

function splitDists(idea: any, copies: any[], boardDay: string) {
  const today: { page: string; status: string }[] = [];
  const prior: { page: string; status: string; day: string }[] = [];
  const seenT = new Set<string>();
  const seenP = new Set<string>();
  for (const r of copiesMatchingIdea(idea, copies)) {
    const page = String(r.page_handle || "").trim().replace(/^@/, "");
    if (!page) continue;
    const day = String(r.day_date || "").slice(0, 10);
    const status = String(r.status || "approved");
    if (day === boardDay) {
      if (seenT.has(page)) continue;
      seenT.add(page);
      today.push({ page, status });
    } else if (status.toLowerCase() !== "posted") {
      const k = `${page}|${day}`;
      if (seenP.has(k)) continue;
      seenP.add(k);
      prior.push({ page, status, day });
    }
  }
  prior.sort((a, b) => b.day.localeCompare(a.day) || a.page.localeCompare(b.page));
  return { today, prior };
}

function EngineDistChip({ page, status, day }: { page: string; status: string; day?: string }) {
  const label = ENGINE_STAGE[status] || status;
  const dayHint = !day ? "" : prettyDate(day);
  return (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, color: "var(--f-dim)", display: "inline-flex", gap: 5, alignItems: "center", border: "1px solid var(--f-line)" }}>
      @{page}
      <span style={{ color: "var(--f-faint)" }}>· {label}</span>
      {dayHint ? <span style={{ color: "var(--f-faint)" }}>· {dayHint}</span> : null}
    </span>
  );
}

// The backend stores each posting as its own row (same topic, different pages). Collapse
// same-topic rows within a playbook into one card that unions their pages + views.
function mergeIdeasByTopic(list: any[]): any[] {
  const map = new Map<string, any>();
  for (const idea of list) {
    const topic = String(idea.topic || "").trim();
    // Untitled ideas stay separate (keyed by id) so they don't all collapse together.
    const kind = contentKind(idea);
    const key = topic ? `${idea._playbook}::${topic.toLowerCase()}::${kind}` : `${idea._playbook}::__${idea.id}`;
    let g = map.get(key);
    if (!g) {
      g = { ...idea, page_views: {}, page_likes: {}, page_live_links: {}, page_posting_dates: {}, _deployed: new Set<string>(), _ids: new Set<string>() };
      map.set(key, g);
    }
    (g._ids as Set<string>).add(idea.id);
    const pv = g.page_views as Record<string, number>;
    for (const [p, v] of Object.entries(perPageViews(idea))) pv[p] = Math.max(pv[p] || 0, v);
    const pl = g.page_likes as Record<string, number>;
    for (const [p, v] of Object.entries(perPageLikes(idea))) pl[p] = Math.max(pl[p] || 0, v);
    if (!g.created_by && idea.created_by) g.created_by = idea.created_by;
    if (!g.content_type && idea.content_type) g.content_type = idea.content_type;
    // A "got blocked before" tag should survive the merge even if it's a different
    // page-copy of the same topic that carries it, not necessarily the first one seen.
    if (!g.blocked_reason && idea.blocked_reason) g.blocked_reason = idea.blocked_reason;
    // Links live on whichever row has them (e.g. the posted copy, not the empty pool
    // card) — fill from any row so the merged card actually surfaces them.
    for (const f of ["comp_link", "yt_url", "yt_timestamps", "frame_link", "drive_link", "kalakar_link"]) {
      if (!g[f] && idea[f]) g[f] = idea[f];
    }
    const live = g.page_live_links as Record<string, string> || (g.page_live_links = {});
    for (const [p, url] of Object.entries((idea.page_live_links || {}) as Record<string, string>)) {
      if (p.trim() && !live[p]) live[p.trim()] = url;
    }
    const dates = g.page_posting_dates as Record<string, string> || (g.page_posting_dates = {});
    for (const [p, d] of Object.entries((idea.page_posting_dates || {}) as Record<string, string>)) {
      if (p.trim() && !dates[p]) dates[p.trim()] = d;
    }
    // Prefer a real production status over the pool card's "new".
    if ((!g.status || g.status === "new") && idea.status) g.status = idea.status;
    if (!g.engine_review && idea.engine_review) g.engine_review = idea.engine_review;
    if (!g.hook_variations && idea.hook_variations) g.hook_variations = idea.hook_variations;
    for (const d of (idea.deployed_to_playbooks || [])) g._deployed.add(d);
  }
  return [...map.values()].map((g) => ({
    ...g,
    page_handle: Object.keys(g.page_views).join(",") || Object.keys(g.page_live_links || {}).join(","),
    views: Object.values(g.page_views as Record<string, number>).reduce((a, b) => a + b, 0),
    likes: Object.values(g.page_likes as Record<string, number>).reduce((a, b) => a + b, 0),
    deployed_to_playbooks: [...g._deployed],
    _ids: [...(g._ids as Set<string>)],
  }));
}
function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
function prettyDate(s: string): string {
  if (s === TODAY) return "Today";
  if (s === YESTERDAY) return "Yesterday";
  if (s === TOMORROW) return "Tomorrow";
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function isYouTube(url?: string): boolean {
  return !!url && /(?:youtube\.com|youtu\.be)/i.test(url);
}
// An idea is "existing" (rich card) once it carries real signal beyond a bare
// reference link — views, pages, or one of its production links. ≥2 signals ⇒ existing.
function ideaSignalCount(idea: any): number {
  let n = 0;
  if (sumViews(idea) > 0) n++;
  if (pagesOf(idea).length > 0) n++;
  if (idea.comp_link || idea.yt_url) n++;
  if (idea.kalakar_link) n++;
  if (idea.drive_link || idea.frame_link) n++;
  return n;
}
function isExistingIdea(idea: any): boolean {
  // Once it's actually posted, it's unambiguously existing — no need for the signal
  // heuristic to guess.
  if (idea.status === "posted") return true;
  return ideaSignalCount(idea) >= 2;
}

type EngineReview = "approved" | "rejected" | "pending";
function engineReviewOf(idea: any): EngineReview {
  const v = String(idea.engine_review || "").trim().toLowerCase();
  if (v === "approved" || v === "rejected") return v;
  return "pending";
}
function tallyReviews(list: any[]): { approved: number; rejected: number; pending: number } {
  let approved = 0, rejected = 0, pending = 0;
  for (const idea of list) {
    const r = engineReviewOf(idea);
    if (r === "approved") approved += 1;
    else if (r === "rejected") rejected += 1;
    else pending += 1;
  }
  return { approved, rejected, pending };
}
function tallyByType(list: any[]): { reels: number; carousels: number; statics: number } {
  let reels = 0, carousels = 0, statics = 0;
  for (const idea of list) {
    const kind = contentKind(idea);
    if (kind === "carousel") carousels += 1;
    else if (kind === "static") statics += 1;
    else reels += 1;
  }
  return { reels, carousels, statics };
}
type PersonTally = { name: string; added: number; approved: number; rejected: number; pending: number };
function tallyByPerson(list: any[]): PersonTally[] {
  const map = new Map<string, PersonTally>();
  for (const idea of list) {
    const name = String(idea.created_by || "").trim() || "Unassigned";
    let row = map.get(name);
    if (!row) {
      row = { name, added: 0, approved: 0, rejected: 0, pending: 0 };
      map.set(name, row);
    }
    row.added += 1;
    const r = engineReviewOf(idea);
    if (r === "approved") row.approved += 1;
    else if (r === "rejected") row.rejected += 1;
    else row.pending += 1;
  }
  return [...map.values()].sort((a, b) => {
    if (a.name === "Unassigned") return 1;
    if (b.name === "Unassigned") return -1;
    return b.added - a.added || a.name.localeCompare(b.name);
  });
}
function canReviewEngineIdeas(email: string | undefined, role: string | null): boolean {
  if (ENGINE_REVIEWER_EMAILS.has((email || "").trim().toLowerCase())) return true;
  return (role || "").split(",").map((r) => canonicalRole(r.trim())).some((r) => r === "admin" || r === "co");
}

type Idea = any & { _playbook: PlaybookId };

export default function IdeaEngineGallery() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role } = usePermissions();
  const roleList = (role || "").split(",").map((r) => canonicalRole(r.trim())).filter(Boolean);
  // Idea Engine is the CS/CW board — they can edit any card here. Ops/admin too.
  // Delete stays with ops/admin so a CS can't wipe someone else's idea.
  const canManageAllIdeas = roleList.some((r) => r === "co" || r === "admin" || r === "senior_cs");
  const canEditIdeas = canManageAllIdeas || roleList.some((r) => r === "cs" || r === "cw");
  const canReviewIdeas = canReviewEngineIdeas(user?.email, role);

  // One realtime connection per playbook (hooks can't be called in a loop) — a change
  // made anywhere (Production, Content Distribution, another Idea Engine tab) shows up
  // here without a reload, same as everywhere else this hook is used.
  useIdeaBankRealtime("bpb");
  useIdeaBankRealtime("xf");
  useIdeaBankRealtime("tech");

  const [dayDate, setDayDate] = useState<string>(TODAY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scoreScope, setScoreScope] = useState<"day" | "all">("day");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState({ reel: false, carousel: false, static: false });
  const [showAdd, setShowAdd] = useState(false);
  const [editIdea, setEditIdea] = useState<Idea | null>(null);

  const { data: ideas = [], isLoading, isFetched } = useQuery<Idea[]>({
    queryKey: ["idea-engine", dayDate],
    queryFn: async () => {
      const perPb = await Promise.all(
        PLAYBOOKS.map((pb) =>
          PB_API[pb]
            .getIdeaBank({ day_date: dayDate, enrich_cross: false })
            .then((rows) => (rows || []).map((r: any) => ({ ...r, _playbook: pb })))
            .catch(() => [] as Idea[]),
        ),
      );
      return perPb.flat();
    },
    staleTime: 20_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  // Collapse duplicate postings of the same idea into one card. Skip CD page-copies —
  // scheduling an existing idea for tomorrow must not mint a "New" Idea Engine card.
  const engineIdeas = useMemo(
    () => ideas.filter((i) => !isContentDistributionCopy(i)),
    [ideas],
  );
  const merged = useMemo(() => mergeIdeasByTopic(engineIdeas), [engineIdeas]);
  const dayTally = useMemo(() => tallyReviews(merged), [merged]);
  const dayType = useMemo(() => tallyByType(merged), [merged]);
  const dayPeople = useMemo(() => tallyByPerson(merged), [merged]);

  const { data: pipelineRows = [] } = useQuery<Idea[]>({
    queryKey: ["idea-engine-pipeline"],
    queryFn: async () => {
      const perPb = await Promise.all(
        PLAYBOOKS.map((pb) =>
          PB_API[pb]
            .getIdeaBank({ pending_only: true, enrich_cross: false })
            .then((rows) => (rows || []).map((r: any) => ({ ...r, _playbook: pb })))
            .catch(() => [] as Idea[]),
        ),
      );
      return perPb.flat();
    },
    enabled: isFetched,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const pipelineCopies = useMemo(() => {
    const byId = new Map<string, Idea>();
    for (const r of [...ideas, ...pipelineRows]) {
      if (r?.id && r.source_pool_id) byId.set(r.id, r);
    }
    return [...byId.values()];
  }, [ideas, pipelineRows]);
  const { data: reviewRows = [] } = useQuery<Idea[]>({
    queryKey: ["idea-engine-review-score"],
    queryFn: async () => {
      const perPb = await Promise.all(
        PLAYBOOKS.map((pb) =>
          PB_API[pb]
            .getIdeaBank({ review_score: true, enrich_cross: false })
            .then((rows) => (rows || []).map((r: any) => ({ ...r, _playbook: pb })))
            .catch(() => [] as Idea[]),
        ),
      );
      return perPb.flat();
    },
    enabled: scoreScope === "all",
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const engineReviewRows = useMemo(
    () => reviewRows.filter((i) => !isContentDistributionCopy(i)),
    [reviewRows],
  );
  const allMerged = useMemo(() => mergeIdeasByTopic(engineReviewRows), [engineReviewRows]);
  const allTally = useMemo(() => tallyReviews(allMerged), [allMerged]);
  const allType = useMemo(() => tallyByType(allMerged), [allMerged]);
  const allPeople = useMemo(() => tallyByPerson(allMerged), [allMerged]);
  const scoreTally = scoreScope === "all" ? allTally : dayTally;
  const scoreType = scoreScope === "all" ? allType : dayType;
  const scorePeople = scoreScope === "all" ? allPeople : dayPeople;

  // "Top 6" — best-performing posted ideas across all playbooks, all-time (not scoped to
  // the day-picker below). Backend already filters to posted ideas crossing either
  // threshold (reel ≥200k views, carousel ≥1k likes), so this just merges + ranks by how
  // far over its own threshold each idea is, so a breakout carousel can outrank a
  // so-so reel instead of raw view-counts always winning.
  const { data: topCandidates = [] } = useQuery<Idea[]>({
    queryKey: ["idea-engine-top6"],
    queryFn: async () => {
      const perPb = await Promise.all(
        PLAYBOOKS.map((pb) =>
          PB_API[pb]
            .getIdeaBank({ top_performers: true, enrich_cross: false })
            .then((rows) => (rows || []).map((r: any) => ({ ...r, _playbook: pb })))
            .catch(() => [] as Idea[]),
        ),
      );
      return perPb.flat();
    },
    enabled: isFetched,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const top6 = useMemo(() => {
    return mergeIdeasByTopic(topCandidates)
      .map((idea) => ({ idea, score: usesLikesMetric(idea) ? sumLikes(idea) / 1000 : sumViews(idea) / 200000 }))
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [topCandidates]);

  // Send an idea into a chosen playbook's Frontseat "Ideas Pool" (a fresh pool card
  // there), while a copy stays here. origin_* links it back so the source card shows
  // "Sent to …" — backend-derived via deployed_to_playbooks, so it survives reloads.
  const [sentLocal, setSentLocal] = useState<Record<string, PlaybookId[]>>({});
  const sendMut = useMutation({
    mutationFn: ({ idea, target }: { idea: Idea; target: PlaybookId }) => {
      if (engineReviewOf(idea) === "rejected") {
        return Promise.reject(new Error("Rejected ideas can't go to Content Distribution"));
      }
      const rootPb = (idea.origin_playbook || idea._playbook) as PlaybookId;
      const rootId = String(idea.origin_idea_id || idea.id);
      const postedPages = pagesOf(idea);
      const page_live_links: Record<string, string> = { ...(idea.page_live_links || {}) };
      const page_posting_dates: Record<string, string> = { ...(idea.page_posting_dates || {}) };
      const page_views: Record<string, number> = { ...(idea.page_views || {}) };
      for (const p of postedPages) {
        if (!(p in page_live_links)) page_live_links[p] = "";
        if (!(p in page_views)) page_views[p] = 0;
      }
      return PB_API[target].createIdea({
        page_handle: "",
        content_type: idea.content_type || "reel",
        content_format: idea.content_format || "",
        video_format: idea.video_format || "",
        topic: idea.topic || "",
        status: "new",
        frontseat_pool: true,
        // Ideas Pool is today's board. Copying the source idea's day_date (e.g. yesterday)
        // wrote a pool card that Content Distribution never fetched, so Send looked like
        // a no-op. The original stays on its own day in Idea Engine.
        day_date: todayYmd(),
        source: "idea_engine",
        created_by: idea.created_by || "",
        // Carry the idea's links so the target playbook keeps them — the base-edit
        // link (drive/frame) is what lets an existing idea skip straight to Base edit.
        comp_link: idea.comp_link || "",
        yt_url: idea.yt_url || "",
        yt_timestamps: idea.yt_timestamps || "",
        frame_link: idea.frame_link || "",
        drive_link: idea.drive_link || "",
        kalakar_link: idea.kalakar_link || "",
        origin_playbook: rootPb,
        origin_idea_id: rootId,
        hook_variations: idea.hook_variations || "",
        // History maps (not page_handle) so the pool can show "already posted on"
        // without treating those pages as today's assignments.
        page_live_links,
        page_posting_dates,
        page_views,
      });
    },
    onSuccess: (_d, { idea, target }) => {
      const key = `${idea._playbook}-${idea.id}`;
      setSentLocal((m) => ({ ...m, [key]: [...new Set([...(m[key] || []), target])] }));
      toast.success(`Sent to ${PLAYBOOK_CONFIGS[target].label}`);
      qc.invalidateQueries({ queryKey: ["idea-engine"] });
      qc.invalidateQueries({ queryKey: ["exp", target, "idea-bank"], refetchType: "all" });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't send idea"),
  });

  // A merged card can be more than one underlying row (same topic posted to several
  // pages) — delete every constituent row, not just the one whose fields happened to
  // win the merge, or the "deleted" card would just reappear with fewer pages.
  const deleteMut = useMutation({
    mutationFn: (idea: Idea) => {
      const ids: string[] = idea._ids?.length ? idea._ids : [idea.id];
      return Promise.all(ids.map((id) => PB_API[idea._playbook as PlaybookId].deleteIdea(id)));
    },
    onSuccess: (_d, idea) => {
      const ids: string[] = idea._ids?.length ? idea._ids : [idea.id];
      qc.setQueryData<Idea[]>(["idea-engine", dayDate], (old) => (old || []).filter((i) => !ids.includes(i.id)));
      qc.setQueryData<Idea[]>(["idea-engine-review-score"], (old) => (old || []).filter((i) => !ids.includes(i.id)));
      qc.invalidateQueries({ queryKey: ["idea-engine-top6"] });
      toast.success("Idea deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't delete idea"),
  });

  const reviewMut = useMutation({
    mutationFn: async ({ idea, engine_review }: { idea: Idea; engine_review: "approved" | "rejected" | "" }) => {
      const ids: string[] = idea._ids?.length ? idea._ids : [idea.id];
      const payload = { engine_review, engine_reviewed_by: user?.email || "" };
      await Promise.all(ids.map((id) => PB_API[idea._playbook as PlaybookId].updateIdea(id, payload)));
      if (engine_review !== "approved") return { pages: [] as string[] };
      const engineRows = (qc.getQueryData<Idea[]>(["idea-engine", dayDate]) || []).filter((i) => !i.source_pool_id);
      return distributeApprovedIdea(idea, engineRows, pipelineCopies);
    },
    onSuccess: (result, { idea, engine_review }) => {
      const ids: string[] = idea._ids?.length ? idea._ids : [idea.id];
      const patch = { engine_review };
      qc.setQueryData<Idea[]>(["idea-engine", dayDate], (old) =>
        (old || []).map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)),
      );
      qc.setQueryData<Idea[]>(["idea-engine-review-score"], (old) => {
        const list = old || [];
        let found = false;
        const next = list.map((i) => {
          if (ids.includes(i.id)) { found = true; return { ...i, ...patch }; }
          return i;
        });
        if (!found) next.push({ ...idea, ...patch });
        return next;
      });
      if (engine_review === "approved") {
        const pages = result?.pages || [];
        if (pages.length) {
          const key = `${idea._playbook}-${idea.id}`;
          setSentLocal((m) => ({ ...m, [key]: [...new Set([...(m[key] || []), "bpb" as PlaybookId])] }));
          const names = pages.map((p) => shortPage(idea._playbook as PlaybookId, p)).join(", ");
          toast.success(`Approved — sent to ${names} and Production`);
        } else if (assignedPageHooks(idea.hook_variations).length === 0 && pageHooksForDisplay(idea.hook_variations).length > 0) {
          toast.success("Approved. Pick a page next to each hook to send them out.");
        } else {
          toast.success("Approved");
        }
        qc.invalidateQueries({ queryKey: ["idea-engine"] });
        qc.invalidateQueries({ queryKey: ["idea-engine-pipeline"] });
        qc.invalidateQueries({ queryKey: ["exp", idea._playbook, "idea-bank"], refetchType: "all" });
      } else {
        toast.success(engine_review === "rejected" ? "Rejected" : "Review cleared");
      }
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't save review"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged
      .filter((i) => matchesKindFilter(i, kindFilter))
      .filter((i) => (q ? String(i.topic || "").toLowerCase().includes(q) || pagesOf(i).some((p) => p.toLowerCase().includes(q)) : true))
      .sort((a, b) => sumViews(b) - sumViews(a));
  }, [merged, search, kindFilter]);

  return (
    <FramerPage>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <PageHeader eyebrow="CONTENT · IDEA ENGINE" title="Idea Engine" />
        <button type="button" onClick={() => setShowAdd(true)} style={primaryBtn}>
          <Plus size={15} strokeWidth={2} /> New idea
        </button>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <Trophy size={14} strokeWidth={2} color="#facc15" />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--f-faint)" }}>
            Top 6 · best performing ideas
          </span>
          <span style={{ fontSize: 11, color: "var(--f-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            — posted reels ≥200K views, carousels/statics ≥1K likes
          </span>
        </div>
        {top6.length ? (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {top6.map(({ idea }, i) => (
              <Top6Card
                key={`${idea._playbook}-${idea.id}`}
                idea={idea}
                rank={i + 1}
                onOpen={() => (canEditIdeas ? setEditIdea(idea) : navigate(PLAYBOOK_CONFIGS[idea._playbook as PlaybookId].route))}
              />
            ))}
          </div>
        ) : (
          <div style={{ padding: "16px 18px", borderRadius: 14, border: "1px dashed var(--f-line)", fontSize: 12.5, color: "var(--f-faint)" }}>
            No ideas have crossed the bar yet — posted reels need 200K+ views, posted carousels/statics need 1K+ likes.
          </div>
        )}
      </div>

      {/* Date rail — always lands on today, yesterday one click away, or pick a day. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        <DatePill active={dayDate === YESTERDAY} onClick={() => setDayDate(YESTERDAY)}>Yesterday</DatePill>
        <DatePill active={dayDate === TODAY} onClick={() => setDayDate(TODAY)}>Today</DatePill>
        <DatePill active={dayDate === TOMORROW} onClick={() => setDayDate(TOMORROW)}>Tomorrow</DatePill>
        <PickDayControl
          value={dayDate}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onChange={setDayDate}
        />
        {([["reel", "Reel"], ["carousel", "Carousel"], ["static", "Static"]] as const).map(([key, label]) => {
          const on = kindFilter[key];
          return (
            <DatePill
              key={key}
              active={on}
              onClick={() => setKindFilter((f) => ({ ...f, [key]: !f[key] }))}
            >{label}</DatePill>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", minWidth: 220 }}>
          <Search size={14} strokeWidth={1.6} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--f-faint)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topic or page…"
            className="fglass-input" style={{ width: "100%", borderRadius: 9, padding: "8px 10px 8px 32px", fontSize: 13 }} />
        </div>
      </div>

      <ReviewBoard
        scope={scoreScope}
        onScope={setScoreScope}
        dayLabel={prettyDate(dayDate)}
        tally={scoreTally}
        typeTally={scoreType}
        people={scorePeople}
      />

      {/* Gallery */}
      {isLoading ? (
        <p className="seeding-muted" style={{ marginTop: 28 }}>Loading ideas…</p>
      ) : !filtered.length ? (
        <div style={{ marginTop: 28, textAlign: "center", padding: "64px 0", border: "1px dashed var(--f-line)", borderRadius: 16 }}>
          <div style={{ fontSize: 15, color: "var(--f-ink)" }}>No ideas for {prettyDate(dayDate).toLowerCase()}.</div>
          <div style={{ fontSize: 12.5, color: "var(--f-faint)", marginTop: 6 }}>Add one with “New idea”, or check another day.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 24 }}>
          {filtered.map((idea) => {
            const key = `${idea._playbook}-${idea.id}`;
            const dists = splitDists(idea, pipelineCopies, dayDate);
            return (
              <IdeaCard
                key={key}
                idea={idea}
                sentTo={sentLocal[key] || []}
                sending={sendMut.isPending && sendMut.variables?.idea === idea}
                onSend={(target) => {
                  if (engineReviewOf(idea) === "rejected") return;
                  sendMut.mutate({ idea, target });
                }}
                onOpen={() => (canEditIdeas ? setEditIdea(idea) : navigate(PLAYBOOK_CONFIGS[idea._playbook as PlaybookId].route))}
                canEdit={canEditIdeas}
                canDelete={canManageAllIdeas}
                deleting={deleteMut.isPending && deleteMut.variables === idea}
                onDelete={() => {
                  if (window.confirm(`Delete "${idea.topic || "this idea"}"? This can't be undone.`)) deleteMut.mutate(idea);
                }}
                canReview={canReviewIdeas}
                reviewing={reviewMut.isPending && reviewMut.variables?.idea === idea}
                onReview={(engine_review) => reviewMut.mutate({ idea, engine_review })}
                priorDist={dists.prior}
                todayDist={dists.today}
                boardLabel={prettyDate(dayDate)}
              />
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddIdeaModal
          author={user?.user_metadata?.full_name || user?.email?.split("@")[0] || ""}
          onClose={() => setShowAdd(false)}
          onCreated={(savedDay) => {
            setShowAdd(false);
            setDayDate(savedDay);
            qc.invalidateQueries({ queryKey: ["idea-engine"] });
            qc.invalidateQueries({ queryKey: ["idea-engine-review-score"] });
            qc.invalidateQueries({ queryKey: ["exp", "bpb", "idea-bank"], refetchType: "all" });
          }}
        />
      )}

      {editIdea && (
        <EditIdeaModal
          idea={editIdea}
          onClose={() => setEditIdea(null)}
          onSaved={(patch) => {
            setEditIdea(null);
            const moved = typeof patch.day_date === "string" && patch.day_date !== dayDate;
            if (moved) setDayDate(patch.day_date as string);
            qc.invalidateQueries({ queryKey: ["idea-engine"] });
            qc.invalidateQueries({ queryKey: ["idea-engine-top6"] });
          }}
        />
      )}
    </FramerPage>
  );
}

function IdeaLinkChip({ href, label, accent }: { href: string; label: string; accent: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: accent,
        padding: "4px 9px", borderRadius: 7, border: "1px solid var(--f-line)", background: "rgba(255,255,255,.03)" }}>
      {label} <ExternalLink size={11} strokeWidth={1.7} />
    </a>
  );
}
// Reference / production links row. A YouTube link shows its timestamps beside it.
// `full` adds Kalakar + Drive/Frame (existing cards only); new cards show just the ref link.
function IdeaLinks({ idea, full }: { idea: any; full: boolean }) {
  const yt = idea.yt_url as string | undefined;
  const ts = idea.yt_timestamps as string | undefined;
  const comp = idea.comp_link as string | undefined;
  const kalakar = idea.kalakar_link as string | undefined;
  const drive = (idea.drive_link || idea.frame_link) as string | undefined;
  if (!(yt || comp || (full && (kalakar || drive)))) {
    return <div style={{ fontSize: 12, color: "var(--f-faint)" }}>No reference link yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {yt ? (
        <IdeaLinkChip href={yt} label="YouTube" accent="#f472b6" />
      ) : comp ? (
        <IdeaLinkChip href={comp} label="Comp" accent="#D4952A" />
      ) : null}
      {(yt || comp) && ts ? (
        <span style={{ fontSize: 11, color: "var(--f-faint)", fontVariantNumeric: "tabular-nums" }}>⏱ {ts}</span>
      ) : null}
      {full && kalakar ? <IdeaLinkChip href={kalakar} label="Kalakar" accent="#a78bfa" /> : null}
      {full && drive ? <IdeaLinkChip href={drive} label="Drive link" accent="#4A7FD4" /> : null}
    </div>
  );
}

// Compact highlight card for the Top 6 strip — simpler than IdeaCard, no send/edit
// actions, just enough to identify the idea and jump into it.
function Top6Card({ idea, rank, onOpen }: { idea: Idea; rank: number; onOpen: () => void }) {
  const pb = idea._playbook as PlaybookId;
  const likesBased = usesLikesMetric(idea);
  const metricValue = likesBased ? sumLikes(idea) : sumViews(idea);
  const kindLabel = KIND_LABEL[contentKind(idea)];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: "left", cursor: "pointer", flex: "0 0 220px", padding: "14px 16px",
        borderRadius: 14, border: "1px solid var(--f-line)", background: "rgba(255,255,255,.03)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: PB_ACCENT[pb] }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: PB_ACCENT[pb] }} />
          {PB_SHORT[pb]}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#facc15" }}>#{rank}</span>
      </div>
      <div style={{
        fontSize: 13.5, fontWeight: 600, color: "var(--f-ink)", lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {idea.topic || "Untitled idea"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#4ade80" }}>
        {likesBased ? <Heart size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
        {fmtViews(metricValue)} {likesBased ? "likes" : "views"}
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--f-faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          {kindLabel}
        </span>
      </div>
    </button>
  );
}

function IdeaCard({ idea, sentTo, sending, onSend, onOpen, canEdit, canDelete, deleting, onDelete, canReview, reviewing, onReview, priorDist = [], todayDist = [], boardLabel = "Today" }: {
  idea: Idea;
  sentTo: PlaybookId[];
  sending: boolean;
  onSend: (target: PlaybookId) => void;
  onOpen: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: () => void;
  canReview?: boolean;
  reviewing?: boolean;
  onReview?: (engine_review: "approved" | "rejected" | "") => void;
  priorDist?: { page: string; status: string; day: string }[];
  todayDist?: { page: string; status: string }[];
  boardLabel?: string;
}) {
  const pb = idea._playbook as PlaybookId;
  const pages = pagesOf(idea);
  const pv = (idea.page_views || {}) as Record<string, number>;
  const total = sumViews(idea);
  const existing = isExistingIdea(idea);
  // Playbooks this idea is already in: backend-derived (deployed_to_playbooks) ∪ this session's sends.
  const sent = [...new Set([...(idea.deployed_to_playbooks || []), ...sentTo])] as PlaybookId[];
  const alreadyDistributed = todayDist.length > 0 || priorDist.length > 0;
  const alreadySent = sent.includes("bpb") || alreadyDistributed;
  const review = engineReviewOf(idea);
  const rejected = review === "rejected";
  const sendLocked = sending || alreadySent || rejected;
  const hookRows = pageHooksForDisplay(idea.hook_variations);

  return (
    <article className="fglass-panel fglass-purple-shadow" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: PB_ACCENT[pb], fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: PB_ACCENT[pb] }} />
          {PLAYBOOK_CONFIGS[pb].label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {idea.blocked_reason && (
            <span title={idea.blocked_reason} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#FF7070", border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.1)", borderRadius: 6, padding: "2px 7px" }}>
              🚫 Blocked
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: existing ? "var(--f-faint)" : "#4ade80", border: "1px solid var(--f-line)", borderRadius: 6, padding: "2px 7px" }}>
            {existing ? "Existing" : "New"}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", borderRadius: 6, padding: "2px 7px",
            color: KIND_ACCENT[contentKind(idea)],
            border: `1px solid ${KIND_ACCENT[contentKind(idea)]}66`,
            background: `${KIND_ACCENT[contentKind(idea)]}1f`,
          }}>
            {KIND_LABEL[contentKind(idea)]}
          </span>
          {(idea.video_format || idea.content_format) ? (
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".02em", borderRadius: 6, padding: "2px 7px", color: "var(--f-dim)", border: "1px solid var(--f-line)" }}>
              {idea.video_format || idea.content_format}
            </span>
          ) : null}
          {review !== "pending" && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", borderRadius: 6, padding: "2px 7px",
              color: review === "approved" ? "#86efac" : "#fca5a5",
              border: review === "approved" ? "1px solid rgba(74,222,128,.35)" : "1px solid rgba(239,68,68,.35)",
              background: review === "approved" ? "rgba(74,222,128,.12)" : "rgba(239,68,68,.1)",
            }}>
              {review === "approved" ? "Approved" : "Rejected"}
            </span>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{idea.topic || <em style={{ color: "var(--f-faint)", fontWeight: 400 }}>Untitled idea</em>}</h3>

      {hookRows.length > 0 ? (
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>Hooks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hookRows.map((h, i) => (
              <div key={`${h.page}-${i}`} style={{ fontSize: 12.5, color: "var(--f-dim)", lineHeight: 1.4 }}>
                <span style={{ whiteSpace: "pre-wrap" }}>{h.hook}</span>
                {h.page ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--f-faint)" }}>
                    → @{shortPage(pb, h.page)}
                  </span>
                ) : (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#fbbf24" }}>· pick a page</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {idea.blocked_reason && (
        <p style={{ margin: 0, fontSize: 12, color: "#FF7070" }}>Blocked before: {idea.blocked_reason}</p>
      )}

      {existing ? (
        <>
          {/* Views + per-page breakdown + all production links */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              <Eye size={16} strokeWidth={1.6} style={{ color: "var(--f-faint)" }} /> {fmtViews(total)}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--f-faint)" }}>total views</span>
            {idea.status ? <span style={{ marginLeft: "auto" }}><StatusBadge status={idea.status} /></span> : null}
          </div>

          {pages.length ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>Posted on</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pages.map((p) => (
                  <span key={p} className="seeding-surface-nested" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, color: "var(--f-dim)", display: "inline-flex", gap: 5, alignItems: "center" }}>
                    @{p}{pv[p] ? <span style={{ color: "var(--f-faint)" }}>· {fmtViews(Number(pv[p]))}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--f-faint)" }}>Not yet posted — free to use.</div>
          )}

          {priorDist.length > 0 ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>Distributed to</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {priorDist.map((d) => (
                  <EngineDistChip key={`${d.page}-${d.day}`} page={d.page} status={d.status} day={d.day} />
                ))}
              </div>
            </div>
          ) : null}

          <IdeaLinks idea={idea} full />
        </>
      ) : (
        // New idea — just the reference link (comp / YouTube + timestamps).
        <>
          {priorDist.length > 0 ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>Distributed to</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {priorDist.map((d) => (
                  <EngineDistChip key={`${d.page}-${d.day}`} page={d.page} status={d.status} day={d.day} />
                ))}
              </div>
            </div>
          ) : null}
          <IdeaLinks idea={idea} full={false} />
        </>
      )}

      {todayDist.length > 0 ? (
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>
            {boardLabel === "Today" ? "Today’s pages" : `${boardLabel} pages`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {todayDist.map((d) => (
              <EngineDistChip key={d.page} page={d.page} status={d.status} />
            ))}
          </div>
        </div>
      ) : null}

      {sent.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a78bfa", fontWeight: 500 }}>
          <Check size={12} strokeWidth={2} /> In Frontseat · {sent.map((d) => PB_SHORT[d] || d).join(", ")}
        </div>
      ) : null}

      {canReview ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={reviewing}
            onClick={() => onReview?.(review === "approved" ? "" : "approved")}
            title={review === "approved" ? "Clear approval" : "Approve this idea"}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 12, fontWeight: 600, padding: "7px 10px", borderRadius: 8, cursor: reviewing ? "default" : "pointer",
              opacity: reviewing ? 0.55 : 1,
              color: review === "approved" ? "#86efac" : "var(--f-dim)",
              border: review === "approved" ? "1px solid rgba(74,222,128,.45)" : "1px solid var(--f-line)",
              background: review === "approved" ? "rgba(74,222,128,.12)" : "transparent",
            }}
          >
            <ThumbsUp size={13} strokeWidth={1.8} /> Approve
          </button>
          <button
            type="button"
            disabled={reviewing}
            onClick={() => onReview?.(review === "rejected" ? "" : "rejected")}
            title={review === "rejected" ? "Clear rejection" : "Reject this idea"}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 12, fontWeight: 600, padding: "7px 10px", borderRadius: 8, cursor: reviewing ? "default" : "pointer",
              opacity: reviewing ? 0.55 : 1,
              color: review === "rejected" ? "#fca5a5" : "var(--f-dim)",
              border: review === "rejected" ? "1px solid rgba(239,68,68,.45)" : "1px solid var(--f-line)",
              background: review === "rejected" ? "rgba(239,68,68,.12)" : "transparent",
            }}
          >
            <ThumbsDown size={13} strokeWidth={1.8} /> Reject
          </button>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: "auto", paddingTop: 6 }}>
        <span style={{ fontSize: 11.5, color: "var(--f-faint)" }}>{idea.created_by ? <>by <strong style={{ color: "var(--f-dim)", fontWeight: 600 }}>{idea.created_by}</strong></> : "—"}</span>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Delete idea"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(239,68,68,.35)",
                background: "rgba(239,68,68,.12)", color: "#ef4444", cursor: deleting ? "default" : "pointer",
                opacity: deleting ? 0.6 : 1, flexShrink: 0,
              }}
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          )}
          <button type="button" onClick={onOpen} style={ghostBtnSm}>
            {canEdit ? "Edit" : "Open"} <ExternalLink size={12} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            disabled={sendLocked}
            title={rejected ? "Rejected ideas can't go to Content Distribution" : alreadySent ? "Already sent" : "Send to Content Distribution"}
            onClick={() => { if (!rejected && !alreadySent) onSend("bpb"); }}
            style={{ ...sendBtn, opacity: sendLocked ? 0.55 : 1, cursor: sendLocked ? "default" : "pointer" }}
          >
            {sending ? "Sending…" : alreadySent ? <>Sent <Check size={13} strokeWidth={2} /></> : rejected ? "Rejected" : "Send to Content Distribution"}
          </button>
        </div>
      </div>
    </article>
  );
}

function HookPageRows({
  rows,
  onChange,
  playbook,
}: {
  rows: PageHook[];
  onChange: (rows: PageHook[]) => void;
  playbook: PlaybookId;
}) {
  const pages = PLAYBOOK_CONFIGS[playbook].pages;
  const used = new Set(rows.map((r) => r.page).filter(Boolean));
  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 148px 32px", gap: 8, marginBottom: 8, alignItems: "start" }}>
          <textarea
            value={row.hook}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, hook: e.target.value } : r)))}
            placeholder="Hook for this page"
            className="fglass-input"
            rows={2}
            style={{ ...modalInput, resize: "vertical", minHeight: 44 }}
          />
          <select
            value={row.page}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, page: e.target.value } : r)))}
            className="fglass-input"
            style={{ ...modalInput, colorScheme: "dark" }}
          >
            <option value="">Page</option>
            {pages.map((p) => (
              <option key={p} value={p} disabled={used.has(p) && p !== row.page}>
                {shortPage(playbook, p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(rows.length === 1 ? [{ page: "", hook: "" }] : rows.filter((_, j) => j !== i))}
            title="Remove hook"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 44, borderRadius: 8, border: "1px solid var(--f-line)",
              background: "transparent", color: "var(--f-faint)", cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={rows.length >= pages.length}
        onClick={() => onChange([...rows, { page: "", hook: "" }])}
        style={{ ...ghostBtnSm, padding: "6px 10px", opacity: rows.length >= pages.length ? 0.45 : 1 }}
      >
        <Plus size={12} strokeWidth={2} /> Add hook
      </button>
      <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--f-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
        Each hook goes to one page. Approve sends them there and to Production.
      </span>
    </div>
  );
}

function FormatPills({ options, value, onChange }: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((f) => {
        const on = value === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(on ? "" : f)}
            style={{
              ...datePillBase,
              cursor: "pointer",
              borderColor: on ? "#fff" : "var(--f-line)",
              background: on ? "#fff" : "transparent",
              color: on ? "#000" : "var(--f-dim)",
              fontWeight: on ? 600 : 500,
            }}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}

function AddIdeaModal({ author, onClose, onCreated }: {
  author: string; onClose: () => void; onCreated: (savedDay: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [refLink, setRefLink] = useState("");
  const [timestamps, setTimestamps] = useState("");
  const [kinds, setKinds] = useState({ reel: false, carousel: false, static: false });
  const [reelFormat, setReelFormat] = useState("");
  const [carouselFormat, setCarouselFormat] = useState("");
  const [staticFormat, setStaticFormat] = useState("");
  const [day, setDay] = useState(todayYmd());
  const [pageHooks, setPageHooks] = useState<PageHook[]>([{ page: "", hook: "" }]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const yt = isYouTube(refLink);

  const submit = async () => {
    if (!topic.trim()) { toast.error("Give the idea a name."); return; }
    const types = [kinds.reel && "Reel", kinds.carousel && "Carousel", kinds.static && "Static"].filter(Boolean) as string[];
    if (!types.length) { toast.error("Pick Reel, Carousel, Static, or a mix."); return; }
    if (pageHookMissingPage(pageHooks)) { toast.error("Pick a page next to each hook."); return; }
    setBusy(true);
    try {
      const link = refLink.trim();
      const ytLink = isYouTube(link);
      const savedDay = day || todayYmd();
      const hooks = serializePageHooks(pageHooks) || undefined;
      // One row per type so Content Distribution can treat each format separately.
      await Promise.all(types.map((content_type) => PB_API.bpb.createIdea({
        page_handle: "",
        topic: topic.trim(),
        content_type,
        video_format: content_type === "Carousel" ? (carouselFormat || undefined) : content_type === "Static" ? (staticFormat || undefined) : (reelFormat || undefined),
        views: 0,
        day_date: savedDay,
        created_by: author || undefined,
        comp_link: link && !ytLink ? link : undefined,
        yt_url: ytLink ? link : undefined,
        yt_timestamps: timestamps.trim() || undefined,
        hook_variations: hooks,
        script: content_type === "Carousel" || content_type === "Static" ? (body.trim() || undefined) : undefined,
      })));
      const both = types.length > 1;
      toast.success(
        both
          ? (savedDay === todayYmd() ? `${joinAnd(types)} added.` : `${joinAnd(types)} added for ${prettyDate(savedDay)}.`)
          : (savedDay === todayYmd() ? "Idea added." : `Idea added for ${prettyDate(savedDay)}.`),
      );
      onCreated(savedDay);
    } catch {
      toast.error("Couldn't add the idea — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fglass-panel" style={{ width: "min(560px, 100%)", padding: "22px 24px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>New idea</h2>
          <button type="button" onClick={onClose} style={{ ...ghostBtnSm, border: "none", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Idea name *"><input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's the idea?" className="fglass-input" style={modalInput} /></Field>

          {/* Reference link + timestamps. Timestamps sit beside the link for comp
              references too, not just YouTube — a comp has moments worth marking. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
            <Field label={yt ? "YouTube link" : "Comp / YouTube link"}>
              <input value={refLink} onChange={(e) => setRefLink(e.target.value)} placeholder="Paste comp or YouTube link" className="fglass-input" style={modalInput} />
            </Field>
            <Field label="Timestamps"><input value={timestamps} onChange={(e) => setTimestamps(e.target.value)} placeholder="0:12, 1:45" className="fglass-input" style={modalInput} /></Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Content type">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {([["reel", "Reel"], ["carousel", "Carousel"], ["static", "Static"]] as const).map(([key, label]) => {
                  const on = kinds[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKinds((k) => ({ ...k, [key]: !k[key] }))}
                      style={{
                        ...datePillBase,
                        cursor: "pointer",
                        borderColor: on ? "#fff" : "var(--f-line)",
                        background: on ? "#fff" : "transparent",
                        color: on ? "#000" : "var(--f-dim)",
                        fontWeight: on ? 600 : 500,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--f-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                Pick one or more.
              </span>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                className="fglass-input"
                style={{ ...modalInput, colorScheme: "dark", cursor: "pointer" }}
              />
              <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--f-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                Leave as today, or pick the day this idea should show (e.g. 3 Sep).
              </span>
            </Field>
          </div>

          {kinds.reel && (
            <Field label="Video format">
              <FormatPills options={REEL_VIDEO_FORMATS} value={reelFormat} onChange={setReelFormat} />
            </Field>
          )}
          {kinds.carousel && (
            <Field label="Format">
              <FormatPills options={CAROUSEL_FORMATS} value={carouselFormat} onChange={setCarouselFormat} />
            </Field>
          )}
          {kinds.static && (
            <Field label="Format">
              <FormatPills options={CAROUSEL_FORMATS} value={staticFormat} onChange={setStaticFormat} />
            </Field>
          )}

          {/* Hook + page — each row is one hook going to one page. Approve
              pushes those pages into Content Distribution and Production. */}
          {(kinds.reel || kinds.carousel || kinds.static) && (
            <Field label="Hooks & pages">
              <HookPageRows rows={pageHooks} onChange={setPageHooks} playbook="bpb" />
            </Field>
          )}
          {(kinds.carousel || kinds.static) && (
            <Field label="Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Carousel / static body text"
                className="fglass-input"
                rows={4}
                style={{ ...modalInput, resize: "vertical", minHeight: 88 }}
              />
            </Field>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <button
            type="button"
            disabled={busy || (!kinds.reel && !kinds.carousel && !kinds.static)}
            onClick={submit}
            style={{ ...primaryBtn, opacity: busy || (!kinds.reel && !kinds.carousel && !kinds.static) ? 0.5 : 1 }}
          >
            <Check size={14} strokeWidth={2} /> {busy ? "Adding…" : [kinds.reel, kinds.carousel, kinds.static].filter(Boolean).length > 1 ? "Add all" : "Add idea"}
          </button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...ghostBtnSm, padding: "9px 14px" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Ops/admin editing an idea's info + views straight from Idea Engine, on any day —
 *  not scoped to today, unlike the New-idea flow. */
function EditIdeaModal({ idea, onClose, onSaved }: {
  idea: Idea; onClose: () => void; onSaved: (patch: Record<string, unknown>) => void;
}) {
  const [topic, setTopic] = useState(idea.topic || "");
  const [refLink, setRefLink] = useState(idea.yt_url || idea.comp_link || "");
  const [timestamps, setTimestamps] = useState(idea.yt_timestamps || "");
  const [contentType, setContentType] = useState(idea.content_type || "Reel");
  const [videoFormat, setVideoFormat] = useState(idea.video_format || "");
  const [day, setDay] = useState(String(idea.day_date || "").slice(0, 10) || todayYmd());
  const [views, setViews] = useState(String(idea.views ?? 0));
  const [likes, setLikes] = useState(String(idea.likes ?? 0));
  const [pageHooks, setPageHooks] = useState<PageHook[]>(() => parsePageHooks(idea.hook_variations));
  const [body, setBody] = useState(idea.script || "");
  const pages = pagesOf(idea);
  const [pageViews, setPageViews] = useState<Record<string, string>>(() => {
    const pv = (idea.page_views || {}) as Record<string, number>;
    const out: Record<string, string> = {};
    pages.forEach((p) => { out[p] = String(pv[p] ?? 0); });
    return out;
  });
  const [pageLikes, setPageLikes] = useState<Record<string, string>>(() => {
    const pl = (idea.page_likes || {}) as Record<string, number>;
    const out: Record<string, string> = {};
    pages.forEach((p) => { out[p] = String(pl[p] ?? 0); });
    return out;
  });
  const [busy, setBusy] = useState(false);

  const yt = isYouTube(refLink);
  // Carousels and statics are judged by likes, not views — follows whatever content
  // type is currently selected in this edit, so switching type here swaps the field.
  const editingLikesBased = ["carousel", "static"].includes(contentType.trim().toLowerCase());

  const submit = async () => {
    if (!topic.trim()) { toast.error("Give the idea a name."); return; }
    if (pageHookMissingPage(pageHooks)) { toast.error("Pick a page next to each hook."); return; }
    setBusy(true);
    try {
      const link = refLink.trim();
      const ytLink = isYouTube(link);
      const patch: Record<string, unknown> = {
        topic: topic.trim(),
        content_type: contentType,
        video_format: videoFormat,
        day_date: day || todayYmd(),
        comp_link: link && !ytLink ? link : "",
        yt_url: ytLink ? link : "",
        yt_timestamps: timestamps.trim(),
        hook_variations: serializePageHooks(pageHooks),
      };
      if (editingLikesBased) {
        patch.script = body.trim();
        if (pages.length > 1) {
          const pl: Record<string, number> = {};
          pages.forEach((p) => { pl[p] = parseInt(pageLikes[p]?.replace(/[^0-9]/g, "") || "0", 10) || 0; });
          patch.page_likes = pl;
          patch.likes = Object.values(pl).reduce((a, b) => a + b, 0);
        } else {
          patch.likes = parseInt(likes.replace(/[^0-9]/g, "") || "0", 10) || 0;
        }
      } else if (pages.length > 1) {
        const pv: Record<string, number> = {};
        pages.forEach((p) => { pv[p] = parseInt(pageViews[p]?.replace(/[^0-9]/g, "") || "0", 10) || 0; });
        patch.page_views = pv;
        patch.views = Object.values(pv).reduce((a, b) => a + b, 0);
      } else {
        patch.views = parseInt(views.replace(/[^0-9]/g, "") || "0", 10) || 0;
      }
      await PB_API[idea._playbook].updateIdea(idea.id, patch);
      toast.success("Idea updated.");
      onSaved(patch);
    } catch {
      toast.error("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fglass-panel" style={{ width: "min(520px, 100%)", padding: "22px 24px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Edit idea</h2>
          <button type="button" onClick={onClose} style={{ ...ghostBtnSm, border: "none", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Idea name *"><input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's the idea?" className="fglass-input" style={modalInput} /></Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
            <Field label={yt ? "YouTube link" : "Comp / YouTube link"}>
              <input value={refLink} onChange={(e) => setRefLink(e.target.value)} placeholder="Paste comp or YouTube link" className="fglass-input" style={modalInput} />
            </Field>
            <Field label="Timestamps"><input value={timestamps} onChange={(e) => setTimestamps(e.target.value)} placeholder="0:12, 1:45" className="fglass-input" style={modalInput} /></Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Content type">
              <select
                value={contentType}
                onChange={(e) => {
                  const next = e.target.value;
                  setContentType(next);
                  const nextLower = next.trim().toLowerCase();
                  const allowed = nextLower === "carousel" || nextLower === "static" ? CAROUSEL_FORMATS : REEL_VIDEO_FORMATS;
                  if (videoFormat && !(allowed as readonly string[]).includes(videoFormat)) setVideoFormat("");
                }}
                className="fglass-input"
                style={{ ...modalInput, colorScheme: "dark" }}
              >
                {["Reel", "Carousel", "Static"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                className="fglass-input"
                style={{ ...modalInput, colorScheme: "dark", cursor: "pointer" }}
              />
            </Field>
          </div>

          <Field label={editingLikesBased ? "Format" : "Video format"}>
            <FormatPills
              options={editingLikesBased ? CAROUSEL_FORMATS : REEL_VIDEO_FORMATS}
              value={videoFormat}
              onChange={setVideoFormat}
            />
          </Field>

          <Field label="Hooks & pages">
            <HookPageRows rows={pageHooks} onChange={setPageHooks} playbook={idea._playbook} />
          </Field>
          {editingLikesBased && (
            <Field label="Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Carousel / static body text"
                className="fglass-input"
                rows={4}
                style={{ ...modalInput, resize: "vertical", minHeight: 88 }}
              />
            </Field>
          )}

          {pages.length > 1 ? (
            <Field label={editingLikesBased ? "Likes by page" : "Views by page"}>
              <div style={{ display: "grid", gap: 8 }}>
                {pages.map((p) => (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--f-dim)", width: 140, flexShrink: 0 }}>@{p}</span>
                    <input
                      type="text" inputMode="numeric"
                      value={(editingLikesBased ? pageLikes : pageViews)[p] || ""}
                      onChange={(e) => (editingLikesBased ? setPageLikes : setPageViews)((m) => ({ ...m, [p]: e.target.value }))}
                      placeholder="0"
                      className="fglass-input" style={modalInput}
                    />
                  </div>
                ))}
              </div>
            </Field>
          ) : (
            <Field label={editingLikesBased ? "Likes" : "Views"}>
              <input
                type="text" inputMode="numeric"
                value={editingLikesBased ? likes : views}
                onChange={(e) => (editingLikesBased ? setLikes : setViews)(e.target.value)}
                placeholder="0"
                className="fglass-input" style={modalInput}
              />
            </Field>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <button type="button" disabled={busy} onClick={submit} style={primaryBtn}><Check size={14} strokeWidth={2} /> {busy ? "Saving…" : "Save changes"}</button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...ghostBtnSm, padding: "9px 14px" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--f-faint)", display: "block", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

/** Local date control — custom black/purple calendar (native picker can’t be themed). */
function PickDayControl({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (ymd: string) => void;
}) {
  const custom = value !== TODAY && value !== YESTERDAY && value !== TOMORROW;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          ...datePillBase,
          cursor: "pointer",
          color: custom ? "#e9d5ff" : "var(--f-dim)",
          borderColor: custom ? "rgba(167,139,250,.55)" : "var(--f-line)",
          background: custom ? "rgba(124,58,237,.14)" : "transparent",
        }}
      >
        <CalendarDays size={14} strokeWidth={1.6} color={custom ? "#a78bfa" : undefined} />
        {custom ? prettyDate(value) : "Pick a day"}
      </button>
      {open && (
        <>
          <div onClick={() => onOpenChange(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 81,
              padding: "10px 10px 8px",
              borderRadius: 14,
              background: "#0a0a0d",
              border: "1px solid rgba(167,139,250,.28)",
              boxShadow: "0 16px 40px -12px rgba(0,0,0,.85), 0 0 28px -14px rgba(124,58,237,.55)",
            }}
          >
            <DayCalendar
              mode="single"
              selected={new Date(`${value}T00:00:00`)}
              onSelect={(d) => {
                if (!d) return;
                onChange(ymd(d));
                onOpenChange(false);
              }}
              initialFocus
              className="idea-engine-cal text-zinc-200"
              classNames={{
                caption_label: "text-sm font-semibold text-zinc-100",
                head_cell: "text-zinc-500 rounded-md w-9 font-normal text-[0.75rem]",
                day: "h-9 w-9 p-0 font-normal text-zinc-300 hover:bg-violet-500/15 hover:text-violet-200 rounded-md aria-selected:opacity-100",
                day_selected:
                  "bg-[#7c3aed] text-white hover:bg-[#6d28d9] hover:text-white focus:bg-[#7c3aed] focus:text-white",
                day_today: "border border-[#a78bfa]/70 text-[#c4b5fd] aria-selected:border-transparent",
                day_outside: "text-zinc-600 opacity-50",
                day_disabled: "text-zinc-600 opacity-40",
                nav_button:
                  "h-7 w-7 bg-transparent p-0 text-zinc-400 border border-violet-500/25 hover:bg-violet-500/15 hover:text-violet-200 opacity-100",
              }}
            />
            <div style={{ display: "flex", gap: 8, padding: "4px 6px 2px", borderTop: "1px solid rgba(167,139,250,.18)", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { onChange(TODAY); onOpenChange(false); }}
                style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", padding: "6px 4px" }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => { onChange(YESTERDAY); onOpenChange(false); }}
                style={{ fontSize: 12, fontWeight: 500, color: "#a1a1aa", background: "none", border: "none", cursor: "pointer", padding: "6px 4px" }}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => { onChange(TOMORROW); onOpenChange(false); }}
                style={{ fontSize: 12, fontWeight: 500, color: "#a1a1aa", background: "none", border: "none", cursor: "pointer", padding: "6px 4px" }}
              >
                Tomorrow
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DatePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...datePillBase, cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? "#000" : "var(--f-dim)", borderColor: active ? "#fff" : "var(--f-line)", fontWeight: active ? 600 : 500 }}>
      {children}
    </button>
  );
}

function ReviewStat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: color || "var(--f-ink)", lineHeight: 1.15 }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ReviewBoard({
  scope, onScope, dayLabel, tally, typeTally, people,
}: {
  scope: "day" | "all";
  onScope: (s: "day" | "all") => void;
  dayLabel: string;
  tally: { approved: number; rejected: number; pending: number };
  typeTally: { reels: number; carousels: number; statics: number };
  people: PersonTally[];
}) {
  const th: React.CSSProperties = { fontWeight: 500, padding: "0 12px 8px 0", borderBottom: "1px solid var(--f-line)", color: "var(--f-faint)", fontSize: 12 };
  const td: React.CSSProperties = { padding: "7px 12px 7px 0", borderBottom: "1px solid var(--f-line)", color: "var(--f-dim)" };
  const seg = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: active ? 600 : 500,
    border: "none",
    background: active ? "#fff" : "transparent",
    color: active ? "#000" : "var(--f-dim)",
    cursor: "pointer",
    borderRadius: 7,
  });
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--f-line)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--f-dim)" }}>Review</div>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 9, border: "1px solid var(--f-line)" }}>
          <button type="button" style={seg(scope === "day")} onClick={() => onScope("day")}>{dayLabel}</button>
          <button type="button" style={seg(scope === "all")} onClick={() => onScope("all")}>All time</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: people.length ? 16 : 0 }}>
        <ReviewStat n={tally.approved} label="approved" color="#86efac" />
        <ReviewStat n={tally.rejected} label="rejected" color="#fca5a5" />
        <ReviewStat n={tally.pending} label="pending" />
        <ReviewStat n={typeTally.reels} label="reels" />
        <ReviewStat n={typeTally.carousels} label="carousels" />
        <ReviewStat n={typeTally.statics} label="statics" />
      </div>
      {people.length > 0 && (
        <div style={{ maxHeight: 260, overflowY: "auto", maxWidth: 480 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Name</th>
                <th style={{ ...th, textAlign: "right" }}>Added</th>
                <th style={{ ...th, textAlign: "right" }}>Approved</th>
                <th style={{ ...th, textAlign: "right" }}>Rejected</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <td style={{ ...td, color: "var(--f-ink)", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.added}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.approved ? "#86efac" : "var(--f-dim)" }}>{p.approved}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.rejected ? "#fca5a5" : "var(--f-dim)" }}>{p.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9, border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const ghostBtnSm: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "6px 11px", borderRadius: 8, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer" };
const sendBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", cursor: "pointer" };
const datePillBase: React.CSSProperties = { padding: "7px 13px", borderRadius: 9, fontSize: 12.5, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)" };
const modalInput: React.CSSProperties = { width: "100%", borderRadius: 9, padding: "9px 11px", fontSize: 13 };
