// Google sign-in, straight against Supabase's auth endpoints.
//
// No SDK: the flow is a redirect out to Supabase, which sends the browser back with
// the tokens in the URL fragment. We keep them, strip them out of the address bar, and
// hand the access token to the API layer. The backend verifies every token with
// Supabase itself, so nothing here is trusted — losing this file loses convenience,
// not safety.
//
// The token lives in localStorage. That is the same trade-off the Supabase SDK makes:
// it survives a refresh and a new tab, at the cost of being readable by script on this
// origin. There is no third-party script on this app for it to leak to.

const URL_ = (process.env.REACT_APP_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
const STORE = "fsos_session";

export const authConfigured = !!(URL_ && KEY);

let session = null;   // { access_token, refresh_token, expires_at, user }

function read() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function write(s) {
  session = s;
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch (e) { /* private browsing — you'll be asked to sign in again */ }
}

/** Pull tokens out of the fragment Supabase redirects back with, then tidy the URL. */
function adoptRedirect() {
  const hash = window.location.hash || "";
  if (!hash.includes("access_token=")) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = p.get("access_token");
  if (!access_token) return null;
  const s = {
    access_token,
    refresh_token: p.get("refresh_token"),
    // `expires_at` is seconds since the epoch; fall back to expires_in if it's absent.
    expires_at: Number(p.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(p.get("expires_in") || 3600),
  };
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return s;
}

/** Any error Supabase sent back instead of a token (e.g. the provider is off). */
export function redirectError() {
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const err = hash.get("error_description") || hash.get("error");
  if (err) window.history.replaceState({}, document.title, window.location.pathname);
  return err ? decodeURIComponent(err.replace(/\+/g, " ")) : null;
}

async function refresh() {
  if (!session?.refresh_token) return null;
  try {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) throw new Error("refresh failed");
    const data = await res.json();
    write({
      access_token: data.access_token,
      refresh_token: data.refresh_token || session.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    });
    return session.access_token;
  } catch (e) {
    write(null);            // the refresh token is spent — sign in again
    return null;
  }
}

/** Load whatever session exists: from the redirect we just came back from, or storage. */
export function initSession() {
  const fromRedirect = adoptRedirect();
  if (fromRedirect) write(fromRedirect);
  else session = read();
  return session;
}

/** A valid access token, refreshed if it's about to expire. Null when signed out. */
export async function getToken() {
  if (!session) session = read();
  if (!session) return null;
  // A minute of slack, so a request can't expire mid-flight.
  if (session.expires_at && session.expires_at - 60 <= Math.floor(Date.now() / 1000)) return refresh();
  return session.access_token;
}

export function isSignedIn() {
  return !!(session || read());
}

export function signIn() {
  const back = `${window.location.origin}/`;
  window.location.href =
    `${URL_}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}

export async function signOut() {
  const token = session?.access_token;
  write(null);
  if (token) {
    // Best effort: the local session is gone either way.
    try {
      await fetch(`${URL_}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${token}` },
      });
    } catch (e) { /* offline sign-out is still a sign-out */ }
  }
  window.location.href = "/";
}
