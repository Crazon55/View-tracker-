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
  | "six_day"
  | "playbook_bpb" | "playbook_xf" | "playbook_tech"
  | "news" | "tickets" | "pintu"
  // Growth
  | "growth" | "ips"
  // Canvas
  | "fsi_canvas"
  // Seeding
  | "seeding_overview" | "seeding_approvals" | "seeding_submit" | "seeding_deals"
  | "seeding_fulfillment" | "seeding_pages" | "seeding_teamwise"
  // Admin
  | "users_roles";

export type AreaGroup = "Content" | "Growth" | "Canvas" | "Seeding" | "Admin";

export type AreaDef = { key: AreaKey; label: string; group: AreaGroup; route: string };

/** Every gate-able surface, in display order. `route` is the primary path it guards. */
export const AREAS: AreaDef[] = [
  { key: "idea_engine", label: "Idea Engine", group: "Content", route: "/idea-engine" },
  { key: "six_day", label: "6-Day Tracker", group: "Content", route: "/six-day-tracker" },
  { key: "playbook_bpb", label: "Playbook · BPB", group: "Content", route: "/experiment-bpb" },
  { key: "playbook_xf", label: "Playbook · XF", group: "Content", route: "/experiment-xf" },
  { key: "playbook_tech", label: "Playbook · Tech", group: "Content", route: "/experiment-tech" },
  { key: "news", label: "News Feed", group: "Content", route: "/news" },
  { key: "tickets", label: "Tickets", group: "Content", route: "/tickets" },
  { key: "pintu", label: "Pintu", group: "Content", route: "http://16.112.125.207:5173/" },

  { key: "growth", label: "Growth", group: "Growth", route: "/growth" },
  { key: "ips", label: "IPs / Pages", group: "Growth", route: "/pages" },

  { key: "fsi_canvas", label: "FSI Canvas", group: "Canvas", route: "/fsi-canvas" },

  { key: "seeding_overview", label: "Overview", group: "Seeding", route: "/seeding" },
  { key: "seeding_approvals", label: "Approval Queue", group: "Seeding", route: "/seeding/approvals" },
  { key: "seeding_submit", label: "Submit Brief", group: "Seeding", route: "/seeding/submit" },
  { key: "seeding_deals", label: "All Deals", group: "Seeding", route: "/seeding/deals" },
  { key: "seeding_fulfillment", label: "Fulfillment", group: "Seeding", route: "/seeding/fulfillment" },
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
  { key: "fulfillment", label: "Fulfillment", short: "FULFILL" },
  // Playbook-specific roles — access scoped to one playbook.
  { key: "bizz_playbook", label: "Bizz Playbook", short: "BIZZ PB" },
  { key: "xf_playbook", label: "XF Playbook", short: "XF PB" },
  { key: "tech_playbook", label: "Tech Playbook", short: "TECH PB" },
  { key: "news_playbook", label: "News Playbook", short: "NEWS PB" },
];

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
  { key: "pending", label: "Pending (no access)", short: "PENDING" },
];

/** Every assignable/editable role — unified first, then legacy (deduped by key). */
export const ALL_ROLES: RoleDef[] = (() => {
  const seen = new Set(ROLES.map((r) => r.key));
  return [...ROLES, ...LEGACY_ROLES.filter((r) => !seen.has(r.key))];
})();

const all = (level: AreaLevel): Record<AreaKey, AreaLevel> =>
  Object.fromEntries(AREA_KEYS.map((k) => [k, level])) as Record<AreaKey, AreaLevel>;

const withOverrides = (
  base: AreaLevel,
  overrides: Partial<Record<AreaKey, AreaLevel>>,
): Record<AreaKey, AreaLevel> => ({ ...all(base), ...overrides });

// Default matrices — STARTING POINT (tune in the UI). "?" cells in the plan default
// to the conservative choice; nothing is locked.
export const ROLE_ACCESS_DEFAULTS: Record<string, Record<AreaKey, AreaLevel>> = {
  admin: all("edit"),

  senior_cs: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "edit", pintu: "view", growth: "edit", ips: "edit", fsi_canvas: "edit",
  }),

  // CS lands on the Idea Engine — it's their home base.
  cs: withOverrides("none", {
    idea_engine: "edit",
    six_day: "view",
    playbook_bpb: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "view", pintu: "view", growth: "view", ips: "view", fsi_canvas: "edit",
  }),

  cw: withOverrides("none", {
    idea_engine: "view",
    six_day: "view",
    playbook_bpb: "view", playbook_xf: "view", playbook_tech: "view",
    news: "view", tickets: "view", pintu: "view", growth: "view", ips: "view", fsi_canvas: "edit",
  }),

  co: withOverrides("none", {
    idea_engine: "edit",
    six_day: "edit",
    playbook_bpb: "edit", playbook_xf: "edit", playbook_tech: "edit",
    news: "view", pintu: "view", growth: "view", ips: "view", fsi_canvas: "edit",
  }),

  // VE: playbooks are their day-to-day surface (matches legacy VE_PERMISSIONS).
  ve: withOverrides("none", {
    playbook_bpb: "edit", playbook_xf: "edit", playbook_tech: "edit",
    pintu: "view", growth: "view", ips: "view", fsi_canvas: "edit",
  }),

  // BD: only their team dashboard (Overview) + Submit Brief. The dashboard already lists
  // their deals, so no separate All-Deals tab.
  bd: withOverrides("none", {
    seeding_overview: "edit", seeding_submit: "edit",
  }),

  fulfillment: withOverrides("none", {
    seeding_fulfillment: "edit", seeding_deals: "view",
  }),

  // Playbook-scoped roles — edit their own playbook, view shared context.
  bizz_playbook: withOverrides("none", {
    idea_engine: "edit",
    playbook_bpb: "edit", six_day: "view", pintu: "view", growth: "view", news: "view", fsi_canvas: "edit",
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
  // `pending` intentionally NOT aliased → resolves to all-none (awaiting a real role).
};

export function canonicalRole(role: string): string {
  const r = role.trim().toLowerCase();
  return ROLE_ALIASES[r] ?? r;
}

// ── Resolver ──────────────────────────────────────────────────────────────────
export type AccessOverrides = Record<string, Partial<Record<AreaKey, AreaLevel>>>;
/** Per-person matrix from Users & Roles (`user_access.json`), keyed by area. */
export type PersonAccess = Partial<Record<AreaKey, AreaLevel>>;

const RANK: Record<AreaLevel, number> = { none: 0, view: 1, edit: 2 };

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
  return personAccess && Object.keys(personAccess).length
    ? { ...base, ...personAccess }
    : base;
}

/** Effective access for a (possibly comma-joined multi-)role on one area — highest wins.
 * When `personAccess` has a value for the area (from Users & Roles Save), that wins. */
export function getAreaLevel(
  role: string | null | undefined,
  area: AreaKey,
  overrides?: AccessOverrides,
  personAccess?: PersonAccess | null,
): AreaLevel {
  if (personAccess && personAccess[area] !== undefined) {
    return personAccess[area]!;
  }
  if (!role) return "none";
  let best: AreaLevel = "none";
  for (const raw of String(role).split(",").map((s) => s.trim()).filter(Boolean)) {
    const lvl = resolveRoleAccess(raw, overrides)[area] ?? "none";
    if (RANK[lvl] > RANK[best]) best = lvl;
  }
  return best;
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

/** Map a nav route to its access area (exact, then prefix for sub-routes). */
export function areaForRoute(route: string): AreaKey | null {
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
