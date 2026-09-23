// The only way the FSOS app talks to its data.
//
// Nothing in the browser reads Supabase directly: RLS denies the anon key everything,
// deliberately, so that one place — the FSOS backend — decides what each role may do.
// This module attaches who you are and turns a failed response into an Error carrying
// the API's own message, which is written to be shown to a person.

const BASE = (process.env.REACT_APP_FSOS_API_URL || "http://localhost:8000").replace(/\/$/, "");

// Local development only, and only while FSOS_DEV_LOGIN is on in the backend: identify
// as this person instead of signing in. Never set in a deployed build.
const DEV_EMAIL = process.env.REACT_APP_FSOS_DEV_EMAIL || "";

let getToken = async () => null;

/** Let the auth layer supply the current Supabase access token. */
export function setTokenSource(fn) {
  getToken = fn;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (DEV_EMAIL) headers["X-FSOS-Dev-Email"] = DEV_EMAIL;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new ApiError("Can't reach the FSOS server. Is the backend running?", 0);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.detail || `${method} ${path} failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b ?? {}),
  patch: (p, b) => request("PATCH", p, b ?? {}),
  put: (p, b) => request("PUT", p, b ?? {}),
  del: (p) => request("DELETE", p),
};

export const usingDevLogin = !!DEV_EMAIL;
