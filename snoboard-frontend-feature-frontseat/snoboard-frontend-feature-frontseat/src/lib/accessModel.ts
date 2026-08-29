// ─────────────────────────────────────────────────────────────────────────────
// Unified access model (FSOS + Seeding) — per ROLE, per AREA, one of: none/view/edit.
// This is the single source of truth the Users & Roles editor reads and writes.
// Route gating, nav visibility, and edit-gating all derive from getAreaLevel().
// Defaults below are a starting point — admins tune them live in the UI (overrides
// are persisted in the backend and merged over these defaults at runtime).
// ─────────────────────────────────────────────────────────────────────────────

export type AreaLevel = "none" | "view" | "edit";

export type AreaKey =
  // Content
  | "idea_engine"
  | "playbook_bpb" | "production"
  | "playbook_xf" | "playbook_tech"
  | "news" | "tickets" | "pintu"
  // Cops
  | "six_day"
  // Growth
  | "growth"
  // Canvas
  | "fsi_canvas"
  // Seeding
  | "seeding_overview" | "seeding_approvals" | "seeding_submit" | "seeding_deals"
  | "seeding_fulfillment" | "seeding_campaign_reports" | "seeding_pages" | "seeding_teamwise"
  // Admin
  | "users_roles";

export type AreaGroup = "Content" | "Cops" | "Growth" | "Canvas" | "Seeding" | "Admin";

/** Display order for the Users & Roles matrix. Exported (rather than duplicated in each
 * editor) so adding an AreaGroup can't silently render zero rows. */
export const AREA_GROUP_ORDER: readonly AreaGroup[] = [
  "Content", "Cops", "Growth", "Canvas", "Seeding", "Admin",
];

export type AreaDef = { key: AreaKey; label: string; group: AreaGroup; route: string };

/** Every gate-able surface, in display order. `route` is the primary path it guards.
 * Order and grouping mirror the sidebar so the matrix reads like the app. */
export const AREAS: AreaDef[] = [
  { key: "idea_engine", label: "Idea Engine", group: "Content", route: "/idea-engine" },
  { key: "playbook_bpb", label: "Content Distribution", group: "Content", route: "/content-distribution" },
  { key: "production", label: "Production", group: "Content", route: "/production" },
  { key: "playbook_xf", label: "Playbook · XF", group: "Content", route: "/experiment-xf" },
  { key: "playbook_tech", label: "Playbook · Tech", group: "Content", route: "/experiment-tech" },
  { key: "news", label: "News Feed", group: "Content", route: "/news" },
  { key: "tickets", label: "Tickets", group: "Content", route: "/tickets" },
  { key: "pintu", label: "Pintu", group: "Content", route: "http://16.112.125.207:5173/" },

  { key: "six_day", label: "6-Day Tracker", group: "Cops", route: "/six-day-tracker" },

  { key: "growth", label: "Growth", group: "Growth", route: "/growth" },

  { key: "fsi_canvas", label: "FSI Canvas", group: "Canvas", route: "/fsi-canvas" },

  { key: "seeding_overview", label: "Overview", group: "Seeding", route: "/seeding" },
  { key: "seeding_approvals", label: "Approval Queue", group: "Seeding", route: "/seeding/approvals" },
  { key: "seeding_submit", label: "Submit Brief", group: "Seeding", route: "/seeding/submit" },
  { key: "seeding_deals", label: "All Deals", group: "Seeding", route: "/seeding/deals" },
  { key: "seeding_fulfillment", label: "Fulfillment", group: "Seeding", route: "/seeding/fulfillment" },
  { key: "seeding_campaign_reports", label: "Campaign Reports", group: "Seeding", route: "/seeding/campaign-reports" },
  { key: "seeding_pages", label: "Monetisable Pages", group: "Seeding", route: "/seeding/pages" },
  { key: "seeding_teamwise", label: "Teamwise Deals", group: "Seeding", route: "/seeding/teamwise" },

  { key: "users_roles", label: "Users & Roles", group: "Admin", route: "/seeding/users" },
];

export const AREA_KEYS: AreaKey[] = AREAS.map((a) => a.key);

/** The unified roles. `label` is what shows on badges; `key` is the stored role string. */
export type RoleDef = { key: string; label: string; short: string };
export const ROLES: RoleDef[] = [
  { key: "admin", label: "Admin", short: "ADMIN" },
  { key: "senior_cs", label: "Senior CS", short: "SR CS" },
  { key: "cs", label: "CS · Content Strategist", short: "CS" },
  { key: "cw", label: "CW · Content Writer", short: "CW" },
  { key: "co", label: "CO · Content Operator", short: "CO" },
  { key: "ve", label: "VE · Video Editor", short: "VE" },
  { key: "bd", label: "BD · Business Dev", short: "BD" },
  // Team-scoped BD roles (same seeding access as BD; deals scoped to that team).
  { key: "hooc_bd", label: "HOOC-BD", short: "HOOC BD" },
  { key: "ay_bd", label: "AY-BD", short: "AY BD" },
  { key: "owled_core_bd", label: "OWLED CORE-BD", short: "CORE BD" },
  { key: "snoball_bd", label: "SNOBALL-BD", short: "SNO BD" },
  { key: "fulfillment", label: "Fulfillment", short: "FULFILL" },
  // Playbook-specific roles — access scoped to one playbook.
  { key: "bizz_playbook", label: "Bizz Playbook", short: "BIZZ PB" },
  { key: "xf_playbook", label: "XF Playbook", short: "XF PB" },
  { key: "tech_playbook", label: "Tech Playbook", short: "TECH PB" },
  { key: "news_playbook", label: "News Playbook", short: "NEWS PB" },
  { key: "pending", label: "Pending (awaiting access)", short: "PENDING" },
];

/** BD team role key → seeding business team display name. */
export const BD_TEAM_ROLE_TO_NAME: Record<string, string> = {
  hooc_bd: "Hooc",
  ay_bd: "AY",
  owled_core_bd: "OWLED Core",
  snoball_bd: "Snoball",
};

export function isTeamBdRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return String(role).split(",").map((r) => r.trim().toLowerCase()).some((r) => r in BD_TEAM_ROLE_TO_NAME);
}

export function bdTeamNameForRole(role: string | null | undefined): string | null {
  if (!role) return null;
  for (const raw of String(role).split(",").map((r) => r.trim().toLowerCase())) {
    if (raw in BD_TEAM_ROLE_TO_NAME) return BD_TEAM_ROLE_TO_NAME[raw];
  }
  return null;
}

// Previous/legacy roles kept as first-class, independently-editable roles for finer
// granularity (e.g. Editor vs Carousel Designer vs Designer can differ). Their default
// matrix falls back to their canonical unified role, but each can be tuned on its own.
// Only legacy roles that are MEANINGFULLY different from a unified role. Admin-clones
// (boss_man, ai_dev, ai_automations, seeding_admin) and content_creators (= CS) are
// intentionally excluded — they still alias to Admin/CS below, so existing users keep
// access, but they don't clutter the editor as duplicate roles.
export const LEGACY_ROLES: RoleDef[] = [
  // "editors" is the same as VE · Video Editor — not listed separately (still aliased below).
  { key: "carousel_designer", label: "Carousel Designer", short: "CAROUSEL" },
  { key: "design", label: "Designer", short: "DESIGN" },
  { key: "smm", label: "Social Media Manager", short: "SMM" },
  { key: "experiment_x", label: "Experiment Creator", short: "EXP-X" },
  { key: "content_ops_intern", label: "Content Ops Intern", short: "CONTENT OPS" },
];

/** Every assignable/editable role — unified first, then legacy (deduped by key). */
export const ALL_ROLES: RoleDef[] = (() => {
  const seen = new Set(ROLES.map((r) => r.key));
  return [...ROLES, ...LEGACY_ROLES.filter((r) => !seen.has(r.key))];
})();

/** Roles shown in the Admin "Preview as…" picker (includes each team BD). */
export const PREVIEW_ROLES: RoleDef[] = ALL_ROLES.filter((r) => r.key !== "pending");

/** sessionStorage key shared with the seeding API client for team-scoped preview. */
export const ROLE_PREVIEW_STORAGE_KEY = "fsos_role_preview";

const all = (level: AreaLevel): Record<AreaKey, AreaLevel> =>
  Object.fromEntries(AREA_KEYS.map((k) => [k, level])) as Record<AreaKey, AreaLevel>;

const withOverrides = (
  base: AreaLevel,
  overrides: Partial<Record<AreaKey, AreaLevel>>,
): Record<AreaKey, AreaLevel> => ({ ...all(base), ...overrides });

const BD_ACCESS = withOverrides("none", {
  seeding_overview: "edit",
  seeding_submit: "edit",
  seeding_campaign_reports: "view",
});

// Default matrices — STARTING POINT (tune in the UI). "?" cells in the plan default
// to the conservative choice; nothing is locked.
export const ROLE_ACCESS_DEFAULTS: Record<string, Record<AreaKey, AreaLevel>> = {
  admin: all("edit"),

  senior_cs: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "view", production: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "edit", pintu: "view", growth: "edit", fsi_canvas: "edit",
  }),

  // CS lands on the Idea Engine — it's their home base.
  cs: withOverrides("none", {
    idea_engine: "edit",
    six_day: "view",
    playbook_bpb: "view", production: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "view", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  cw: withOverrides("none", {
    idea_engine: "view",
    six_day: "view",
    playbook_bpb: "view", production: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "view", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  co: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "edit", production: "edit", playbook_xf: "edit", playbook_tech: "edit",
    news: "view", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  // VE: the Production board is their day-to-day surface (matches legacy VE_PERMISSIONS).
  // `carousel_designer` and `design` alias to this role, so they inherit it.
  ve: withOverrides("none", {
    playbook_bpb: "edit", production: "edit", playbook_xf: "edit", playbook_tech: "edit",
    pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  // BD: team dashboard (Overview) + Submit Brief + own deal detail (via overview).
  bd: BD_ACCESS,
  hooc_bd: BD_ACCESS,
  ay_bd: BD_ACCESS,
  owled_core_bd: BD_ACCESS,
  snoball_bd: BD_ACCESS,

  fulfillment: withOverrides("none", {
    seeding_fulfillment: "edit", seeding_deals: "view", seeding_campaign_reports: "edit",
  }),

  // Playbook-scoped roles — edit their own playbook, view shared context.
  bizz_playbook: withOverrides("none", {
    idea_engine: "edit",
    playbook_bpb: "edit", production: "edit",
    six_day: "view", pintu: "view", growth: "view", news: "view", fsi_canvas: "edit",
  }),
  xf_playbook: withOverrides("none", {
    idea_engine: "edit",
    playbook_xf: "edit", six_day: "view", pintu: "view", growth: "view", news: "view", fsi_canvas: "edit",
  }),
  tech_playbook: withOverrides("none", {
    idea_engine: "edit",
    playbook_tech: "edit", six_day: "view", pintu: "view", growth: "view", news: "view", fsi_canvas: "edit",
  }),
  news_playbook: withOverrides("none", {
    news: "edit", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  // Legacy keys are independently editable in Users & Roles. Defaults match the
  // unified role they alias to, plus Idea Engine — that's the new home for ideas
  // and was missing from matrices saved before the gallery shipped.
  smm: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "edit", production: "edit", playbook_xf: "edit", playbook_tech: "edit",
    news: "view", tickets: "edit", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),
  experiment_x: withOverrides("none", {
    idea_engine: "edit",
    playbook_bpb: "edit", production: "edit", playbook_xf: "edit", playbook_tech: "edit",
    news: "view", tickets: "edit", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),
  content_ops_intern: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "edit", production: "edit", playbook_xf: "edit", playbook_tech: "edit",
    news: "view", pintu: "view", growth: "view", fsi_canvas: "edit",
  }),

  // New joiners — no tabs until Admin assigns a real role.
  pending: all("none"),
};

/** Legacy/alias role keys → canonical role above (so existing DB values keep working). */
export const ROLE_ALIASES: Record<string, string> = {
  boss_man: "admin",
  ai_dev: "admin",
  ai_automations: "admin",
  seeding_admin: "admin",
  content_ops_intern: "co",
  content_operator: "co",
  editors: "ve",
  video_editor: "ve",
  experiment_x: "co",
  carousel_designer: "ve",
  design: "ve",
  content_creators: "cs",
  smm: "co",
  cdi: "ve",
  // Team BD roles behave like BD for nav / home routing.
  hooc_bd: "bd",
  ay_bd: "bd",
  owled_core_bd: "bd",
  snoball_bd: "bd",
  // `pending` intentionally NOT aliased → resolves to all-none (awaiting a real role).
};

export function canonicalRole(role: string): string {
  const r = role.trim().toLowerCase();
  return ROLE_ALIASES[r] ?? r;
}

/** True when the user has no usable role yet (Admin must assign one). */
export function isAwaitingAccess(role: string | null | undefined): boolean {
  if (!role || !String(role).trim()) return true;
  const parts = String(role)
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  return parts.length === 0 || parts.every((r) => r === "pending");
}

// ── Resolver ──────────────────────────────────────────────────────────────────
export type AccessOverrides = Record<string, Partial<Record<AreaKey, AreaLevel>>>;
/** Per-person matrix from Users & Roles (`user_access.json`), keyed by area. */
export type PersonAccess = Partial<Record<AreaKey, AreaLevel>>;

const RANK: Record<AreaLevel, number> = { none: 0, view: 1, edit: 2 };

// Areas added after the first Users & Roles saves. A frozen `none` on these is
// almost always "wasn't in the form yet", not an intentional revoke — restore
// the role default so we don't have to re-click every person after a nav split.
const INHERIT_NONE_FROM_ROLE: readonly AreaKey[] = ["idea_engine", "production"];

function applySavedAccess(
  base: Record<AreaKey, AreaLevel>,
  saved?: PersonAccess | null,
): Record<AreaKey, AreaLevel> {
  if (!saved || !Object.keys(saved).length) return base;
  const merged: Record<AreaKey, AreaLevel> = { ...base, ...saved } as Record<AreaKey, AreaLevel>;
  for (const k of INHERIT_NONE_FROM_ROLE) {
    if ((saved[k] === undefined || saved[k] === "none") && base[k] !== "none") {
      merged[k] = base[k];
    }
  }
  return merged;
}

/** Effective matrix for a single role (defaults + persisted overrides).
 * Legacy roles have no default of their own, so they fall back to their canonical
 * unified role's default — but overrides are keyed by the EXACT role, so each role
 * (unified or legacy) can be tuned independently. */
export function resolveRoleAccess(
  role: string,
  overrides?: AccessOverrides,
): Record<AreaKey, AreaLevel> {
  const r = role.trim().toLowerCase();
  const base = ROLE_ACCESS_DEFAULTS[r] ?? ROLE_ACCESS_DEFAULTS[canonicalRole(r)] ?? all("none");
  const ov = overrides?.[r];
  return ov ? { ...base, ...ov } : base;
}

/** Role defaults (+ role overrides), then per-person matrix on top. */
export function resolvePersonAccess(
  role: string | null | undefined,
  personAccess?: PersonAccess | null,
  overrides?: AccessOverrides,
): Record<AreaKey, AreaLevel> {
  let base = all("none");
  if (role) {
    for (const raw of String(role).split(",").map((s) => s.trim()).filter(Boolean)) {
      const m = resolveRoleAccess(raw, overrides);
      for (const k of AREA_KEYS) {
        if (RANK[m[k]] > RANK[base[k]]) base[k] = m[k];
      }
    }
  }
  return applySavedAccess(base, personAccess);
}

/** Effective access for a (possibly comma-joined multi-)role on one area — highest wins.
 * When `personAccess` has a value for the area (from Users & Roles Save), that wins. */
export function getAreaLevel(
  role: string | null | undefined,
  area: AreaKey,
  overrides?: AccessOverrides,
  personAccess?: PersonAccess | null,
): AreaLevel {
  return resolvePersonAccess(role, personAccess, overrides)[area] ?? "none";
}

export const canView = (
  role: string | null | undefined,
  area: AreaKey,
  o?: AccessOverrides,
  personAccess?: PersonAccess | null,
) => getAreaLevel(role, area, o, personAccess) !== "none";
export const canEditArea = (
  role: string | null | undefined,
  area: AreaKey,
  o?: AccessOverrides,
  personAccess?: PersonAccess | null,
) => getAreaLevel(role, area, o, personAccess) === "edit";

/** Monthly wrap is a tracker recap — not for BD / fulfillment / seeding-ops-only roles. */
const WRAP_BLOCKED_ROLES = new Set([
  "bd",
  "fulfillment",
  "hooc_bd",
  "ay_bd",
  "owled_core_bd",
  "snoball_bd",
  "pending",
]);

export function canViewMonthlyWrap(
  role: string | null | undefined,
  personAccess?: PersonAccess | null,
): boolean {
  if (!role || !String(role).trim()) return false;
  const parts = String(role)
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return false;
  // Pure seeding/BD roles never get the wrap chip / route / autoload.
  const hasTrackerEligibleRole = parts.some((r) => {
    const c = canonicalRole(r);
    return !WRAP_BLOCKED_ROLES.has(r) && !WRAP_BLOCKED_ROLES.has(c);
  });
  if (!hasTrackerEligibleRole) return false;
  return canView(role, "six_day", undefined, personAccess);
}

// Routes that share an AREAS entry's permission without being a literal alias of its
// `route` (kept out of AREAS itself so the admin permission matrix shows one row per
// permission, not one per route). `/experiment-bpb` is the pre-rename Content
// Distribution URL, still linked from the legacy nav allow-list.
const AREA_ROUTE_ALIASES: Record<string, AreaKey> = {
  "/experiment-bpb": "playbook_bpb",
  "/experiment-x": "playbook_bpb",
};

/** Map a nav route to its access area (exact, then prefix for sub-routes). */
export function areaForRoute(route: string): AreaKey | null {
  if (route in AREA_ROUTE_ALIASES) return AREA_ROUTE_ALIASES[route];
  const exact = AREAS.find((a) => a.route === route);
  if (exact) return exact.key;
  const pre = AREAS.find((a) => !a.route.startsWith("http") && route.startsWith(a.route + "/"));
  return pre?.key ?? null;
}

/** True if the role can view any non-Seeding, non-Admin area (i.e. an FSOS/content user). */
export function canSeeAnyNonSeeding(
  role: string | null | undefined,
  o?: AccessOverrides,
  personAccess?: PersonAccess | null,
): boolean {
  return AREAS.some(
    (a) => a.group !== "Seeding" && a.group !== "Admin" && canView(role, a.key, o, personAccess),
  );
}

/** True if the user can view any Seeding area (role defaults or saved per-person matrix). */
export function canSeeAnySeeding(
  role: string | null | undefined,
  o?: AccessOverrides,
  personAccess?: PersonAccess | null,
): boolean {
  return AREAS.some(
    (a) => a.group === "Seeding" && canView(role, a.key, o, personAccess),
  );
}
