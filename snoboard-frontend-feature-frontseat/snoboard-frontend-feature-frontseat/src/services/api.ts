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

export const getTeamsPerformance = () =>
  fetchApi<{ teams: any[]; leader_key: string | null }>("/api/v1/teams/performance");

export const createTrackerIdea = (data: any) =>
  fetchApi<any>("/api/v1/tracker/ideas", { method: "POST", body: JSON.stringify(data) });
export const updateTrackerIdea = (id: string, data: any) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteTrackerIdea = (id: string) =>
  fetchApi<any>(`/api/v1/tracker/ideas/${id}`, { method: "DELETE" });

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
  reel_perf_tag?: string | null; post_perf_tag?: string | null;
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

// Deadlines
export const getDeadlines = (role?: string) =>
  fetchApi<any[]>(role ? `/api/v1/deadlines/${encodeURIComponent(role)}` : "/api/v1/deadlines");

// User Roles
export const getUserRole = (email: string) => fetchApi<any>(`/api/v1/user-role/${encodeURIComponent(email)}`);
export const setUserRole = (data: { email: string; role: string; name?: string }) =>
  fetchApi<any>("/api/v1/user-role", { method: "POST", body: JSON.stringify(data) });

// Chat
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponseData {
  type: "text" | "chart";
  content: string;
  chart_type?: "bar" | "line" | "pie";
  title?: string;
  data?: Record<string, any>[];
  data_keys?: { xKey: string; yKeys: string[] };
}

export const sendChatMessage = (message: string, history: ChatMessage[]) =>
  fetchApi<ChatResponseData>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
