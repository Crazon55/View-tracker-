// ─────────────────────────────────────────────────────────────────────────────
// RBAC — single source of truth for roles, permissions, and nav access.
//
// Adding a new role:
//   1. Add an entry to ROLE_PERMISSIONS below.
//   2. Add an entry to ROLE_NAV below.
//   3. Add a matching entry to the ROLES array in AuthContext.tsx.
//
// Changing a role's access:
//   Edit only this file — no component code needs to change.
// ─────────────────────────────────────────────────────────────────────────────

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
  | 'post_tracker_assigned_only'  // in Post Tracker only: see ideas where tagged (designer override)
  | 'add_experiment_idea'         // create ideas in Experiment X (Pulkit, Varun only)

// ── Reusable permission sets ──────────────────────────────────────────────────

const ADMIN_PERMISSIONS: Permission[] = [
  'view_all_ideas',
  'create_idea',
  'edit_any_idea',
  'delete_any_idea',
  'tag_collaborator',
  'comment_on_idea',
  'filter_by_person',
  'view_scheduled',
  'view_scheduled_any',
  'add_view_count',
  'view_top_posts',
  'attach_file_to_idea',
  'add_experiment_idea',
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
    'view_all_ideas',
    'create_idea',
    'edit_own_idea',
    'delete_own_idea',
    'comment_on_idea',
    'add_experiment_idea',
  ],

  // Other roles
  ops_manager:      ['view_all_ideas', 'comment_on_idea', 'view_scheduled', 'view_scheduled_any'],
  content_creators: ['view_all_ideas', 'create_idea', 'edit_own_idea', 'delete_own_idea', 'comment_on_idea'],

  // ── Backwards compatibility aliases ───────────────────────────────────────
  // Users who had these old role values in localStorage still get correct access.
  admin:          ADMIN_PERMISSIONS,
  ai_automations: ADMIN_PERMISSIONS,
  post_designer:  COLLABORATOR_PERMISSIONS,
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
  ops_manager:      '*',
  content_creators: ['/', '/six-day-tracker', '/team-performance', '/workboard', '/tickets', '/news', '/blue-ocean', '/growth'],
  experiment_x:     ['/', '/experiment-x', '/content-tracker', '/tickets'],
}

export function isRouteAllowed(role: string | null, path: string): boolean {
  if (!role) return false
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
