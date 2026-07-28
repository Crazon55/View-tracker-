// ─────────────────────────────────────────────────────────────────────────────
// Unified top-nav config. ONLY the real nav sections (matches the old sidebar) —
// grouped Home · Content · Seeding · Team growth · Users. Role-gated via `requires`.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Clapperboard, Timer, Newspaper, Ticket, Scissors, FlaskConical,
  FileText, TrendingUp, ClipboardCheck, Handshake, Plus, Lightbulb,
  Users, ShieldCheck, LayoutDashboard, BarChart3, type LucideIcon,
} from "lucide-react";
import { PLAYBOOK_CONFIGS, type PlaybookId } from "@/lib/playbookExperimentConfig";
import { canSeeAnyNonSeeding, canSeeAnySeeding, canView, type PersonAccess } from "@/lib/accessModel";

export type Gate = "seeding" | "admin"; // undefined = everyone
export type NavLeaf = { to: string; label: string; desc?: string; icon: LucideIcon; external?: boolean };
export type NavMenu =
  | { link: string; label: string; requires?: Gate }
  | { label: string; items: NavLeaf[]; requires?: Gate };

const PLAYBOOK_DESCS: Record<PlaybookId, string> = {
  bpb: "50M+ views — idea engine",
  xf: "Entrepreneur & startup reels",
  tech: "Tech pages experiment bank",
};

const playbookNavLeaves: NavLeaf[] = (["bpb", "xf", "tech"] as const).map((id) => {
  const p = PLAYBOOK_CONFIGS[id];
  return { to: p.route, label: p.label, desc: PLAYBOOK_DESCS[id], icon: FlaskConical };
});

export const NAV: NavMenu[] = [
  { link: "/", label: "Home" },

  { label: "Content", items: [
    { to: "/idea-engine", label: "Idea Engine", desc: "All playbook ideas, one gallery", icon: Lightbulb },
    ...playbookNavLeaves,
    { to: "/news",            label: "News Feed",     desc: "Pre-research feed",      icon: Newspaper },
    { to: "/tickets",         label: "Tickets",       desc: "Bug / request kitchen",  icon: Ticket },
    { to: "http://16.112.125.207:5173/", label: "Pintu", desc: "Batch editor", icon: Scissors, external: true },
  ]},

  { label: "Cops", items: [
    { to: "/six-day-tracker", label: "6-Day Tracker", desc: "Cycles & views", icon: Timer },
  ]},

  { label: "Seeding", requires: "seeding", items: [
    { to: "/seeding",             label: "Overview",         desc: "Revenue & approvals",   icon: LayoutDashboard },
    { to: "/seeding/approvals",   label: "Approval Queue",   desc: "Briefs pending review", icon: ClipboardCheck },
    { to: "/seeding/submit",      label: "Submit Brief",     desc: "Create a new brand deal", icon: Plus },
    { to: "/seeding/deals",       label: "All Deals",        desc: "Every brand deal",      icon: Handshake },
    { to: "/seeding/fulfillment", label: "Fulfillment",      desc: "Deliverables in production", icon: Clapperboard },
    { to: "/seeding/campaign-reports", label: "Campaign Reports", desc: "Performance & live links", icon: BarChart3 },
    { to: "/seeding/pages",       label: "Monetisable Pages",desc: "Deal-eligible pages",   icon: FileText },
    { to: "/seeding/teamwise",    label: "Teamwise Deals",   desc: "By BD team",            icon: Users },
  ]},

  { label: "Team growth", items: [
    { to: "/growth",           label: "Growth",           desc: "Monthly views",   icon: TrendingUp },
    { to: "/pages",            label: "IPs / Pages",      desc: "Tracked pages",   icon: FileText },
  ]},

  { label: "Users", requires: "admin", items: [
    { to: "/seeding/users", label: "Users & Roles", desc: "Access control", icon: ShieldCheck },
  ]},
];

// ── RBAC (TEMP combined FSOS + Seeding roles; redone when models merge) ──
const ADMIN_TIER = ["admin", "boss_man", "ai_dev", "senior_cs", "ai_automations"];

/** @deprecated Prefer canSeeAnySeeding / canView — kept for callers until migrated. */
export function gates(roles: string[]) {
  const r = roles.map((x) => x.trim().toLowerCase());
  const isAdmin = r.some((x) => ADMIN_TIER.includes(x));
  const canSeeding = isAdmin || r.some((x) => ["bd", "fulfillment", "seeding_admin"].includes(x));
  return { admin: isAdmin, seeding: canSeeding };
}

/** Filter the nav to what this user may see. Menu gates respect the per-person
 * access matrix from Users & Roles (not only hard-coded role names). */
export function navForRoles(roles: string[], personAccess?: PersonAccess | null): NavMenu[] {
  const roleStr = roles.join(",");
  return NAV.filter((m) => {
    if ("link" in m && m.link === "/") return canSeeAnyNonSeeding(roleStr, undefined, personAccess);
    if (m.requires === "seeding") return canSeeAnySeeding(roleStr, undefined, personAccess);
    if (m.requires === "admin") return canView(roleStr, "users_roles", undefined, personAccess);
    return true;
  });
}
