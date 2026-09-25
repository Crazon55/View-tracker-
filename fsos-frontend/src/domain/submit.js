// When a version may go to a reviewer.
//
// This lives in the domain layer rather than in the idea card because it is a rule about
// the work, not about a screen — the card, the production board and the tests all need
// the same answer, and a rule that exists in three places is a rule that will disagree
// with itself. The API enforces it independently (fsos-backend/app/routers/production.py);
// this copy is what lets the button explain itself instead of failing on click.

import { externalHref } from "../lib/utils";

/** True when there is something a reviewer could actually open. */
export function hasDeliverable(v) {
  return Array.isArray(v.assetLinks) && v.assetLinks.length > 0;
}
export function pendingLinkPayload(versionId, pending) {
  const url = (pending?.[versionId]?.url || "").trim();
  if (!url) return null;
  return { versionId, type: pending[versionId].type || "canva", url: externalHref(url), label: url };
}
export function submittableWithLinks(versions, pending = {}) {
  return versions.filter((v) => {
    if (!["not_started", "in_production", "changes_requested"].includes(v.reviewStatus)) return false;
    return hasDeliverable(v) || !!(pending[v.id]?.url || "").trim();
  });
}
export const NO_DELIVERABLE_MSG = "Add a Canva or Drive link first — the reviewer needs a deliverable to review.";
/**
 * Why this idea cannot go to review yet, or null.
 *
 * Review is a conversation between two named people: the reviewer asks for changes and
 * the owner makes them. Either one missing breaks it in its own way — with no owner the
 * request has nobody behind it and the changes never come; with no reviewer the version
 * moves to awaiting review and notifies nobody, sitting in a queue addressed to no one,
 * which looks like progress and isn't.
 *
 * The deadline is deliberately not required. Not knowing when something is due is a real
 * state, and blocking on it would teach people to type a date they do not mean.
 *
 * The API refuses these too; this exists so the button says why instead of failing on
 * click. Naming whichever is actually missing saves a trip to find out which.
 */
export function submitBlocker(idea, versions, pending = {}) {
  const missing = [];
  if (!idea?.productionOwnerId) missing.push("a production owner");
  if (!idea?.reviewerId) missing.push("a reviewer");
  if (missing.length) {
    return `Assign ${missing.join(" and ")} in Production & Review — a review needs someone to do it and someone to send changes back to.`;
  }
  if (!submittableWithLinks(versions, pending).length) return NO_DELIVERABLE_MSG;
  return null;
}

