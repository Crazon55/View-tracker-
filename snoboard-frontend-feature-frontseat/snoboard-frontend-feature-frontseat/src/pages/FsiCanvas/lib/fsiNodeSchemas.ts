export const STUDY_TYPES = [
  "Whiteboard", // keep in sync with migrations/fsi_schema_sync.sql
  "Page Study",
  "Carousel Study",
  "Hook Study",
  "Visual Pattern Study",
  "Competitor Study",
  "Client Narrative Study",
  "New Page Strategy",
] as const;

export type StudyType = (typeof STUDY_TYPES)[number];

export const IRON_NODE_TYPES = [
  "Post Example",
  "Hook Pattern",
  "Content Bucket",
  "Strategist Note",
] as const;

export type IronNodeType = (typeof IRON_NODE_TYPES)[number];

export const PRD_NODE_TYPES = [
  "Page",
  "Niche",
  "Post Example",
  "Carousel Example",
  "Reel Example",
  "Content Pillar",
  "Content Bucket",
  "Hook Pattern",
  "Hook Example",
  "Visual Pattern",
  "Topic Pattern",
  "Audience Insight",
  "Strategy Rule",
  "Warning / What To Avoid",
  "Repeatable Formula",
  "Client Narrative Angle",
  "Strategist Note",
  "Performance Insight",
] as const;

export type PrdNodeType = (typeof PRD_NODE_TYPES)[number];

export const PERFORMANCE_LABELS = [
  "Viral",
  "Strong",
  "Above Average",
  "Average",
  "Below Average",
  "Failed",
  "Experimental",
] as const;

export type FsiNodeRecord = {
  id: string;
  study_id: string;
  parent_node_id?: string | null;
  node_type: string;
  display_title: string;
  canvas_x: number;
  canvas_y: number;
  structured_payload: Record<string, unknown>;
  raw_body_text?: string | null;
  tags?: string[] | null;
  created_by: string;
  created_at?: string;
  updated_at?: string;
};

export type FsiConnectionRecord = {
  id: string;
  study_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_label_note?: string | null;
  source_handle?: string | null;
  target_handle?: string | null;
  created_by: string;
};

export type FsiStudy = {
  id: string;
  title: string;
  study_type: StudyType;
  target_account: string;
  niche_vertical: string;
  owner_id: string;
  execution_date: string;
  meta_notes?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type FsiGraph = {
  study: FsiStudy;
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
};

export type PostExamplePayload = {
  source_url?: string;
  account_handle?: string;
  target_network?: string;
  format_classification?: string;
  performance_label?: string;
  views?: number | "";
  likes?: number | "";
  shares?: number | "";
  saves?: number | "";
  comments?: number | "";
  follows_gained?: number | "";
  title_hook_text?: string;
  visual_intro_design?: string;
  anchor_subject_matter?: string;
  connected_pillar?: string;
  target_bucket?: string;
  hook_structural_grouping?: string;
  graphic_style_tags?: string;
  strategist_observation_note?: string;
};

export type HookPatternPayload = {
  title_descriptor?: string;
  structural_group_type?: string;
  raw_archetype_template?: string;
  emotional_ingestion_variable?: string;
  curiosity_gap_mechanism?: string;
  target_demographic_profile?: string;
  operational_rules?: string;
  representative_post_reference_urls?: string;
  strategist_observation_note?: string;
};

export type ContentBucketPayload = {
  operational_label?: string;
  parent_pillar_association?: string;
  contextual_subject_bound?: string;
  production_topics?: string;
  reusable_seed_hooks?: string;
  target_distribution_formats?: string;
  target_output_handle?: string;
  strategist_observation_note?: string;
};

export type StrategistNotePayload = {
  observation?: string;
};

export const NODE_TYPE_COLORS: Record<string, string> = {
  "Page Name": "#6366f1",
  Page: "#6366f1",
  Niche: "#6366f1",
  "Content Pillar": "#84cc16",
  "Content Bucket": "#22c55e",
  Visual: "#ec4899",
  "Visual Pattern": "#ec4899",
  "Visual Hook": "#a855f7",
  "Written Hook": "#c084fc",
  "Carousel Body": "#6366f1",
  Performance: "#64748b",
  "Performance Insight": "#64748b",
  Link: "#3b82f6",
  "Sticky Note": "#eab308",
  Frame: "#71717a",
  "Post Example": "#3b82f6",
  "Carousel Example": "#06b6d4",
  "Reel Example": "#14b8a6",
  "Hook Pattern": "#a855f7",
  "Hook Example": "#c084fc",
  "Topic Pattern": "#f472b6",
  "Audience Insight": "#f97316",
  "Strategy Rule": "#eab308",
  "Warning / What To Avoid": "#ef4444",
  "Repeatable Formula": "#10b981",
  "Client Narrative Angle": "#8b5cf6",
  "Strategist Note": "#f59e0b",
};

export function colorForNodeType(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? "#22c55e";
}

export function defaultPayloadForType(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "Visual":
      return { is_screenshot: true, image_url: "" };
    case "Visual Hook":
    case "Written Hook":
      return { hook_text: "", ui_expanded: false };
    case "Carousel Body":
      return { ui_expanded: false, slides_content: [""] };
    case "Performance":
    case "Performance Insight":
      return { views: "", likes: "", shares: "", comments: "", followers_gained: "" };
    case "Link":
      return { url: "", label: "" };
    case "Sticky Note":
      return { is_sticky: true, is_note: true };
    case "Frame":
      return { is_frame: true, frame_width: 520, frame_height: 360 };
    default:
      return {};
  }
}

export function defaultTitleForType(nodeType: string): string {
  if (nodeType === "Sticky Note") return "Note";
  if (nodeType === "Frame") return "Frame 1";
  return nodeType;
}

export function notePayload(noteKind: string): Record<string, unknown> {
  return { is_note: true, note_kind: noteKind };
}

/** @deprecated use notePayload */
export function freeformPayload(): Record<string, unknown> {
  return notePayload("blank");
}

export function appendGraphNode(graph: FsiGraph, node: FsiNodeRecord): FsiGraph {
  if (graph.nodes.some((n) => n.id === node.id)) return graph;
  return { ...graph, nodes: [...graph.nodes, node] };
}

export const SUMMARY_SECTION_LABELS: Record<string, string> = {
  core_strategy_synthesis: "Core Strategy Synthesis",
  quantified_performance_multipliers: "Quantified Performance Multipliers",
  systematized_hook_architecture: "Systematized Hook Architecture",
  screen_layout_typography_patterns: "Screen Layout & Typography Patterns",
  reusable_formula_array: "Reusable Formula Array",
  operational_guardrails: "Operational Guardrails",
  discovered_analytical_gaps: "Discovered Analytical Gaps",
};
