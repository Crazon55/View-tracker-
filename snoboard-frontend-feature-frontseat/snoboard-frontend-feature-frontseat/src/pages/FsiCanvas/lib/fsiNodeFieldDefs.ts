import { PERFORMANCE_LABELS } from "./fsiNodeSchemas";

export type FieldDef = {
  key: string;
  label: string;
  rows?: number;
  inputType?: "text" | "textarea" | "number" | "select";
  selectOptions?: readonly string[];
  linkify?: boolean;
};

/** Whiteboard node fields — minimal, Miro-style. */
export const NODE_FIELD_DEFS: Record<string, FieldDef[]> = {
  "Page Name": [],
  Page: [],
  "Content Pillar": [],
  "Content Bucket": [],
  Visual: [],
  "Visual Pattern": [],
  "Visual Hook": [],
  "Written Hook": [],
  Performance: [
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    { key: "shares", label: "Shares", inputType: "number" },
    { key: "comments", label: "Comments", inputType: "number" },
    { key: "followers_gained", label: "Followers gained", inputType: "number" },
  ],
  "Performance Insight": [
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    { key: "shares", label: "Shares", inputType: "number" },
    { key: "comments", label: "Comments", inputType: "number" },
    { key: "followers_gained", label: "Followers gained", inputType: "number" },
  ],
  Link: [{ key: "url", label: "URL", linkify: true }],
  Frame: [],
  "Hook Pattern": [],
  "Hook Example": [],
  "Post Example": [
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
  ],
};

export function getFieldDefs(nodeType: string): FieldDef[] {
  return NODE_FIELD_DEFS[nodeType] ?? [];
}
