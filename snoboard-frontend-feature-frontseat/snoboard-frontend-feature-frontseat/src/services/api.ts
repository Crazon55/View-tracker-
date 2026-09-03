const BASE_URL = import.meta.env.VITE_API_URL || "";

// Token is set by AuthContext when session changes
let _accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  _accessToken = token;
}
export function getAccessToken() {
  return _accessToken;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
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
    const detail = errBody?.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ")
          : errBody?.message
            ? String(errBody.message)
            : res.status === 502 || res.status === 504
              ? "Backend unavailable — redeploy the API on EC2"
              : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const json = await res.json();
  const payload = json.data ?? json;
  if (payload === null || payload === undefined) {
    throw new Error(`Empty response from ${path}`);
  }
  return payload;
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

// @mention roster (Tickets and similar)
export type WorkboardMentionPerson = {
  display: string;
  role_id: string | null;
  email: string | null;
  is_content_strategist?: boolean;
};

export const getWorkboardMentionCandidates = () =>
  fetchApi<{ people: WorkboardMentionPerson[] }>("/api/v1/workboard/mention-candidates");

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
export const deleteUserRole = (email: string) =>
  fetchApi<any>("/api/v1/user-role/remove", { method: "POST", body: JSON.stringify({ email }) });
export const cleanupTeamRoles = () =>
  fetchApi<{ user_roles: { removed: string[]; updated: string[] }; content_strategists: { removed: string[] } }>(
    "/api/v1/user-roles/cleanup",
    { method: "POST" },
  );
export const getAllUserRoles = () => fetchApi<{ email: string; name: string; role: string }[]>("/api/v1/user-roles");

// Role → per-area access matrices (unified RBAC overrides)
export const getRoleAccess = () =>
  fetchApi<Record<string, Record<string, string>>>("/api/v1/role-access");
export const setRoleAccess = (role: string, access: Record<string, string>) =>
  fetchApi<{ role: string; access: Record<string, string> }>(
    `/api/v1/role-access/${encodeURIComponent(role)}`,
    { method: "PUT", body: JSON.stringify({ access }) },
  );

// Per-person access mode ("edit" = full role, "view" = read-only)
export const getUserAccessModes = () =>
  fetchApi<Record<string, string>>("/api/v1/user-access-mode");
export const setUserAccessMode = (email: string, mode: "edit" | "view") =>
  fetchApi<{ email: string; mode: string }>("/api/v1/user-access-mode", {
    method: "PUT",
    body: JSON.stringify({ email, mode }),
  });

// Per-person area-access matrices
export const getUserAccess = () =>
  fetchApi<Record<string, Record<string, string>>>("/api/v1/user-access");
export const setUserAccess = (email: string, access: Record<string, string>) =>
  fetchApi<{ email: string; access: Record<string, string> }>("/api/v1/user-access", {
    method: "PUT",
    body: JSON.stringify({ email, access }),
  });

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

// --- Playbook Experiments (BPB / XF / TECH) ---
export type ExpApi = ReturnType<typeof createExpApi>;

export function createExpApi(playbook: string) {
  const base = `/api/v1/experiment/${playbook}`;
  return {
    getSettings: () => fetchApi<any>(`${base}/settings`),
    updateSettings: (data: { view_goal?: number; experiment_start_date?: string }) =>
      fetchApi<any>(`${base}/settings`, { method: "PATCH", body: JSON.stringify(data) }),
    getIdeaBank: (params?: { week?: number; page?: string; day_date?: string; pending_only?: boolean; top_performers?: boolean; enrich_cross?: boolean; review_score?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.top_performers) q.set("top_performers", "1");
      else if (params?.pending_only) q.set("pending_only", "1");
      else if (params?.review_score) q.set("review_score", "1");
      else if (params?.day_date) q.set("day_date", params.day_date);
      else if (params?.week != null) q.set("week", String(params.week));
      if (params?.page) q.set("page", params.page);
      if (params?.enrich_cross === false) q.set("enrich_cross", "0");
      const qs = q.toString();
      return fetchApi<any[]>(`${base}/idea-bank${qs ? `?${qs}` : ""}`);
    },
    getIdeaById: (id: string) => fetchApi<any>(`${base}/idea-bank/${id}`),
    createIdea: (data: {
      page_handle: string; content_type?: string; topic?: string;
      script?: string; status?: string; views?: number; day_date?: string;
      frontseat_pool?: boolean; source_pool_id?: string;
      source?: string; video_format?: string; content_format?: string; comp_link?: string;
      yt_url?: string; yt_timestamps?: string; frame_link?: string;
      kalakar_link?: string; drive_link?: string; submission_link?: string; created_by?: string;
      origin_playbook?: string; origin_idea_id?: string; assigned_to?: string;
    }) => fetchApi<any>(`${base}/idea-bank`, { method: "POST", body: JSON.stringify(data) }),
    updateIdea: (id: string, data: Record<string, unknown>) =>
      fetchApi<any>(`${base}/idea-bank/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteIdea: (id: string) => fetchApi<any>(`${base}/idea-bank/${id}`, { method: "DELETE" }),
    archiveWeek: (week_number: number) =>
      fetchApi<any>(`${base}/idea-bank/archive`, { method: "POST", body: JSON.stringify({ week_number }) }),
    migratePostedToProven: () =>
      fetchApi<any>(`${base}/idea-bank/migrate-posted-to-proven`, { method: "POST" }),
    getContentBank: (params?: { week?: number; page?: string }) => {
      const q = new URLSearchParams();
      if (params?.week != null) q.set("week", String(params.week));
      if (params?.page) q.set("page", params.page);
      const qs = q.toString();
      return fetchApi<any[]>(`${base}/content-bank${qs ? `?${qs}` : ""}`);
    },
    updateContentBankItem: (id: string, data: Record<string, unknown>) =>
      fetchApi<any>(`${base}/content-bank/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    getContentBankWeeks: () => fetchApi<any[]>(`${base}/content-bank/weeks`),
    getWorkingIdeas: (params?: { week?: number; page?: string }) => {
      const q = new URLSearchParams();
      if (params?.week != null) q.set("week", String(params.week));
      if (params?.page) q.set("page", params.page);
      const qs = q.toString();
      return fetchApi<any[]>(`${base}/working-ideas${qs ? `?${qs}` : ""}`);
    },
    distributeWorkingIdea: (id: string) =>
      fetchApi<any>(`${base}/working-ideas/${id}/distribute`, { method: "POST" }),
  };
}

/** Deploy an idea into another playbook (name + links only; views/baselines stay separate). */
export function deployExpIdeaToPlaybook(
  targetPlaybook: string,
  sourcePlaybook: string,
  sourceIdeaId: string,
) {
  return fetchApi<any>(
    `/api/v1/experiment/${targetPlaybook}/idea-bank/deploy-from/${sourcePlaybook}/${sourceIdeaId}`,
    { method: "POST" },
  );
}

/** @deprecated Use createExpApi("bpb") via playbook context */
export const getExpSettings = () => createExpApi("bpb").getSettings();
export const updateExpSettings = (data: { view_goal?: number; experiment_start_date?: string }) =>
  createExpApi("bpb").updateSettings(data);
export const getExpIdeaBank = (params?: { week?: number; page?: string; day_date?: string }) =>
  createExpApi("bpb").getIdeaBank(params);
export const getExpIdeaById = (id: string) => createExpApi("bpb").getIdeaById(id);
export const createExpIdea = (data: Parameters<ExpApi["createIdea"]>[0]) => createExpApi("bpb").createIdea(data);
export const updateExpIdea = (id: string, data: Record<string, unknown>) => createExpApi("bpb").updateIdea(id, data);
export const deleteExpIdea = (id: string) => createExpApi("bpb").deleteIdea(id);
export const archiveExpWeek = (week_number: number) => createExpApi("bpb").archiveWeek(week_number);
export const migratePostedToProven = () => createExpApi("bpb").migratePostedToProven();
export const getExpContentBank = (params?: { week?: number; page?: string }) =>
  createExpApi("bpb").getContentBank(params);
export const updateExpContentBankItem = (id: string, data: Record<string, unknown>) =>
  createExpApi("bpb").updateContentBankItem(id, data);
export const getExpContentBankWeeks = () => createExpApi("bpb").getContentBankWeeks();
export const getExpWorkingIdeas = (params?: { week?: number; page?: string }) =>
  createExpApi("bpb").getWorkingIdeas(params);
export const distributeExpWorkingIdea = (id: string) => createExpApi("bpb").distributeWorkingIdea(id);
