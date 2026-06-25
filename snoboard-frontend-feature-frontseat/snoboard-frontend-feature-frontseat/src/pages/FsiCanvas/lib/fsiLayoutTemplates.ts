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
