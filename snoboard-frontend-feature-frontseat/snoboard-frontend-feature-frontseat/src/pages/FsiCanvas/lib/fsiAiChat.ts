import { SUMMARY_SECTION_LABELS } from "../lib/fsiNodeSchemas";

export type SummaryData = Record<string, string | string[]>;

export type YoutubeResearchMeta = {
  ran: boolean;
  query?: string | null;
  video_count?: number;
  errors?: string[];
};

export type FsiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  youtubeResearch?: YoutubeResearchMeta;
};

export type FsiChatReply = {
  reply: string;
  youtubeResearch?: YoutubeResearchMeta;
};

export function formatSummaryForChat(summary: SummaryData): string {
  const parts: string[] = ["**Strategy blueprint generated from your canvas:**", ""];
  for (const [key, label] of Object.entries(SUMMARY_SECTION_LABELS)) {
    const content = summary[key];
    if (!content || (Array.isArray(content) && content.length === 0)) continue;
    parts.push(`**${label}**`);
    if (Array.isArray(content)) {
      parts.push(...content.map((item) => `• ${item}`));
    } else {
      parts.push(content);
    }
    parts.push("");
  }
  return parts.join("\n").trim();
}

export function loadChatHistory(studyId: string): FsiChatMessage[] {
  try {
    const raw = sessionStorage.getItem(`fsi-chat-${studyId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FsiChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(studyId: string, messages: FsiChatMessage[]) {
  try {
    sessionStorage.setItem(`fsi-chat-${studyId}`, JSON.stringify(messages.slice(-40)));
  } catch {
    /* quota */
  }
}

export const FSI_CHAT_WELCOME: FsiChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "I'm your FSI research assistant. Every message I receive includes a **full snapshot** of your canvas — all nodes, payloads, connections, and study metadata.\n\nTry **What's on my canvas?**, **Generate strategy summary**, or **Research YouTube podcasts about [brand/person]**.",
};

export const FSI_YOUTUBE_RESEARCH_PROMPT = "Research YouTube podcasts about ";
