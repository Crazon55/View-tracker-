// Unified access model — per ROLE, per AREA, one of: none / view / edit.
// Ported from the Frontseat snoboard `accessModel.ts`, re-keyed to FSOS roles.
// Route gating, nav visibility and edit-gating all derive from resolveAccess().
// Defaults below are a starting point — admins tune them in Users & Roles
// (role overrides + per-person overrides live in db.access and merge over these).
import { ROLES } from "./constants";

export const LEVELS = ["none", "view", "edit"];
export const LEVEL_LABEL = { none: "—", view: "View", edit: "Edit" };
const RANK = { none: 0, view: 1, edit: 2 };

export const PINTU_URL = "http://16.112.125.207:5173/";

export const AREA_GROUP_ORDER = ["Workspace", "Content tools", "Cops", "Growth", "Admin"];

// Every gate-able surface, in sidebar order. `route` is the primary path it guards.
export const AREAS = [
  { key: "command_room", label: "Command Room", group: "Workspace", route: "/" },
  { key: "bo_studio", label: "BO Studio", group: "Workspace", route: "/bo" },
  { key: "hpn_desk", label: "HPN Desk", group: "Workspace", route: "/hpn" },
  { key: "production", label: "Production", group: "Workspace", route: "/production" },
  { key: "distribution", label: "Distribution", group: "Workspace", route: "/distribution" },
  { key: "performance", label: "Performance", group: "Workspace", route: "/performance" },

  { key: "news", label: "News Feed", group: "Content tools", route: "/news" },
  { key: "pintu", label: "Pintu", group: "Content tools", route: PINTU_URL, external: true },

  { key: "six_day", label: "6-Day Tracker", group: "Cops", route: "/six-day-tracker" },

  { key: "growth", label: "Growth", group: "Growth", route: "/growth" },

  { key: "users_roles", label: "Users & Roles", group: "Admin", route: "/users-roles" },
  { key: "settings", label: "Settings", group: "Admin", route: "/settings" },
];

export const AREA_KEYS = AREAS.map((a) => a.key);

const all = (level) => Object.fromEntries(AREA_KEYS.map((k) => [k, level]));
const withOverrides = (base, overrides) => ({ ...all(base), ...overrides });

const WORKSPACE_ALL = {
  command_room: "edit", bo_studio: "edit", hpn_desk: "edit",
  production: "edit", distribution: "edit", performance: "edit",
};

// Default matrices. Workspace areas mirror the pre-existing FSOS nav per role, so
// nothing anyone could already see disappears; the new tools get conservative defaults.
export const ROLE_ACCESS_DEFAULTS = {
  "Founder/Admin": all("edit"),

  COA: all("edit"),

  "Short-form Lead": withOverrides("none", {
    ...WORKSPACE_ALL,
    news: "edit", pintu: "view", six_day: "edit", growth: "view",
  }),

  CS: withOverrides("none", {
    command_room: "edit", bo_studio: "edit", hpn_desk: "edit", production: "edit", performance: "edit",
    news: "edit", pintu: "view", six_day: "view", growth: "view",
  }),

  Designer: withOverrides("none", {
    production: "edit", pintu: "view", growth: "view",
  }),

  Editor: withOverrides("none", {
    production: "edit", pintu: "view", growth: "view",
  }),

  COC: withOverrides("none", {
    command_room: "edit", distribution: "edit", performance: "edit",
    news: "view", six_day: "edit", growth: "view",
  }),
};

// The role that can never be locked out — overrides on it are ignored for safety.
export const LOCKED_ROLE = "Founder/Admin";

/** Effective matrix for a single role (defaults + persisted role overrides). */
export function resolveRoleAccess(role, roleOverrides) {
  const base = ROLE_ACCESS_DEFAULTS[role] || all("none");
  if (role === LOCKED_ROLE) return base;
  const ov = roleOverrides?.[role];
  return ov ? { ...base, ...ov } : base;
}

/** Highest level across all roles, then the per-person matrix on top. */
export function resolvePersonAccess(roles, personAccess, roleOverrides) {
  const base = all("none");
  (roles || []).forEach((r) => {
    const m = resolveRoleAccess(r, roleOverrides);
    AREA_KEYS.forEach((k) => { if (RANK[m[k]] > RANK[base[k]]) base[k] = m[k]; });
  });
  if (roles?.includes(LOCKED_ROLE)) return base;
  if (!personAccess || !Object.keys(personAccess).length) return base;
  return { ...base, ...personAccess };
}

/**
 * Effective access for the acting user, or for whatever is being previewed.
 *
 * Preview comes in two kinds. A *role* shows that role's defaults — what a new Editor
 * would get. A *person* shows what one named teammate actually sees, which is the more
 * useful question here, because per-person overrides are exactly what Users & Roles is
 * for and a role preview is blind to them.
 */
export function resolveAccess(db, user, preview) {
  const access = db.access || {};
  if (preview?.kind === "role") return resolveRoleAccess(preview.role, access.roles);
  if (preview?.kind === "person") {
    const person = (db.users || []).find((u) => u.id === preview.id);
    if (person) return resolvePersonAccess(person.roles, access.people?.[person.id], access.roles);
  }
  return resolvePersonAccess(user?.roles, access.people?.[user?.id], access.roles);
}

/** True when the user has no usable role yet (Admin must assign one). */
export function isAwaitingAccess(user) {
  return !user?.roles?.length;
}

export function areaForRoute(pathname) {
  const exact = AREAS.find((a) => !a.external && a.route === pathname);
  if (exact) return exact.key;
  const pre = AREAS.find((a) => !a.external && a.route !== "/" && pathname.startsWith(`${a.route}/`));
  return pre?.key || null;
}

export function countLevels(matrix) {
  return {
    edit: AREA_KEYS.filter((k) => matrix[k] === "edit").length,
    view: AREA_KEYS.filter((k) => matrix[k] === "view").length,
  };
}

export const PREVIEW_ROLES = ROLES;
