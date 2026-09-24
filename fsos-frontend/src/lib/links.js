// What counts as a deliverable link, and what to say when it isn't one.
//
// The field took any text at all, so a typo or somebody's random URL went in and nobody
// found out until the reviewer clicked it and got nowhere — a day lost on something due
// today. The rule lives on the server too (app/links.py); this copy is here so the
// person pasting finds out while their hand is still on the keyboard.
//
// Matching is on the host. Canva and Drive both mint URLs in several shapes, and
// anything that tried to match the path would break the next time either changes a
// route.

const ALLOWED_HOSTS = ["canva.com", "canva.site", "drive.google.com", "docs.google.com"];

/** The hostname, tolerating a URL pasted without its scheme. */
export function hostOf(url) {
  const raw = (url || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase() || null;
  } catch (e) {
    return null;
  }
}

export function isAssetLink(url) {
  const host = hostOf(url);
  if (!host) return false;
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// Said with a straight face, and never twice in a row, because the same sentence three
// times reads like a broken form rather than a colleague. Every one of them names what
// was actually pasted and what to paste instead — the joke is not allowed to get in the
// way of the instruction.
const ROASTS = [
  (h) => `Bold of you to file ${h} as a deliverable. Canva or Drive, please.`,
  (h) => `${h} is a website. A reviewer needs a file. Canva or Drive.`,
  (h) => `We both know ${h} isn't going in the carousel. Paste the Canva or Drive link.`,
  (h) => `Points for confidence, none for ${h}. Canva or Drive link, please.`,
  (h) => `${h}? The reviewer will click that exactly once. Canva or Drive.`,
  (h) => `Unless ${h} is a Canva account nobody told us about — paste the real link.`,
];

/**
 * Null when the link is fine, otherwise the message to show.
 *
 * Empty is handled separately from wrong: someone who pasted nothing has not done
 * anything worth teasing, they just have not finished.
 */
export function assetLinkError(url) {
  const raw = (url || "").trim();
  if (!raw) return "Paste a Canva or Drive link.";
  if (isAssetLink(raw)) return null;
  const host = hostOf(raw) || raw.slice(0, 40);
  return ROASTS[Math.floor(Math.random() * ROASTS.length)](host);
}
