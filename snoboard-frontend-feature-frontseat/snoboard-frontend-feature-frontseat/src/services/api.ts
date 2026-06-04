const BASE_URL = import.meta.env.VITE_API_URL || "";

// Token is set by AuthContext when session changes
let _accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  _accessToken = token;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.detail || `API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// Pages
export const getPages = () => fetchApi<any[]>("/api/v1/pages");
export const createPage = (data: { handle: string; name?: string; auto_scrape?: boolean }) =>
  fetchApi<any>("/api/v1/pages", { method: "POST", body: JSON.stringify(data) });
export const updatePage = (id: string, data: { handle?: string; name?: string; auto_scrape?: boolean }) =>
  fetchApi<any>(`/api/v1/pages/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deletePage = (id: string) =>
  fetchApi<any>(`/api/v1/pages/${id}`, { method: "DELETE" });

// Posts
export const getPosts = () => fetchApi<any[]>("/api/v1/posts");
export const createPost = (data: { page_id: string; url: string; expected_views?: number; actual_views?: number; posted_at?: string; idea_id?: string }) =>
  fetchApi<any>("/api/v1/posts", { method: "POST", body: JSON.stringify(data) });
export const updatePost = (id: string, data: { page_id?: string; expected_views?: number; actual_views?: number; posted_at?: string }) =>
  fetchApi<any>(`/api/v1/posts/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deletePost = (id: string) =>
  fetchApi<any>(`/api/v1/posts/${id}`, { method: "DELETE" });

// Reels
export const getManualReels = () => fetchApi<any[]>("/api/v1/reels/manual");
export const getAutoReels = () => fetchApi<any[]>("/api/v1/reels/auto");
export const createReel = (data: { page_id: string; url: string; views?: number; posted_at?: string; auto_scrape?: boolean; idea_id?: string }) =>
  fetchApi<any>("/api/v1/reels", { method: "POST", body: JSON.stringify(data) });
export const updateReel = (id: string, data: { views?: number; posted_at?: string }) =>
  fetchApi<any>(`/api/v1/reels/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteReel = (id: string) =>
  fetchApi<any>(`/api/v1/reels/${id}`, { method: "DELETE" });

// Dashboard
export const getDashboard = () =>
  fetchApi<any>("/api/v1/dashboard");

// Page detail
export const getPageDetail = (pageId: string) =>
  fetchApi<any>(`/api/v1/pages/${pageId}/detail`);

// Dashboard Views (manual Instagram dashboard views)
export const upsertDashboardViews = (pageId: string, data: { reel_views?: number; post_views?: number; month?: string }) =>
  fetchApi<any>(`/api/v1/pages/${pageId}/dashboard-views`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// Scrape
export const triggerScrape = (sinceDate?: string) =>
  fetchApi<{ reels_updated: number; errors: string[] }>("/api/v1/scrape/reels", {
    method: "POST",
    body: JSON.stringify(sinceDate ? { since_date: sinceDate } : {}),
  });

// Content Strategists
export const getCSList = () => fetchApi<any[]>("/api/v1/cs");
export const createCS = (data: { name: string; role?: string }) =>
  fetchApi<any>("/api/v1/cs", { method: "POST", body: JSON.stringify(data) });
export const updateCS = (id: string, data: { name?: string; role?: string }) =>
  fetchApi<any>(`/api/v1/cs/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCS = (id: string) =>
  fetchApi<any>(`/api/v1/cs/${id}`, { method: "DELETE" });

// Ideas
export const getIdeas = () => fetchApi<any[]>("/api/v1/ideas");
export const createIdea = (data: { hook: string; cs_owner_id?: string; cdi_owner_id?: string; format?: string; source?: string; status?: string; notes?: string; distributed_to?: string[]; hook_variations?: string[]; executor_name?: string; created_by?: string; yt_url?: string; timestamps?: string; base_drive_link?: string; pintu_batch_link?: string; comp_link?: string; canva_link?: string; deadline?: string }) =>
  fetchApi<any>("/api/v1/ideas", { method: "POST", body: JSON.stringify(data) });
export const updateIdea = (id: string, data: Record<string, any>) =>
  fetchApi<any>(`/api/v1/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteIdea = (id: string) =>
  fetchApi<any>(`/api/v1/ideas/${id}`, { method: "DELETE" });

// Idea Engine Dashboard
export const getIdeaEngine = () => fetchApi<any>("/api/v1/idea-engine");

// Content Entries
export const getAllContentEntries = (contentType?: string) =>
  fetchApi<any[]>(`/api/v1/content-entries${contentType ? `?content_type=${contentType}` : ""}`);
export const getContentEntries = (pageId: string) => fetchApi<any[]>(`/api/v1/pages/${pageId}/content-entries`);
export const createContentEntry = (data: any) => fetchApi<any>("/api/v1/content-entries", { method: "POST", body: JSON.stringify(data) });
export const updateContentEntry = (id: string, data: any) => fetchApi<any>(`/api/v1/content-entries/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteContentEntry = (id: string) => fetchApi<any>(`/api/v1/content-entries/${id}`, { method: "DELETE" });

// Content Tracker
export const getTrackerNiches = () => fetchApi<any[]>("/api/v1/tracker/niches");
export const createTrackerNiche = (data: { name: string; pages: string[] }) =>
  fetchApi<any>("/api/v1/tracker/niches", { method: "POST", body: JSON.stringify(data) });
export const updateTrackerNiche = (id: string, data: { name?: string; pages?: string[] }) =>
  fetchApi<any>(`/api/v1/tracker/niches/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteTrackerNiche = (id: string) =>
  fetchApi<any>(`/api/v1/tracker/niches/${id}`, { method: "DELETE" });

export const getTrackerIdeas = (type?: string) => fetchApi<any[]>(`/api/v1/tracker/ideas${type ? `?type=${type}` : ""}`);

export type BandwidthMetricKey =
  | "reel_comp" | "reel_og" | "reel_base_edits" | "reel_testing"
  | "reel_pintu" | "reel_posted" | "reel_killed"
  | "post_comp" | "post_og" | "post_mm" | "post_edits" | "post_posted";

export type BandwidthTotals = Record<BandwidthMetricKey, number>;

export type BandwidthDailyRow = { date: string } & Record<BandwidthMetricKey, number>;

export type BandwidthPerson = {
  name: string;
  niche_guess: "garfields" | "goofies" | "unassigned";
  niche_counts: { garfields: number; goofies: number; unassigned: number };
  totals: BandwidthTotals;
  daily: BandwidthDailyRow[];
};

export type BandwidthData = {
  window_start: string;
  window_end: string;
  days: number;
  type: string | null;
  all_days: string[];
  metric_keys: BandwidthMetricKey[];
  people: BandwidthPerson[];
  team_totals: Record<"garfields" | "goofies" | "unassigned", BandwidthTotals>;
};

export const getBandwidth = (
  days: number = 14,
  type?: string,
  start?: string,
  end?: string,
) => {
  const qs = new URLSearchParams();
  // When a custom range is provided, the backend ignores `days` — but we
  // still send it so the URL doubles as a readable cache key.
  qs.set("days", String(days));
  if (type) qs.set("type", type);
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  return fetchApi<BandwidthData>(`/api/v1/bandwidth?${qs.toString()}`);
};

export const getTeamsPerformance = () =>
  fetchApi<{
    teams: any[];
    leader_key: string | null;
    leader_margin_views_6d?: number;
    leader_margin_views_total?: number;
    top_idea_overall?: any;
    top_idea_6d?: any;
    top_creator_6d?: any;
    people?: any[];
    /** @deprecated use views_period_days; kept for older clients */
    window_days?: number;
    views_period?: "calendar_month" | "rolling";
    views_period_days?: number;
  }>("/api/v1/teams/performance");

export const createTrackerIdea = (data: any) =>
  fetchApi<any>("/api/v1/tracker/ideas", { method: "POST", body: JSON.stringify(data) });
export const updateTrackerIdea = (id: string, data: any) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteTrackerIdea = (id: string) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${id}`, { method: "DELETE" });

export const getTrackerIdeaCloudinarySign = (ideaId: string, data: { uploader?: string }) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${ideaId}/cloudinary-sign`, { method: "POST", body: JSON.stringify(data) });

/**
 * Temporary compat: prod backend may not have the tracker idea signing endpoint yet.
 * If it 404s, fall back to the Tickets signer (it doesn't validate ticket existence).
 */
export async function signTrackerIdeaUploadCompat(ideaId: string, data: { uploader?: string }) {
  const path = `/api/v1/tracker/ideas/${ideaId}/cloudinary-sign`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
    },
    body: JSON.stringify(data || {}),
  });
  if (res.ok) {
    const json = await res.json();
    return json.data ?? json;
  }
  if (res.status === 404) {
    // use tickets signer as fallback
    const ticket_number = String(ideaId).replace(/[^0-9]/g, "").slice(0, 6) || "0";
    const payload = {
      ticket_id: ideaId,
      ticket_number,
      uploader: data?.uploader,
    };
    const json = await fetchApi<any>("/api/v1/tickets/cloudinary-sign", { method: "POST", body: JSON.stringify(payload) });
    return json;
  }
  const errBody = await res.json().catch(() => null);
  throw new Error(errBody?.detail || `API error: ${res.status}`);
}

export const createTrackerPosting = (ideaId: string, data: any) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${ideaId}/postings`, { method: "POST", body: JSON.stringify(data) });
export const updateTrackerPosting = (id: string, data: any) =>
  fetchApi<any>(`/api/v1/tracker/postings/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteTrackerPosting = (id: string) =>
  fetchApi<any>(`/api/v1/tracker/postings/${id}`, { method: "DELETE" });

// Competitor Research
export type CompetitorCategory = "fbs_reels" | "tech_reels" | "fbs_posts";
export const getCompetitorContent = (category: CompetitorCategory, bucket?: string) =>
  fetchApi<any[]>(`/api/v1/competitor/${category}${bucket ? `?bucket=${encodeURIComponent(bucket)}` : ""}`);
export const updateCompetitorEntry = (category: CompetitorCategory, id: string, data: Record<string, any>) =>
  fetchApi<any>(`/api/v1/competitor/${category}/${id}`, { method: "PUT", body: JSON.stringify(data) });

// Scheduling
export const scheduleIdea = (ideaId: string) =>
  fetchApi<any>(`/api/v1/schedule-idea/${ideaId}`, { method: "POST" });

// 6-Day Performance Tracker
export const getSixDayMonth = (month: string) =>
  fetchApi<any>(`/api/v1/six-day/month/${month}`);

export const upsertSixDayEntry = (data: {
  month: string; cycle_number: number; page_id: string;
  views?: number; filled_by?: string;
  reel_pct?: number | null; post_pct?: number | null;
  reel_perf?: number | null; post_perf?: number | null;
}) => fetchApi<any>("/api/v1/six-day/entries", { method: "POST", body: JSON.stringify(data) });

export const bulkSaveSixDayEntries = (data: {
  month: string; cycle_number: number; filled_by?: string;
  entries: { page_id: string; views: number }[];
}) => fetchApi<any>("/api/v1/six-day/entries/bulk", { method: "POST", body: JSON.stringify(data) });

export const deleteSixDayEntry = (id: string) =>
  fetchApi<any>(`/api/v1/six-day/entries/${id}`, { method: "DELETE" });

export const createSixDayTopContent = (data: {
  month: string; cycle_number: number; link: string;
  views?: number; page_handle?: string; page_id?: string; content_type?: string;
  perf_tag?: string;
}) => fetchApi<any>("/api/v1/six-day/top-content", { method: "POST", body: JSON.stringify(data) });
export const updateSixDayTopContent = (id: string, data: Record<string, any>) =>
  fetchApi<any>(`/api/v1/six-day/top-content/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSixDayTopContent = (id: string) =>
  fetchApi<any>(`/api/v1/six-day/top-content/${id}`, { method: "DELETE" });

export const upsertSixDayActual = (data: {
  month: string; page_id: string; actual_views: number;
  filled_by?: string; notes?: string;
}) => fetchApi<any>("/api/v1/six-day/actuals", { method: "POST", body: JSON.stringify(data) });

export const getSixDayConfig = () => fetchApi<any>("/api/v1/six-day/config");
export const setSixDayConfig = (data: { assigned_email?: string; assigned_role?: string }) =>
  fetchApi<any>("/api/v1/six-day/config", { method: "POST", body: JSON.stringify(data) });

export const getSixDayDeadlines = () => fetchApi<any>("/api/v1/six-day/deadlines");

export const getSixDayPageData = (pageId: string, month?: string) =>
  fetchApi<any>(`/api/v1/six-day/page/${pageId}${month ? `?month=${month}` : ""}`);

// Weekly workboard — roster + activity (for @mentions)
export type WorkboardMentionPerson = {
  display: string;
  role_id: string | null;
  email: string | null;
  is_content_strategist?: boolean;
};

export const getWorkboardMentionCandidates = () =>
  fetchApi<{ people: WorkboardMentionPerson[] }>("/api/v1/workboard/mention-candidates");

// Weekly workboard — shared board persistence
export type WorkboardWeek = { week_start: string; assignments: any[] };

export const getWorkboardWeek = (weekStart: string) =>
  fetchApi<WorkboardWeek>(`/api/v1/workboard?week_start=${encodeURIComponent(weekStart)}`);

export const saveWorkboardWeek = (weekStart: string, assignments: any[]) =>
  fetchApi<WorkboardWeek>(`/api/v1/workboard?week_start=${encodeURIComponent(weekStart)}`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  });

// Tickets (v1)
export type TicketStatus = "not_started" | "in_progress" | "resolved";
export type TicketUrgency = "low" | "normal" | "urgent";

export type TicketAttachment = {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video" | "raw" | "auto" | string;
  bytes?: number;
  format?: string;
  original_filename?: string;
  created_at?: string;
  expires_at?: string;
};

export type Ticket = {
  id: string;
  ticket_number?: number;
  title?: string;
  description: string;
  urgency: TicketUrgency | string;
  status: TicketStatus | string;
  tags: string[];
  reporter_email?: string | null;
  assigned_to_email?: string | null;
  attachments: TicketAttachment[];
  created_at?: string;
  updated_at?: string;
  resolved_at?: string | null;
};

export const getTickets = (filters?: {
  status?: TicketStatus | string;
  urgency?: TicketUrgency | string;
  assigned_to_email?: string;
  reporter_email?: string;
}) => {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set("status", filters.status);
  if (filters?.urgency) qs.set("urgency", filters.urgency);
  if (filters?.assigned_to_email) qs.set("assigned_to_email", filters.assigned_to_email);
  if (filters?.reporter_email) qs.set("reporter_email", filters.reporter_email);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return fetchApi<Ticket[]>(`/api/v1/tickets${suffix}`);
};

export const getTicket = (id: string) => fetchApi<Ticket>(`/api/v1/tickets/${id}`);

export const createTicket = (data: {
  title?: string;
  description: string;
  urgency?: TicketUrgency | string;
  status?: TicketStatus | string;
  tags?: string[];
  reporter_email?: string;
  assigned_to_email?: string | null;
  attachments?: TicketAttachment[];
}) => fetchApi<Ticket>("/api/v1/tickets", { method: "POST", body: JSON.stringify(data) });

export const patchTicket = (id: string, data: Partial<Pick<Ticket,
  "title" | "description" | "urgency" | "status" | "tags" | "assigned_to_email" | "attachments" | "resolved_at"
>>) => fetchApi<Ticket>(`/api/v1/tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteTicket = (id: string) => fetchApi<Ticket>(`/api/v1/tickets/${id}`, { method: "DELETE" });

export type CloudinarySignedUpload = {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  upload_url: string;
  folder: string;
  tags: string;
  context: string;
  expires_at: string;
};

export const signTicketCloudinaryUpload = (data: {
  ticket_id: string;
  ticket_number: number | string;
  uploader?: string;
}) => fetchApi<CloudinarySignedUpload>("/api/v1/tickets/cloudinary-sign", { method: "POST", body: JSON.stringify(data) });

// Deadlines
export const getDeadlines = (role?: string) =>
  fetchApi<any[]>(role ? `/api/v1/deadlines/${encodeURIComponent(role)}` : "/api/v1/deadlines");

// User Roles
export const getUserRole = (email: string) => fetchApi<any>(`/api/v1/user-role/${encodeURIComponent(email)}`);
export const setUserRole = (data: { email: string; role: string; name?: string }) =>
  fetchApi<any>("/api/v1/user-role", { method: "POST", body: JSON.stringify(data) });
export const getAllUserRoles = () => fetchApi<{ email: string; name: string; role: string }[]>("/api/v1/user-roles");

// Idea Thread — assignments + comments
export const getIdeaAssignments = (ideaId: string) => fetchApi<any[]>(`/api/v1/ideas/${ideaId}/assignments`);
export const addIdeaAssignment = (ideaId: string, data: { assignee_email: string; assignee_name: string; assigned_by_email: string }) =>
  fetchApi<any>(`/api/v1/ideas/${ideaId}/assignments`, { method: "POST", body: JSON.stringify(data) });
export const removeIdeaAssignment = (ideaId: string, assignmentId: string) =>
  fetchApi<any>(`/api/v1/ideas/${ideaId}/assignments/${assignmentId}`, { method: "DELETE" });
export const getIdeaComments = (ideaId: string) => fetchApi<any[]>(`/api/v1/ideas/${ideaId}/comments`);
export const postIdeaComment = (ideaId: string, data: { author_email: string; author_name: string; text: string; type: string; tracker_type?: string; attachment_url?: string }) =>
  fetchApi<any>(`/api/v1/ideas/${ideaId}/comments`, { method: "POST", body: JSON.stringify(data) });
export const deleteIdeaComment = (ideaId: string, commentId: string) =>
  fetchApi<any>(`/api/v1/ideas/${ideaId}/comments/${commentId}`, { method: "DELETE" });

// Notifications
export const getNotifications = (email: string) =>
  fetchApi<any[]>(`/api/v1/notifications?email=${encodeURIComponent(email)}`);
export const markAllNotificationsRead = (email: string) =>
  fetchApi<any>(`/api/v1/notifications/read-all?email=${encodeURIComponent(email)}`, { method: "PATCH" });

// Blue Ocean Ideas — direct Supabase (bypasses backend, works without redeploy)
import { supabase as _sb } from "@/lib/supabase";

export const blueOceanGenerateArticles = (data: { niche?: string }) =>
  fetchApi<any[]>("/api/v1/blue-ocean/generate-articles", { method: "POST", body: JSON.stringify(data) });

export const blueOceanGenerateInstagram = (data: { niche?: string }) =>
  fetchApi<any[]>("/api/v1/blue-ocean/generate-instagram", { method: "POST", body: JSON.stringify(data) });

export async function getBlueOceanIdeas(params?: { type?: string; status?: string }): Promise<any[]> {
  let q = _sb.from("blue_ocean_ideas").select("*").order("created_at", { ascending: false });
  if (params?.type) q = q.eq("type", params.type);
  if (params?.status) q = q.eq("status", params.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createBlueOceanIdea(row: {
  type: string; source?: string; headline_or_hook: string;
  format_tag?: string; why_evergreen?: string; outline_or_slides?: any;
  hook_formula?: string; status?: string; source_account?: string; engagement_data?: any;
}): Promise<any> {
  const insert: Record<string, any> = { status: "saved", ...row };
  Object.keys(insert).forEach((k) => insert[k] === undefined && delete insert[k]);
  const { data, error } = await _sb.from("blue_ocean_ideas").insert(insert).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateBlueOceanIdea(id: string, updates: Record<string, any>): Promise<any> {
  const { data, error } = await _sb
    .from("blue_ocean_ideas")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBlueOceanIdea(id: string): Promise<void> {
  const { error } = await _sb.from("blue_ocean_ideas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const APIFY_TOKEN = import.meta.env.VITE_APIFY_TOKEN as string;
const APIFY_ACTOR_ID = import.meta.env.VITE_APIFY_ACTOR_ID as string;

function apifyPostType(rawType: string): "carousel" | "static" | "reel" {
  const t = (rawType || "").toLowerCase();
  if (t.includes("sidecar") || t.includes("carousel")) return "carousel";
  if (t.includes("video") || t.includes("reel")) return "reel";
  return "static";
}

export async function blueOceanScrape(data: {
  accounts: string[]; date_from?: string; date_to?: string;
  post_type?: string; results_limit?: number;
}): Promise<{ job_id: string; posts_found: number }> {
  if (!APIFY_TOKEN || !APIFY_ACTOR_ID) throw new Error("Apify credentials not configured");

  // Create job record in Supabase
  const { data: jobRow, error: jobErr } = await _sb
    .from("blue_ocean_scrape_jobs")
    .insert({
      accounts: data.accounts,
      date_from: data.date_from,
      date_to: data.date_to,
      post_type: data.post_type || "all",
      status: "running",
    })
    .select()
    .single();
  if (jobErr) throw new Error(jobErr.message);
  const jobId = jobRow.id;

  try {
    // Build Apify input — actor expects "username" array
    const apifyInput: Record<string, any> = {
      username: data.accounts,
      resultsType: "posts",
      resultsLimit: data.results_limit ?? 50,
      addParentData: false,
    };
    if (data.date_from) apifyInput.onlyPostsNewerThan = data.date_from;
    if (data.date_to) apifyInput.onlyPostsOlderThan = data.date_to;

    // Start the Apify run
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apifyInput) }
    );
    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Apify start failed: ${startRes.status} — ${err}`);
    }
    const startData = await startRes.json();
    const runId: string = startData.data?.id;
    const defaultDatasetId: string = startData.data?.defaultDatasetId;
    if (!runId) throw new Error("Apify did not return a run ID");

    // Poll for completion (max 6 min, 5s intervals)
    let status = startData.data?.status ?? "RUNNING";
    let datasetId = defaultDatasetId;
    let elapsed = 0;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && elapsed < 360_000) {
      await new Promise((r) => setTimeout(r, 5000));
      elapsed += 5000;
      const statusRes = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (statusRes.ok) {
        const sd = await statusRes.json();
        status = sd.data?.status ?? status;
        datasetId = sd.data?.defaultDatasetId ?? datasetId;
      }
    }

    if (status !== "SUCCEEDED") {
      await _sb.from("blue_ocean_scrape_jobs").update({ status: "failed", error: `Apify run status: ${status}` }).eq("id", jobId);
      throw new Error(`Apify run did not succeed (status: ${status})`);
    }

    // Fetch dataset items
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=500`
    );
    if (!itemsRes.ok) throw new Error(`Failed to fetch Apify results: ${itemsRes.status}`);
    const items: any[] = await itemsRes.json();

    // Normalise & filter
    const wantType = data.post_type || "all";
    const posts = items
      .map((item) => {
        const rawType = item.type || item.productType || item.mediaType || "";
        const postType = apifyPostType(rawType);
        const handle =
          item.ownerUsername || item.owner?.username || item.username ||
          (item.url || "").match(/instagram\.com\/([^/]+)/)?.[1] || "unknown";
        return {
          job_id: jobId,
          account_handle: handle,
          url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
          caption: item.caption || item.captionText || item.text || "",
          thumbnail_url: item.displayUrl || item.thumbnailUrl || item.imageUrl || item.previewUrl || "",
          post_type: postType,
          likes: item.likesCount ?? item.likes ?? 0,
          comments: item.commentsCount ?? item.comments ?? 0,
          views: item.videoViewCount ?? item.videoPlayCount ?? item.viewCount ?? 0,
          posted_at: item.timestamp
            ? new Date(item.timestamp).toISOString().slice(0, 10)
            : item.takenAtTimestamp
            ? new Date(item.takenAtTimestamp * 1000).toISOString().slice(0, 10)
            : null,
          is_blue_ocean: false,
        };
      })
      .filter((p) => {
        if (wantType === "carousels") return p.post_type === "carousel";
        if (wantType === "statics") return p.post_type === "static";
        return true;
      });

    // Bulk insert posts
    if (posts.length > 0) {
      const { error: insertErr } = await _sb.from("blue_ocean_scraped_posts").insert(posts);
      if (insertErr) throw new Error(insertErr.message);
    }

    // Mark job done
    await _sb.from("blue_ocean_scrape_jobs").update({
      status: "done",
      posts_found: posts.length,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    return { job_id: jobId, posts_found: posts.length };
  } catch (err: any) {
    await _sb.from("blue_ocean_scrape_jobs").update({ status: "failed", error: err?.message }).eq("id", jobId);
    throw err;
  }
}

export async function getBlueOceanScrapeJobs(): Promise<any[]> {
  const { data, error } = await _sb
    .from("blue_ocean_scrape_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBlueOceanScrapedPosts(params?: {
  job_id?: string; post_type?: string; is_blue_ocean?: boolean; sort?: string;
}): Promise<any[]> {
  const ascending = params?.sort === "posted_at_asc";
  const rawCol = params?.sort?.replace("_asc", "") ?? "likes";
  const sortCol = ["likes","comments","views","posted_at","created_at"].includes(rawCol) ? rawCol : "likes";
  let q = _sb.from("blue_ocean_scraped_posts").select("*").order(sortCol, { ascending }).limit(500);
  if (params?.job_id) q = q.eq("job_id", params.job_id);
  if (params?.post_type && params.post_type !== "all") q = q.eq("post_type", params.post_type);
  if (params?.is_blue_ocean !== undefined) q = q.eq("is_blue_ocean", params.is_blue_ocean);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateBlueOceanScrapedPost(id: string, updates: { is_blue_ocean?: boolean; post_type?: string }): Promise<void> {
  const { error } = await _sb.from("blue_ocean_scraped_posts").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBlueOceanScrapedPost(id: string): Promise<void> {
  const { error } = await _sb.from("blue_ocean_scraped_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Experiment X ---
export const getExpSettings = () =>
  fetchApi<any>("/api/v1/experiment/settings");

export const updateExpSettings = (data: { view_goal?: number; experiment_start_date?: string }) =>
  fetchApi<any>("/api/v1/experiment/settings", { method: "PATCH", body: JSON.stringify(data) });

export const getExpIdeaBank = (params?: { week?: number; page?: string }) => {
  const q = new URLSearchParams();
  if (params?.week != null) q.set("week", String(params.week));
  if (params?.page) q.set("page", params.page);
  const qs = q.toString();
  return fetchApi<any[]>(`/api/v1/experiment/idea-bank${qs ? `?${qs}` : ""}`);
};

export const createExpIdea = (data: {
  page_handle: string; content_type?: string; topic?: string;
  script?: string; status?: string; views?: number; day_date?: string;
}) => fetchApi<any>("/api/v1/experiment/idea-bank", { method: "POST", body: JSON.stringify(data) });

export const updateExpIdea = (id: string, data: {
  page_handle?: string; content_type?: string; topic?: string;
  script?: string; status?: string; views?: number; day_date?: string;
}) => fetchApi<any>(`/api/v1/experiment/idea-bank/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteExpIdea = (id: string) =>
  fetchApi<any>(`/api/v1/experiment/idea-bank/${id}`, { method: "DELETE" });

export const archiveExpWeek = (week_number: number) =>
  fetchApi<any>("/api/v1/experiment/idea-bank/archive", { method: "POST", body: JSON.stringify({ week_number }) });

export const getExpContentBank = (params?: { week?: number; page?: string }) => {
  const q = new URLSearchParams();
  if (params?.week != null) q.set("week", String(params.week));
  if (params?.page) q.set("page", params.page);
  const qs = q.toString();
  return fetchApi<any[]>(`/api/v1/experiment/content-bank${qs ? `?${qs}` : ""}`);
};

export const getExpContentBankWeeks = () =>
  fetchApi<any[]>("/api/v1/experiment/content-bank/weeks");

export const getExpWorkingIdeas = (params?: { week?: number; page?: string }) => {
  const q = new URLSearchParams();
  if (params?.week != null) q.set("week", String(params.week));
  if (params?.page) q.set("page", params.page);
  const qs = q.toString();
  return fetchApi<any[]>(`/api/v1/experiment/working-ideas${qs ? `?${qs}` : ""}`);
};

export const distributeExpWorkingIdea = (id: string) =>
  fetchApi<any>(`/api/v1/experiment/working-ideas/${id}/distribute`, { method: "POST" });
