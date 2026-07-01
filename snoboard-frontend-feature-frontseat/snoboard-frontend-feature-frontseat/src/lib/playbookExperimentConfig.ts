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
    label: "The Bizz playbook",
    emoji: "🧪",
    route: "/experiment-bpb",
    pages: [
      "indianfoundersco",
      "indianbusinesscom",
      "indiastartupstory",
      "indiafounderscore",
      "indiafounderbrief",
    ],
    pageColors: {
      indianfoundersco: "#7BB0FF",
      indianbusinesscom: "#50E0B0",
      indiastartupstory: "#F0C060",
      indiafounderscore: "#B49EFF",
      indiafounderbrief: "#FF9580",
    },
    pageShort: {
      indianfoundersco: "IFC",
      indianbusinesscom: "IBC",
      indiastartupstory: "ISS",
      indiafounderscore: "IFCore",
      indiafounderbrief: "IFBrief",
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
