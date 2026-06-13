// ─────────────────────────────────────────────────────────────────────────────
// RBAC — single source of truth for roles, permissions, and nav access.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaybookId } from "@/lib/playbookExperimentConfig";

export type Permission =
  | 'view_own_ideas'        // see only ideas you created
  | 'view_assigned_ideas'   // see only ideas you are tagged/assigned to
  | 'view_all_ideas'        // see everyone's ideas
  | 'view_scheduled_any'    // see all ideas in scheduled/posted stages (SMM)
  | 'create_idea'           // create new idea cards
  | 'edit_own_idea'         // edit your own idea cards
  | 'delete_own_idea'       // delete your own idea cards
  | 'edit_any_idea'         // edit any idea card
  | 'delete_any_idea'       // delete any idea card
  | 'tag_collaborator'      // tag an editor/carousel_designer on an idea
  | 'comment_on_idea'       // post comments/updates on ideas
  | 'attach_file_to_idea'   // attach approval/review files on ideas
  | 'add_view_count'        // update view count data
  | 'view_scheduled'        // access scheduled content views
  | 'view_top_posts'        // access top posts analytics
  | 'filter_by_person'            // filter board by any team member (admin-level)
  | 'manage_team'                 // add/remove team members and change roles (admin-only)
  | 'post_tracker_assigned_only'  // in Post Tracker only: see ideas where tagged (designer override)
  | 'add_experiment_idea'         // create ideas in playbook experiments
  | 'view_experiment_x'           // read-only access to playbook experiments
  | 'edit_experiment_x'           // edit ideas / kanban in playbook experiments
  | 'edit_experiment_ops'         // content ops: edit views + baseline/topline tags only (schedule is read-only)
  | 'edit_six_day_tracker'        // update views and entries in 6-Day Tracker
  // Per-playbook — each playbook is separate (BPB, XF, TECH)
  | 'view_playbook_bpb'
  | 'edit_playbook_bpb'
  | 'ops_playbook_bpb'
  | 'view_playbook_xf'
  | 'edit_playbook_xf'
  | 'ops_playbook_xf'
  | 'view_playbook_tech'
  | 'edit_playbook_tech'
  | 'ops_playbook_tech'

// ── Reusable permission sets ──────────────────────────────────────────────────

const PLAYBOOK_PERMISSIONS: Permission[] = [
  'view_playbook_bpb', 'edit_playbook_bpb', 'ops_playbook_bpb',
  'view_playbook_xf', 'edit_playbook_xf', 'ops_playbook_xf',
  'view_playbook_tech', 'edit_playbook_tech', 'ops_playbook_tech',
]

export type PlaybookAccess = "none" | "view" | "ops" | "edit";

const PLAYBOOK_IDS: PlaybookId[] = ["bpb", "xf", "tech"];

const VIEW_PLAYBOOK: Record<PlaybookId, Permission> = {
  bpb: "view_playbook_bpb", xf: "view_playbook_xf", tech: "view_playbook_tech",
};
const EDIT_PLAYBOOK: Record<PlaybookId, Permission> = {
  bpb: "edit_playbook_bpb", xf: "edit_playbook_xf", tech: "edit_playbook_tech",
};
const OPS_PLAYBOOK: Record<PlaybookId, Permission> = {
  bpb: "ops_playbook_bpb", xf: "ops_playbook_xf", tech: "ops_playbook_tech",
};

export function playbookIdFromPath(path: string): PlaybookId | null {
  if (path.startsWith("/experiment-bpb") || path === "/experiment-x") return "bpb";
  if (path.startsWith("/experiment-xf")) return "xf";
  if (path.startsWith("/experiment-tech")) return "tech";
  return null;
}

export function getPlaybookAccess(role: string | null, playbookId: PlaybookId): PlaybookAccess {
  if (!role) return "none";
  if (hasPermission(role, EDIT_PLAYBOOK[playbookId])) return "edit";
  if (hasPermission(role, OPS_PLAYBOOK[playbookId])) return "ops";
  if (hasPermission(role, VIEW_PLAYBOOK[playbookId])) return "view";
  return "none";
}

export function canAccessPlaybook(role: string | null, playbookId: PlaybookId): boolean {
  return getPlaybookAccess(role, playbookId) !== "none";
}

export function canEditPlaybook(role: string | null, playbookId: PlaybookId): boolean {
  return getPlaybookAccess(role, playbookId) === "edit";
}

export function isPlaybookOpsMode(role: string | null, playbookId: PlaybookId): boolean {
  return getPlaybookAccess(role, playbookId) === "ops";
}

export function isPlaybookViewOnly(role: string | null, playbookId: PlaybookId): boolean {
  return getPlaybookAccess(role, playbookId) === "view";
}

export function accessiblePlaybookIds(role: string | null): PlaybookId[] {
  return PLAYBOOK_IDS.filter((id) => canAccessPlaybook(role, id));
}

const ADMIN_PERMISSIONS: Permission[] = [
  'view_all_ideas',
  'create_idea',
  'edit_any_idea',
  'delete_any_idea',
  'tag_collaborator',
  'comment_on_idea',
  'filter_by_person',
  'manage_team',
  'view_scheduled',
  'view_scheduled_any',
  'add_view_count',
  'view_top_posts',
  'attach_file_to_idea',
  'add_experiment_idea',
  'view_experiment_x',
  'edit_experiment_x',
  'edit_experiment_ops',
  'edit_six_day_tracker',
  ...PLAYBOOK_PERMISSIONS,
]

const CS_CW_PERMISSIONS: Permission[] = [
  'view_own_ideas',
  'create_idea',
  'edit_own_idea',
  'delete_own_idea',
  'tag_collaborator',
  'comment_on_idea',
]

const COLLABORATOR_PERMISSIONS: Permission[] = [
  'view_assigned_ideas',
  'comment_on_idea',
  'attach_file_to_idea',
]

// ── Role → permissions map ────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Admin-level — full access
  senior_cs: ADMIN_PERMISSIONS,
  boss_man:  ADMIN_PERMISSIONS,
  ai_dev:    ADMIN_PERMISSIONS,

  // Content creators — own their ideas, full nav
  cs: CS_CW_PERMISSIONS,
  cw: CS_CW_PERMISSIONS,

  // Collaborators — only see ideas they are tagged on, restricted nav
  editors:           COLLABORATOR_PERMISSIONS,
  carousel_designer: COLLABORATOR_PERMISSIONS,

  // Design — reads everything site-wide, but in Post Tracker only sees tagged ideas
  design: ['view_all_ideas', 'post_tracker_assigned_only', 'comment_on_idea', 'attach_file_to_idea'],

  // SMM — scheduled/posted content only, can update view counts
  smm: ['view_scheduled_any', 'add_view_count', 'view_top_posts', 'comment_on_idea'],

  // Experiment X creators — Pulkit & Varun only
  experiment_x: [
    'view_experiment_x',
    'edit_experiment_x',
    ...PLAYBOOK_PERMISSIONS,
    'view_all_ideas',
    'create_idea',
    'edit_own_idea',
    'delete_own_idea',
    'comment_on_idea',
    'add_experiment_idea',
  ],

  // Content Ops — per-playbook ops (views + baseline) + 6-Day Tracker
  content_ops_intern: [
    'view_experiment_x',
    'edit_experiment_ops',
    'view_playbook_bpb', 'ops_playbook_bpb',
    'view_playbook_xf', 'ops_playbook_xf',
    'view_playbook_tech', 'ops_playbook_tech',
    'edit_six_day_tracker',
  ],

  // Other roles — (none)

  // ── Backwards compatibility aliases ───────────────────────────────────────
  // Users who had these old role values in localStorage still get correct access.
  admin:          ADMIN_PERMISSIONS,
  ai_automations: ADMIN_PERMISSIONS,
  post_designer:  COLLABORATOR_PERMISSIONS,
  content_creators: CS_CW_PERMISSIONS,
}

// ── Role → allowed nav routes ─────────────────────────────────────────────────
// '*' = full access to all nav items.
// Array = only these exact route paths are shown in the nav.

export const ROLE_NAV: Record<string, '*' | string[]> = {
  senior_cs: '*',
  boss_man:  '*',
  ai_dev:    '*',

  cs: '*',
  cw: '*',

  design: '*',

  editors:           ['/', '/content-tracker', '/growth'],
  carousel_designer: ['/', '/post-tracker', '/growth'],

  smm:              ['/', '/content-tracker', '/post-tracker', '/growth', '/stage1-tracker'],
  experiment_x:     ['/', '/experiment-bpb', '/experiment-xf', '/experiment-tech', '/experiment-x', '/team-performance', '/tickets', '/news', '/growth'],
  content_ops_intern:  ['/', '/experiment-bpb', '/experiment-xf', '/experiment-tech', '/experiment-x', '/six-day-tracker', '/growth'],
  // legacy — migrated to cs in backend
  content_creators: '*',
}

export function isRouteAllowed(role: string | null, path: string): boolean {
  if (!role) return false
  const playbookId = playbookIdFromPath(path)
  if (playbookId) return canAccessPlaybook(role, playbookId)
  // Multi-role: allowed if ANY role permits the route
  return parseRoles(role).some((r) => {
    const allowed = ROLE_NAV[r]
    if (!allowed || allowed === '*') return true
    return (allowed as string[]).includes(path)
  })
}

export function hasFullNav(role: string | null): boolean {
  if (!role) return false
  return parseRoles(role).some((r) => {
    const allowed = ROLE_NAV[r]
    return !allowed || allowed === '*'
  })
}

// ── Helper functions ──────────────────────────────────────────────────────────

// Splits "cs,cw" into ["cs", "cw"] — single roles work as-is
function parseRoles(role: string): string[] {
  return role.split(',').map((r) => r.trim()).filter(Boolean)
}

export function hasPermission(role: string | null, permission: Permission): boolean {
  if (!role) return false
  return parseRoles(role).some((r) => {
    if (!(r in ROLE_PERMISSIONS)) return true // unknown role = full access
    return (ROLE_PERMISSIONS[r] ?? []).includes(permission)
  })
}

export function canEditIdea(
  role: string | null,
  ideaCreatedBy: string,
  currentUserName: string
): boolean {
  if (hasPermission(role, 'edit_any_idea')) return true
  if (hasPermission(role, 'edit_own_idea')) return ideaCreatedBy === currentUserName
  return false
}

export function canDeleteIdea(
  role: string | null,
  ideaCreatedBy: string,
  currentUserName: string
): boolean {
  if (hasPermission(role, 'delete_any_idea')) return true
  if (hasPermission(role, 'delete_own_idea')) return ideaCreatedBy === currentUserName
  return false
}

export function canViewExperimentX(role: string | null): boolean {
  if (!role) return false
  return accessiblePlaybookIds(role).length > 0
}

export function canEditExperimentX(role: string | null, playbookId?: PlaybookId): boolean {
  if (!role) return false
  if (playbookId) return canEditPlaybook(role, playbookId)
  return hasPermission(role, 'edit_experiment_x') || hasFullNav(role)
}

export function canEditExperimentOps(role: string | null, playbookId?: PlaybookId): boolean {
  if (!role) return false
  if (playbookId) {
    const access = getPlaybookAccess(role, playbookId)
    return access === "edit" || access === "ops"
  }
  return hasPermission(role, 'edit_experiment_ops') || hasPermission(role, 'edit_experiment_x') || hasFullNav(role)
}

/** True when user has ops-level access on this playbook (not full editor). */
export function isExperimentOpsOnly(role: string | null, playbookId: PlaybookId): boolean {
  return isPlaybookOpsMode(role, playbookId)
}

export function canEditSixDayTracker(role: string | null): boolean {
  if (!role) return false
  return hasPermission(role, 'edit_six_day_tracker') || hasFullNav(role)
}
