// Central domain constants for FSOS. No IP name is ever used as a conditional.
export const STREAMS = { BO: "BO", HPN: "HPN" };
export const STREAM_META = {
  BO: { key: "BO", name: "Blue Ocean", short: "BO", badge: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-600" },
  HPN: { key: "HPN", name: "Happenings", short: "HPN", badge: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-600" },
};

export const FORMATS = ["Reel", "Carousel", "Static"];
// Carousel & Static count toward Posts, Reel counts toward Reels.
export const formatCounts = (fmt) => (fmt === "Reel" ? { reels: 1, posts: 0 } : { reels: 0, posts: 1 });

// Version review lifecycle (production/approval state)
export const VSTATUS = {
  not_started: "Not started",
  in_production: "In production",
  awaiting_review: "Awaiting review",
  changes_requested: "Changes requested",
  ready: "Ready",
};

/**
 * How urgent an idea is for whoever is producing it.
 *
 * A deadline says when something is due; it does not say what to drop. Two things due
 * Friday can be very different amounts of "now", and that difference was living in
 * whoever remembered to say it out loud. `rank` is what "My work" sorts on — P0 first.
 *
 * The wording is aimed at the person picking the work up, not at the person setting it,
 * which is why each one says what to do rather than how bad it would be.
 */
export const PRIORITIES = {
  P0: {
    label: "P0",
    short: "Drop everything",
    blurb: "Put everything else down — this is the only thing you are on until it ships.",
    rank: 0,
    badge: "bg-rose-600 text-white border-rose-700",
    chip: "bg-rose-50 text-rose-700 border-rose-300",
  },
  P1: {
    label: "P1",
    short: "Move on it",
    blurb: "Important. Get it moving quickly, ahead of anything sitting at P2.",
    rank: 1,
    badge: "bg-amber-500 text-white border-amber-600",
    chip: "bg-amber-50 text-amber-800 border-amber-300",
  },
  P2: {
    label: "P2",
    short: "When you are clear",
    blurb: "Pick this up once your P0 and P1 work is clear. No rush on it before then.",
    rank: 2,
    badge: "bg-stone-200 text-stone-700 border-stone-300",
    chip: "bg-stone-100 text-stone-600 border-stone-300",
  },
};

export const PRIORITY_KEYS = Object.keys(PRIORITIES);
export const DEFAULT_PRIORITY = "P1";

/** Sort rank for an idea, tolerating a row written before priority existed. */
export function priorityRank(idea) {
  return PRIORITIES[idea?.priority]?.rank ?? PRIORITIES[DEFAULT_PRIORITY].rank;
}

// Idea-level derived states used as filters
export const IDEA_STATES = {
  draft: { label: "Draft", badge: "bg-stone-100 text-stone-700 border-stone-300" },
  awaiting_approval: { label: "Awaiting idea approval", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  rejected: { label: "Rejected", badge: "bg-rose-200 text-rose-900 border-rose-400" },
  approved_unassigned: { label: "Approved / Unassigned", badge: "bg-sky-100 text-sky-800 border-sky-300" },
  in_production: { label: "In production", badge: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  awaiting_review: { label: "Awaiting review", badge: "bg-purple-100 text-purple-800 border-purple-300" },
  changes_requested: { label: "Changes requested", badge: "bg-rose-100 text-rose-800 border-rose-300" },
  ready: { label: "Ready", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  partly_published: { label: "Partly published", badge: "bg-teal-100 text-teal-800 border-teal-300" },
  published: { label: "Published", badge: "bg-stone-900 text-stone-100 border-stone-800" },
};

export const VSTATUS_BADGE = {
  not_started: "bg-stone-100 text-stone-600 border-stone-300",
  in_production: "bg-indigo-100 text-indigo-800 border-indigo-300",
  awaiting_review: "bg-purple-100 text-purple-800 border-purple-300",
  changes_requested: "bg-rose-100 text-rose-800 border-rose-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export const PLACEMENT_STATE = { pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled" };

export const ROLES = [
  "Founder/Admin",
  "Short-form Lead",
  "CS",
  "COA",
  "Designer",
  "Editor",
  "COC",
];

export const PERF_TIER = {
  good: "bg-emerald-50 text-emerald-800 border-emerald-200",
  average: "bg-amber-50 text-amber-800 border-amber-200",
  bad: "bg-rose-50 text-rose-800 border-rose-200",
  unrated: "bg-stone-100 text-stone-600 border-stone-300",
};

// `area` links each item to the access matrix (domain/access.js); `section` groups the sidebar.
export const NAV = [
  { id: "command-room", path: "/", label: "Command Room", icon: "LayoutDashboard", area: "command_room", section: "Workspace" },
  { id: "bo-studio", path: "/bo", label: "BO Studio", icon: "Compass", area: "bo_studio", section: "Workspace" },
  { id: "hpn-desk", path: "/hpn", label: "HPN Desk", icon: "Flame", area: "hpn_desk", section: "Workspace" },
  { id: "production", path: "/production", label: "Production", icon: "Clapperboard", area: "production", section: "Workspace" },
  { id: "distribution", path: "/distribution", label: "Distribution", icon: "CalendarDays", area: "distribution", section: "Workspace" },
  { id: "performance", path: "/performance", label: "Performance", icon: "BarChart3", area: "performance", section: "Workspace" },
  { id: "news", path: "/news", label: "News Feed", icon: "Newspaper", area: "news", section: "Tools" },
  { id: "pintu", path: "http://16.112.125.207:5173/", label: "Pintu", icon: "Scissors", area: "pintu", section: "Tools", external: true },
  { id: "six-day", path: "/six-day-tracker", label: "6-Day Tracker", icon: "Timer", area: "six_day", section: "Tools" },
  { id: "growth", path: "/growth", label: "Growth", icon: "TrendingUp", area: "growth", section: "Tools" },
  { id: "users-roles", path: "/users-roles", label: "Users & Roles", icon: "ShieldCheck", area: "users_roles", section: "Admin" },
  { id: "settings", path: "/settings", label: "Settings", icon: "Settings", area: "settings", section: "Admin" },
];

export const DEFAULT_CATEGORIES = [
  { id: "cat-aroll", name: "A-roll clip", stream: "BO" },
  { id: "cat-case", name: "Case study", stream: "BO" },
  { id: "cat-fact", name: "Fact static", stream: "BO" },
  { id: "cat-statement", name: "Statement", stream: "BO" },
  { id: "cat-proven", name: "Proven BO", stream: "BO" },
  { id: "cat-news", name: "News roundup", stream: "HPN" },
  { id: "cat-happening", name: "Happening", stream: "HPN" },
  { id: "cat-massive", name: "Massive happening", stream: "HPN" },
];

// Illustrative demo classification thresholds (editable in Settings)
export const DEFAULT_THRESHOLDS = { good: 100, average: 50 }; // percent of target
export const DEFAULT_BASELINE_SAMPLE = 5;
