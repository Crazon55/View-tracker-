import { NAV } from "./constants";
import { resolvePersonAccess } from "./access";

const HOME_BY_ROLE = {
  "Founder/Admin": "/",
  "Short-form Lead": "/",
  CS: "/",
  COA: "/",
  Designer: "/production",
  Editor: "/production",
  COC: "/distribution",
};

const CREATE_ROLES = ["Founder/Admin", "COA", "CS", "Short-form Lead"];
const PRODUCER_ROLES = ["Designer", "Editor"];

export function hasRole(user, role) {
  return !!user?.roles?.includes(role);
}

export function isAdmin(user) {
  return hasRole(user, "Founder/Admin") || hasRole(user, "COA");
}

export function canAssignProduction(user) {
  return isAdmin(user);
}

export function canEditProduction(user, idea, ownerWorkspace = false) {
  if (!user) return false;
  if (isAdmin(user) || ownerWorkspace) return true;
  if (idea?.productionOwnerId === user.id) return true;
  return hasRole(user, "Designer") || hasRole(user, "Editor");
}

export function isProducerRole(user) {
  if (!user) return false;
  if (["Founder/Admin", "COA", "COC", "CS", "Short-form Lead"].some((r) => hasRole(user, r))) return false;
  return PRODUCER_ROLES.some((r) => hasRole(user, r));
}

export function canCreateIdea(user, stream) {
  if (!user?.roles?.some((r) => CREATE_ROLES.includes(r))) return false;
  if (!stream) return true;
  if (isAdmin(user) || hasRole(user, "Short-form Lead") || hasRole(user, "CS")) return true;
  const streams = user.streams || [];
  return !streams.length || streams.includes(stream);
}

// `access` is the resolved area matrix (domain/access.js). When omitted, the role
// defaults are used, so callers without db access still get sensible gating.
export function navItemsForUser(user, access) {
  const matrix = access || resolvePersonAccess(user?.roles);
  const ids = new Set(NAV.filter((n) => (matrix[n.area] || "none") !== "none").map((n) => n.id));
  const streams = user?.streams || [];
  if (!isAdmin(user) && !hasRole(user, "Short-form Lead") && !hasRole(user, "CS") && streams.length === 1) {
    if (streams[0] === "BO") ids.delete("hpn-desk");
    if (streams[0] === "HPN") ids.delete("bo-studio");
  }
  return NAV.filter((n) => ids.has(n.id));
}

export function homePathForUser(user, access) {
  const items = navItemsForUser(user, access).filter((n) => !n.external);
  const preferred = (user?.roles || []).map((r) => HOME_BY_ROLE[r]).find((p) => items.some((n) => n.path === p));
  return preferred || items[0]?.path || "/";
}

export function canAccessPath(user, pathname, access) {
  if (pathname === "/help") return true;
  const items = navItemsForUser(user, access).filter((n) => !n.external);
  return items.some((n) => (n.path === "/" ? pathname === "/" : pathname === n.path || pathname.startsWith(`${n.path}/`)));
}

export function streamFilterForUser(user) {
  if (isAdmin(user) || hasRole(user, "CS") || hasRole(user, "Short-form Lead")) return "All";
  const streams = user?.streams || [];
  if (streams.length === 1) return streams[0];
  return "All";
}
