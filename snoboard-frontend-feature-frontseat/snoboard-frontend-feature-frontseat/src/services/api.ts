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
export const createIdea = (data: { hook: string; cs_owner_id?: string; cdi_owner_id?: string; format?: string; source?: string; status?: string; notes?: string; distributed_to?: string[] }) =>
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
