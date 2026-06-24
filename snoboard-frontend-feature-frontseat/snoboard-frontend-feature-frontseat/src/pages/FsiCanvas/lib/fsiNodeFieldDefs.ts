import type { IronNodeType } from "./fsiNodeSchemas";
import { PERFORMANCE_LABELS } from "./fsiNodeSchemas";

export type FieldDef = {
  key: string;
  label: string;
  rows?: number;
  inputType?: "text" | "textarea" | "number" | "select";
  selectOptions?: readonly string[];
};

export const NODE_FIELD_DEFS: Record<IronNodeType, FieldDef[]> = {
  "Content Bucket": [
    { key: "operational_label", label: "Operational label" },
    { key: "parent_pillar_association", label: "Parent pillar association" },
    { key: "contextual_subject_bound", label: "Contextual subject bound", rows: 2, inputType: "textarea" },
    { key: "production_topics", label: "Production topics", rows: 2, inputType: "textarea" },
    { key: "reusable_seed_hooks", label: "Reusable seed hooks", rows: 3, inputType: "textarea" },
    { key: "target_distribution_formats", label: "Target distribution formats" },
    { key: "target_output_handle", label: "Target output handle" },
    { key: "strategist_observation_note", label: "Strategist observation", rows: 3, inputType: "textarea" },
  ],
  "Hook Pattern": [
    { key: "title_descriptor", label: "Title descriptor" },
    { key: "structural_group_type", label: "Structural group type" },
    { key: "raw_archetype_template", label: "Raw archetype template", rows: 3, inputType: "textarea" },
    { key: "emotional_ingestion_variable", label: "Emotional ingestion variable" },
    { key: "curiosity_gap_mechanism", label: "Curiosity gap mechanism", rows: 2, inputType: "textarea" },
    { key: "target_demographic_profile", label: "Target demographic profile" },
    { key: "operational_rules", label: "Operational rules", rows: 3, inputType: "textarea" },
    { key: "representative_post_reference_urls", label: "Reference post URLs", rows: 2, inputType: "textarea" },
    { key: "strategist_observation_note", label: "Strategist observation", rows: 3, inputType: "textarea" },
  ],
  "Post Example": [
    { key: "source_url", label: "Source URL" },
    { key: "account_handle", label: "Account handle" },
    { key: "target_network", label: "Target network" },
    { key: "format_classification", label: "Format classification" },
    { key: "performance_label", label: "Performance label", inputType: "select", selectOptions: PERFORMANCE_LABELS },
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
    { key: "strategist_observation_note", label: "Strategist observation", rows: 3, inputType: "textarea" },
  ],
  "Strategist Note": [
    { key: "observation", label: "Observation", rows: 6, inputType: "textarea" },
  ],
};

export function getFieldDefs(nodeType: string): FieldDef[] {
  if (nodeType === "Niche") {
    return [
      { key: "niche_label", label: "Niche name" },
      { key: "vertical_description", label: "Vertical / category", rows: 2, inputType: "textarea" },
      { key: "target_audience", label: "Target audience" },
      { key: "strategist_observation_note", label: "Strategist observation", rows: 3, inputType: "textarea" },
    ];
  }
  return (NODE_FIELD_DEFS as Record<string, FieldDef[]>)[nodeType] ?? [];
}
