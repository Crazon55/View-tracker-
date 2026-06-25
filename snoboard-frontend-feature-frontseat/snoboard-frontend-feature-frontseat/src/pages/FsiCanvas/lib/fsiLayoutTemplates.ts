import type { StudyType } from "./fsiNodeSchemas";
import { defaultPayloadForType, defaultTitleForType, notePayload } from "./fsiNodeSchemas";
import { NOTE_TEMPLATES } from "./fsiNoteTemplates";

export type LayoutTemplateNodeSpec = {
  nodeType: string;
  title?: string;
  x: number;
  y: number;
  structured_payload?: Record<string, unknown>;
  raw_body_text?: string;
  /** Quick note — uses Strategist Note + notePayload */
  noteKey?: string;
};

export type LayoutTemplateConnectionSpec = {
  fromIndex: number;
  toIndex: number;
  edge_label_note?: string;
};

export type FsiLayoutTemplate = {
  id: string;
  label: string;
  description: string;
  studyTypes: readonly StudyType[];
  nodes: LayoutTemplateNodeSpec[];
  connections: LayoutTemplateConnectionSpec[];
};

export const FSI_LAYOUT_TEMPLATES: FsiLayoutTemplate[] = [
  {
    id: "page-research",
    label: "Page Research",
    description: "Page → Niche → pillars → bucket → post example",
    studyTypes: ["Page Study", "Competitor Study", "New Page Strategy"],
    nodes: [
      { nodeType: "Page", title: "Page", x: 400, y: 32 },
      { nodeType: "Niche", title: "Niche", x: 400, y: 168 },
      { nodeType: "Content Pillar", title: "Pillar 1", x: 120, y: 320 },
      { nodeType: "Content Pillar", title: "Pillar 2", x: 400, y: 320 },
      { nodeType: "Content Pillar", title: "Pillar 3", x: 680, y: 320 },
      { nodeType: "Content Bucket", title: "Content bucket", x: 400, y: 472 },
      { nodeType: "Post Example", title: "Post Example", x: 400, y: 624 },
      { noteKey: "views", x: 680, y: 600 },
      { noteKey: "likes", x: 680, y: 680 },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 1, toIndex: 3 },
      { fromIndex: 1, toIndex: 4 },
      { fromIndex: 3, toIndex: 5 },
      { fromIndex: 5, toIndex: 6 },
    ],
  },
  {
    id: "visual-teardown",
    label: "Visual Teardown",
    description: "Visual pattern column with post & carousel examples",
    studyTypes: ["Visual Pattern Study", "Carousel Study", "Page Study"],
    nodes: [
      { nodeType: "Visual Pattern", title: "Visual Pattern", x: 200, y: 80 },
      { nodeType: "Post Example", title: "Post Example", x: 520, y: 80 },
      { nodeType: "Carousel Example", title: "Carousel Example", x: 520, y: 280 },
      { nodeType: "Hook Pattern", title: "Hook Pattern", x: 200, y: 320 },
      { nodeType: "Strategist Note", title: "Strategist Note", x: 360, y: 480, structured_payload: { observation: "" } },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1, edge_label_note: "example" },
      { fromIndex: 0, toIndex: 2, edge_label_note: "carousel ref" },
      { fromIndex: 0, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
    ],
  },
  {
    id: "hook-study",
    label: "Hook Study",
    description: "Hook pattern → examples → post proof → performance",
    studyTypes: ["Hook Study"],
    nodes: [
      { nodeType: "Hook Pattern", title: "Hook Pattern", x: 200, y: 80 },
      { nodeType: "Hook Example", title: "Hook Example 1", x: 520, y: 40 },
      { nodeType: "Hook Example", title: "Hook Example 2", x: 520, y: 200 },
      { nodeType: "Post Example", title: "Post Example", x: 520, y: 360 },
      { nodeType: "Performance Insight", title: "Performance Insight", x: 200, y: 360 },
      { noteKey: "blank", x: 200, y: 520 },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1, edge_label_note: "example" },
      { fromIndex: 0, toIndex: 2, edge_label_note: "example" },
      { fromIndex: 1, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
      { fromIndex: 0, toIndex: 5 },
    ],
  },
  {
    id: "client-narrative",
    label: "Client Narrative",
    description: "Narrative angle → pillar → hook → strategist note",
    studyTypes: ["Client Narrative Study"],
    nodes: [
      { nodeType: "Client Narrative Angle", title: "Narrative Angle", x: 400, y: 48 },
      { nodeType: "Content Pillar", title: "Content Pillar", x: 400, y: 200 },
      { nodeType: "Hook Pattern", title: "Hook Pattern", x: 400, y: 352 },
      { nodeType: "Strategist Note", title: "Strategist Note", x: 400, y: 504, structured_payload: { observation: "" } },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 2, toIndex: 3 },
    ],
  },
  {
    id: "carousel-study",
    label: "Carousel Study",
    description: "Carousel example with hook + visual pattern",
    studyTypes: ["Carousel Study"],
    nodes: [
      { nodeType: "Carousel Example", title: "Carousel Example", x: 400, y: 80 },
      { nodeType: "Hook Pattern", title: "Hook Pattern", x: 120, y: 280 },
      { nodeType: "Visual Pattern", title: "Visual Pattern", x: 680, y: 280 },
      { nodeType: "Content Bucket", title: "Content Bucket", x: 400, y: 440 },
      { noteKey: "blank", x: 400, y: 600 },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1, edge_label_note: "hook" },
      { fromIndex: 0, toIndex: 2, edge_label_note: "visual" },
      { fromIndex: 0, toIndex: 3 },
      { fromIndex: 3, toIndex: 4 },
    ],
  },
  {
    id: "competitor-snapshot",
    label: "Competitor Snapshot",
    description: "Page → niche → post + hook + performance read",
    studyTypes: ["Competitor Study"],
    nodes: [
      { nodeType: "Page", title: "Competitor Page", x: 400, y: 40 },
      { nodeType: "Niche", title: "Niche", x: 400, y: 180 },
      { nodeType: "Post Example", title: "Post Example", x: 160, y: 360 },
      { nodeType: "Hook Pattern", title: "Hook Pattern", x: 400, y: 360 },
      { nodeType: "Performance Insight", title: "Performance Insight", x: 640, y: 360 },
      { nodeType: "Audience Insight", title: "Audience Insight", x: 400, y: 520 },
    ],
    connections: [
      { fromIndex: 0, toIndex: 1 },
      { fromIndex: 1, toIndex: 2 },
      { fromIndex: 1, toIndex: 3 },
      { fromIndex: 2, toIndex: 4 },
      { fromIndex: 1, toIndex: 5 },
    ],
  },
];

export function layoutTemplatesForStudy(studyType: StudyType): FsiLayoutTemplate[] {
  return FSI_LAYOUT_TEMPLATES.filter((t) => t.studyTypes.includes(studyType));
}

export function resolveTemplateNode(spec: LayoutTemplateNodeSpec): {
  node_type: string;
  display_title: string;
  canvas_x: number;
  canvas_y: number;
  structured_payload: Record<string, unknown>;
  raw_body_text?: string;
} {
  if (spec.noteKey) {
    const tpl = NOTE_TEMPLATES.find((t) => t.key === spec.noteKey);
    return {
      node_type: "Strategist Note",
      display_title: "Note",
      canvas_x: spec.x,
      canvas_y: spec.y,
      structured_payload: notePayload(spec.noteKey),
      raw_body_text: tpl?.body ?? "",
    };
  }
  return {
    node_type: spec.nodeType,
    display_title: spec.title ?? defaultTitleForType(spec.nodeType),
    canvas_x: spec.x,
    canvas_y: spec.y,
    structured_payload: spec.structured_payload ?? defaultPayloadForType(spec.nodeType),
    raw_body_text: spec.raw_body_text,
  };
}
