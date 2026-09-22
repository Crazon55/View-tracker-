import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Turn a typed URL into an off-site href. "google.com" must not become /google.com. */
export function externalHref(url) {
  const s = String(url || "").trim();
  if (!s) return "#";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s;
  return `https://${s}`;
}
