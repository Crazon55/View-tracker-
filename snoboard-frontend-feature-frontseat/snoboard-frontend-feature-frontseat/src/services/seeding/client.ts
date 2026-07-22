// ─────────────────────────────────────────────────────────────────────────────
// Seeding API client — axios-compatible shim over fetch so the FS-Seeding pages
// port with minimal edits (they call api.get(path,{params}).then(({data})=>…)).
// Preserves the session_token + X-Impersonate-As behaviour from FS-Seeding.
// Mock is OPT-IN: set VITE_SEEDING_MOCK=true for local fixtures only.
// ─────────────────────────────────────────────────────────────────────────────
import { mockSeedingGet, mockSeedingPatch, mockSeedingPost, mockSeedingDelete } from "./mockData";
import { getAccessToken } from "../api"; // shared FSOS Supabase access token

function resolveSeedingBase(): string {
  const explicit = import.meta.env.VITE_SEEDING_API as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const apiRoot =
    (import.meta.env.VITE_API_URL as string | undefined) ||
    (import.meta.env.VITE_BASE_API_URL as string | undefined) ||
    "";
  if (apiRoot) return `${apiRoot.replace(/\/$/, "")}/api/seeding`;
  return "/api/seeding";
}

const BASE = resolveSeedingBase();
// Default OFF so production writes hit Postgres. Opt in with VITE_SEEDING_MOCK=true.
const USE_MOCK = import.meta.env.VITE_SEEDING_MOCK === "true";
const PREVIEW_KEY = "preview_as_email";

type Cfg = { params?: Record<string, unknown>; headers?: Record<string, string> };

function buildUrl(path: string, params?: Record<string, unknown>) {
  if (!params) return `${BASE}${path}`;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
  }
  const qs = q.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ""}`;
}

function buildHeaders(extra?: Record<string, string>) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...(extra || {}) };
  const token = getAccessToken(); // FSOS Supabase JWT (shared login)
  if (token) h.Authorization = `Bearer ${token}`;
  const preview = localStorage.getItem(PREVIEW_KEY);
  if (preview) h["X-Impersonate-As"] = preview;
  return h;
}

async function req<T>(method: string, path: string, body?: unknown, cfg?: Cfg): Promise<{ data: T }> {
  if (USE_MOCK && method === "GET") {
    return { data: mockSeedingGet<T>(path, cfg?.params) };
  }
  if (USE_MOCK && (method === "PATCH" || method === "PUT")) {
    return { data: mockSeedingPatch<T>(path, (body || {}) as Record<string, unknown>) };
  }
  if (USE_MOCK && method === "POST") {
    return { data: mockSeedingPost<T>(path, (body || {}) as Record<string, unknown>) };
  }
  if (USE_MOCK && method === "DELETE") {
    return { data: mockSeedingDelete<T>(path) };
  }

  const res = await fetch(buildUrl(path, cfg?.params), {
    method,
    credentials: "include",
    headers: buildHeaders(cfg?.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw Object.assign(new Error(`Request failed: ${res.status}`), { response: { status: res.status, data } });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { data: data as T };
}

export const api = {
  get: <T = unknown>(p: string, cfg?: Cfg) => req<T>("GET", p, undefined, cfg),
  post: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("POST", p, body, cfg),
  put: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("PUT", p, body, cfg),
  patch: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("PATCH", p, body, cfg),
  delete: <T = unknown>(p: string, cfg?: Cfg) => req<T>("DELETE", p, undefined, cfg),
};

export const isSeedingMock = USE_MOCK;

export const setSessionToken = (t: string | null) =>
  t ? localStorage.setItem("session_token", t) : localStorage.removeItem("session_token");
export const getSessionToken = () => localStorage.getItem("session_token");
export const getPreviewAs = () => localStorage.getItem(PREVIEW_KEY);
export const setPreviewAs = (email: string | null) =>
  email ? localStorage.setItem(PREVIEW_KEY, email) : localStorage.removeItem(PREVIEW_KEY);
