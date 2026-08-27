/**
 * Each playbook uses its own Supabase table set (separate databases):
 *   BPB  → exp_*        (legacy Experiment X data)
 *   XF   → xf_*        (entrepreneurial.india, startupcoded)
 *   TECH → tech_*      (101xtechnology, indiantechdaily)
 */
import { createExpApi, type ExpApi } from "@/services/api";

export type PlaybookId = "bpb" | "xf" | "tech";

export type PlaybookExperimentConfig = {
  id: PlaybookId;
  label: string;
  emoji: string;
  route: string;
  pages: readonly string[];
  pageColors: Record<string, string>;
  pageShort: Record<string, string>;
};

export const PLAYBOOK_CONFIGS: Record<PlaybookId, PlaybookExperimentConfig> = {
  bpb: {
    id: "bpb",
    label: "Content Distribution",
    emoji: "🧪",
    route: "/content-distribution",
    pages: [
      "indianfoundersco",
      "indianbusinesscom",
      "indiastartupstory",
      "indiafounderscore",
      "indiantechdaily",
      "bizzindia",
      "101xfounders",
      "thechangingorder",
      "indiahappeningnow",
    ],
    pageColors: {
      indianfoundersco: "#7BB0FF",
      indianbusinesscom: "#50E0B0",
      indiastartupstory: "#F0C060",
      indiafounderscore: "#B49EFF",
      indiantechdaily: "#FF9580",
      bizzindia: "#5AD1FF",
      "101xfounders": "#FF7EB6",
      thechangingorder: "#9CE87A",
      indiahappeningnow: "#FFD166",
    },
    pageShort: {
      indianfoundersco: "IFC",
      indianbusinesscom: "IBC",
      indiastartupstory: "ISS",
      indiafounderscore: "IFCore",
      indiantechdaily: "ITD",
      bizzindia: "BizzIN",
      "101xfounders": "101xF",
      thechangingorder: "TCO",
      indiahappeningnow: "IHN",
    },
  },
  xf: {
    id: "xf",
    label: "XF Playbook",
    emoji: "📈",
    route: "/experiment-xf",
    pages: ["entrepreneurial.india", "startupcoded"],
    pageColors: {
      "entrepreneurial.india": "#FF9580",
      startupcoded: "#50E0B0",
    },
    pageShort: {
      "entrepreneurial.india": "Ent.India",
      startupcoded: "StartupCoded",
    },
  },
  tech: {
    id: "tech",
    label: "TECH Playbook",
    emoji: "💻",
    route: "/experiment-tech",
    pages: ["101xtechnology", "indiantechdaily", "ai.cracked"],
    pageColors: {
      "101xtechnology": "#7BB0FF",
      indiantechdaily: "#F0C060",
      "ai.cracked": "#50E0B0",
    },
    pageShort: {
      "101xtechnology": "101xTech",
      indiantechdaily: "ITDaily",
      "ai.cracked": "AICracked",
    },
  },
};

export type PlaybookContextValue = PlaybookExperimentConfig & {
  api: ExpApi;
};

export function buildPlaybookContext(id: PlaybookId): PlaybookContextValue {
  const config = PLAYBOOK_CONFIGS[id];
  return { ...config, api: createExpApi(id) };
}

export const PLAYBOOK_NAV_ITEMS = (Object.values(PLAYBOOK_CONFIGS) as PlaybookExperimentConfig[]).map((p) => ({
  to: p.route,
  label: p.label,
  emoji: p.emoji,
}));

/**
 * Coarse editorial format — the News / A-roll / Tech split Content Distribution filters on.
 * Deliberately separate from ExperimentX's finer `video_format` taxonomy
 * ("Viral a-roll", "A-roll massy", "Shark Tank", …): this is the coarse bucket view,
 * stored in its own `content_format` column so the vocabularies don't collide.
 */
export const CONTENT_FORMATS = ["A-roll", "News", "Tech"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_FORMAT_ACCENT: Record<ContentFormat, string> = {
  "A-roll": "#F0C060",
  News: "#50E0B0",
  Tech: "#7BB0FF",
};

/**
 * Who a page-assigned idea can be assigned to, split by content type — Carousel has
 * a smaller pool than Reel. `assigned_to` on the idea stores the display name (matches
 * what shows on the card); `email` is the login this name resolves to, so a video
 * editor's "my tasks" view can match on account rather than a first-name string.
 *
 * Satya (satyabrata.rana@owledmedia.com) hasn't joined yet — no account exists under that
 * email yet, so his "my tasks" filtering silently matches no one until he's onboarded as VE.
 */
export type AssigneeOption = { name: string; email: string };
export const ASSIGNEE_OPTIONS: Record<"carousel" | "reel", AssigneeOption[]> = {
  carousel: [
    { name: "Darshana", email: "darshana.jain@owledmedia.com" },
    { name: "Chitvan", email: "chitvan.pandey@owledmedia.com" },
  ],
  reel: [
    { name: "Shikhar", email: "shikhar.kumar@owledmedia.com" },
    { name: "Mandar", email: "mandar.patil@owledmedia.com" },
    { name: "Satya", email: "satyabrata.rana@owledmedia.com" }, // joining as VE, works reels
    { name: "Sudeep", email: "sudeep.nath@owledmedia.com" },
    { name: "Nitesh", email: "nitesh.gunupudi@owledmedia.com" },
  ],
};

export function assigneeOptionsFor(contentType: string | null | undefined): AssigneeOption[] {
  return (contentType || "").trim().toLowerCase() === "carousel" ? ASSIGNEE_OPTIONS.carousel : ASSIGNEE_OPTIONS.reel;
}

const ASSIGNEE_EMAIL_BY_NAME: Record<string, string> = Object.fromEntries(
  [...ASSIGNEE_OPTIONS.carousel, ...ASSIGNEE_OPTIONS.reel].map((a) => [a.name, a.email.toLowerCase()]),
);

/** True when `email` (the logged-in user) is the account behind an idea's `assigned_to` name. */
export function isAssignee(assignedToName: string | null | undefined, email: string | null | undefined): boolean {
  if (!assignedToName || !email) return false;
  const mapped = ASSIGNEE_EMAIL_BY_NAME[assignedToName];
  return !!mapped && mapped === email.trim().toLowerCase();
}
