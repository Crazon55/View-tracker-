// ─────────────────────────────────────────────────────────────────────────────
// Seeding API client — axios-compatible shim over fetch so the FS-Seeding pages
// port with minimal edits (they call api.get(path,{params}).then(({data})=>…)).
//
// Live API only (same-origin /api/seeding). Mock fixtures are OPT-IN via
// VITE_SEEDING_MOCK=true — never auto-fallback on 5xx/404/network (that caused
// silent "fake success" / data flip-flops when the backend blipped).
// ─────────────────────────────────────────────────────────────────────────────
import { mockSeedingGet, mockSeedingPatch, mockSeedingPost, mockSeedingDelete } from "./mockData";
import { getAccessToken } from "../api"; // shared FSOS Supabase access token
import { ROLE_PREVIEW_STORAGE_KEY, bdTeamNameForRole } from "@/lib/accessModel";

function resolveSeedingBase(): string {
  const explicit = (import.meta.env.VITE_SEEDING_API as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  // Same-origin `/api/seeding` — matches vite proxy (dev) and production API gateway.
  // Do NOT invent a host from VITE_API_URL; a wrong absolute host caused 500s.
  return "/api/seeding";
}

const BASE = resolveSeedingBase();
const FORCE_MOCK = import.meta.env.VITE_SEEDING_MOCK === "true";
const PREVIEW_KEY = "preview_as_email";

type Cfg = { params?: Record<string, unknown>; headers?: Record<string, string> };

export type SeedingApiError = Error & {
  response?: { status: number; data: unknown };
};

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
  const token = getAccessToken();
  if (token) h.Authorization = `Bearer ${token}`;
  const preview = localStorage.getItem(PREVIEW_KEY);
  if (preview) h["X-Impersonate-As"] = preview;
  // Admin role-preview (HOOC-BD, SNOBALL-BD, …) — backend scopes seeding to that team.
  const previewRole = sessionStorage.getItem(ROLE_PREVIEW_STORAGE_KEY);
  if (previewRole) h["X-Preview-Role"] = previewRole;
  return h;
}

function withPreviewTeamParams(path: string, params?: Record<string, unknown>) {
  const previewRole = sessionStorage.getItem(ROLE_PREVIEW_STORAGE_KEY);
  const teamName = bdTeamNameForRole(previewRole);
  if (!teamName) return params;
  if (path !== "/deals" && path !== "/reports/overview") return params;
  if (params?.team_name) return params;
  return { ...(params || {}), team_name: teamName };
}

function mockReq<T>(method: string, path: string, body?: unknown, cfg?: Cfg): { data: T } {
  const params = method === "GET" ? withPreviewTeamParams(path, cfg?.params) : cfg?.params;
  if (method === "GET") return { data: mockSeedingGet<T>(path, params) };
  if (method === "PATCH" || method === "PUT") {
    return { data: mockSeedingPatch<T>(path, (body || {}) as Record<string, unknown>) };
  }
  if (method === "POST") return { data: mockSeedingPost<T>(path, (body || {}) as Record<string, unknown>) };
  if (method === "DELETE") return { data: mockSeedingDelete<T>(path) };
  throw new Error(`Unsupported mock method ${method}`);
}

function httpError(status: number, data: unknown, message?: string): SeedingApiError {
  return Object.assign(new Error(message || `Request failed: ${status}`), {
    response: { status, data },
  });
}

async function req<T>(method: string, path: string, body?: unknown, cfg?: Cfg): Promise<{ data: T }> {
  if (FORCE_MOCK) return mockReq<T>(method, path, body, cfg);

  const res = await fetch(buildUrl(path, cfg?.params), {
    method,
    credentials: "include",
    headers: buildHeaders(cfg?.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw httpError(res.status, data);
  }
  return { data: data as T };
}

export const api = {
  get: <T = unknown>(p: string, cfg?: Cfg) => req<T>("GET", p, undefined, cfg),
  post: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("POST", p, body, cfg),
  put: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("PUT", p, body, cfg),
  patch: <T = unknown>(p: string, body?: unknown, cfg?: Cfg) => req<T>("PATCH", p, body, cfg),
  delete: <T = unknown>(p: string, cfg?: Cfg) => req<T>("DELETE", p, undefined, cfg),
};

export const isSeedingMock = FORCE_MOCK;

export const setSessionToken = (t: string | null) =>
  t ? localStorage.setItem("session_token", t) : localStorage.removeItem("session_token");
export const getSessionToken = () => localStorage.getItem("session_token");
export const getPreviewAs = () => localStorage.getItem(PREVIEW_KEY);
export const setPreviewAs = (email: string | null) =>
  email ? localStorage.setItem(PREVIEW_KEY, email) : localStorage.removeItem(PREVIEW_KEY);
