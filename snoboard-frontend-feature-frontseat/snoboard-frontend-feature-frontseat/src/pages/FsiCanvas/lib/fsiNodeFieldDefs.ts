import { PERFORMANCE_LABELS } from "./fsiNodeSchemas";

export type FieldDef = {
  key: string;
  label: string;
  rows?: number;
  inputType?: "text" | "textarea" | "number" | "select";
  selectOptions?: readonly string[];
  linkify?: boolean;
};

const OBS: FieldDef = {
  key: "strategist_observation_note",
  label: "Strategist observation",
  rows: 3,
  inputType: "textarea",
};

const PERF: FieldDef = {
  key: "performance_label",
  label: "Performance label",
  inputType: "select",
  selectOptions: PERFORMANCE_LABELS,
};

/** PRD-aligned structured fields per node type (rendered inline on canvas when selected). */
export const NODE_FIELD_DEFS: Record<string, FieldDef[]> = {
  Page: [
    { key: "page_handle", label: "Page / account handle" },
    { key: "primary_platform", label: "Primary platform" },
    { key: "niche_summary", label: "Niche summary", rows: 2, inputType: "textarea" },
    OBS,
  ],
  Niche: [
    { key: "vertical_description", label: "Vertical / category", rows: 2, inputType: "textarea" },
    { key: "target_audience", label: "Target audience" },
    OBS,
  ],
  "Content Pillar": [
    { key: "pillar_theme", label: "Pillar theme" },
    { key: "content_themes", label: "Content themes", rows: 2, inputType: "textarea" },
    { key: "target_audience", label: "Target audience" },
    OBS,
  ],
  "Content Bucket": [
    { key: "operational_label", label: "Operational label" },
    { key: "parent_pillar_association", label: "Parent pillar" },
    { key: "contextual_subject_bound", label: "Subject bound", rows: 2, inputType: "textarea" },
    { key: "production_topics", label: "Production topics", rows: 2, inputType: "textarea" },
    { key: "reusable_seed_hooks", label: "Reusable seed hooks", rows: 2, inputType: "textarea" },
    { key: "target_distribution_formats", label: "Distribution formats" },
    { key: "target_output_handle", label: "Target output handle" },
    OBS,
  ],
  "Post Example": [
    { key: "source_url", label: "Source URL", linkify: true },
    { key: "account_handle", label: "Account handle" },
    { key: "target_network", label: "Target network" },
    { key: "format_classification", label: "Format classification" },
    PERF,
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    { key: "shares", label: "Shares", inputType: "number" },
    { key: "saves", label: "Saves", inputType: "number" },
    { key: "comments", label: "Comments", inputType: "number" },
    { key: "follows_gained", label: "Follows gained", inputType: "number" },
    { key: "title_hook_text", label: "Title hook text", rows: 2, inputType: "textarea" },
    { key: "visual_intro_design", label: "Visual intro design", rows: 2, inputType: "textarea" },
    { key: "anchor_subject_matter", label: "Anchor subject matter" },
    { key: "connected_pillar", label: "Connected pillar" },
    { key: "target_bucket", label: "Target bucket" },
    { key: "hook_structural_grouping", label: "Hook structural grouping" },
    { key: "graphic_style_tags", label: "Graphic style tags" },
    OBS,
  ],
  "Carousel Example": [
    { key: "source_url", label: "Source URL", linkify: true },
    { key: "account_handle", label: "Account handle" },
    { key: "slide_count", label: "Slide count", inputType: "number" },
    PERF,
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    { key: "saves", label: "Saves", inputType: "number" },
    { key: "hook_slide_text", label: "Hook slide text", rows: 2, inputType: "textarea" },
    { key: "visual_pattern_tags", label: "Visual pattern tags" },
    { key: "cta_pattern", label: "CTA pattern" },
    OBS,
  ],
  "Reel Example": [
    { key: "source_url", label: "Source URL", linkify: true },
    { key: "account_handle", label: "Account handle" },
    PERF,
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    { key: "shares", label: "Shares", inputType: "number" },
    { key: "hook_opening_text", label: "Hook opening text", rows: 2, inputType: "textarea" },
    { key: "pacing_notes", label: "Pacing / edit notes", rows: 2, inputType: "textarea" },
    { key: "audio_pattern", label: "Audio pattern" },
    OBS,
  ],
  "Hook Pattern": [
    { key: "title_descriptor", label: "Title descriptor" },
    { key: "structural_group_type", label: "Structural group type" },
    { key: "raw_archetype_template", label: "Raw archetype template", rows: 3, inputType: "textarea" },
    { key: "emotional_ingestion_variable", label: "Emotional ingestion variable" },
    { key: "curiosity_gap_mechanism", label: "Curiosity gap mechanism", rows: 2, inputType: "textarea" },
    { key: "target_demographic_profile", label: "Target demographic profile" },
    { key: "operational_rules", label: "Operational rules", rows: 3, inputType: "textarea" },
    {
      key: "representative_post_reference_urls",
      label: "Reference post URLs",
      rows: 2,
      inputType: "textarea",
      linkify: true,
    },
    OBS,
  ],
  "Hook Example": [
    { key: "hook_text", label: "Hook text", rows: 3, inputType: "textarea" },
    { key: "source_url", label: "Source URL", linkify: true },
    { key: "structural_group_type", label: "Structural group type" },
    PERF,
    { key: "views", label: "Views", inputType: "number" },
    { key: "likes", label: "Likes", inputType: "number" },
    OBS,
  ],
  "Visual Pattern": [
    { key: "pattern_name", label: "Pattern name" },
    { key: "layout_structure", label: "Layout structure", rows: 2, inputType: "textarea" },
    { key: "typography_notes", label: "Typography notes", rows: 2, inputType: "textarea" },
    { key: "color_palette", label: "Color palette" },
    {
      key: "reference_urls",
      label: "Reference URLs",
      rows: 2,
      inputType: "textarea",
      linkify: true,
    },
    OBS,
  ],
  "Topic Pattern": [
    { key: "topic_cluster", label: "Topic cluster" },
    { key: "recurrence_pattern", label: "Recurrence pattern", rows: 2, inputType: "textarea" },
    { key: "seasonal_triggers", label: "Seasonal triggers" },
    OBS,
  ],
  "Audience Insight": [
    { key: "insight_summary", label: "Insight summary", rows: 3, inputType: "textarea" },
    { key: "demographic", label: "Demographic" },
    { key: "pain_points", label: "Pain points", rows: 2, inputType: "textarea" },
    { key: "desires_motivations", label: "Desires / motivations", rows: 2, inputType: "textarea" },
    OBS,
  ],
  "Strategy Rule": [
    { key: "rule_statement", label: "Rule statement", rows: 3, inputType: "textarea" },
    { key: "when_to_apply", label: "When to apply", rows: 2, inputType: "textarea" },
    { key: "exceptions", label: "Exceptions", rows: 2, inputType: "textarea" },
    OBS,
  ],
  "Warning / What To Avoid": [
    { key: "warning_statement", label: "Warning", rows: 3, inputType: "textarea" },
    { key: "examples_to_avoid", label: "Examples to avoid", rows: 2, inputType: "textarea" },
    { key: "why_it_fails", label: "Why it fails", rows: 2, inputType: "textarea" },
    OBS,
  ],
  "Repeatable Formula": [
    { key: "formula_name", label: "Formula name" },
    { key: "formula_steps", label: "Formula steps", rows: 4, inputType: "textarea" },
    { key: "variables", label: "Variables / slots", rows: 2, inputType: "textarea" },
    OBS,
  ],
  "Client Narrative Angle": [
    { key: "narrative_angle", label: "Narrative angle", rows: 3, inputType: "textarea" },
    { key: "tone_voice", label: "Tone / voice" },
    { key: "key_messages", label: "Key messages", rows: 3, inputType: "textarea" },
    { key: "proof_points", label: "Proof points", rows: 2, inputType: "textarea" },
    OBS,
  ],
  "Performance Insight": [
    { key: "metric_focus", label: "Metric focus" },
    PERF,
    { key: "quantified_delta", label: "Quantified delta / multiplier" },
    { key: "observation", label: "Observation", rows: 4, inputType: "textarea" },
    { key: "supporting_examples", label: "Supporting examples", rows: 2, inputType: "textarea" },
  ],
  "Strategist Note": [
    { key: "observation", label: "Observation", rows: 6, inputType: "textarea" },
  ],
};

export function getFieldDefs(nodeType: string): FieldDef[] {
  return NODE_FIELD_DEFS[nodeType] ?? [];
}
