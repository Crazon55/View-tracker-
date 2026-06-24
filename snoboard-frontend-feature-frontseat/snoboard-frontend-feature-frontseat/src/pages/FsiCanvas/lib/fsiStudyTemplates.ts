import type { StudyType } from "./fsiNodeSchemas";

/** PRD-derived: which node types are suggested per study type (editable config). */
export const STUDY_NODE_TEMPLATES: Record<StudyType, readonly string[]> = {
  "Page Study": [
    "Page",
    "Content Pillar",
    "Content Bucket",
    "Post Example",
    "Carousel Example",
    "Reel Example",
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
  ],
  "Carousel Study": [
    "Carousel Example",
    "Hook Pattern",
    "Visual Pattern",
    "Content Bucket",
    "Post Example",
    "Strategist Note",
  ],
  "Hook Study": [
    "Hook Pattern",
    "Hook Example",
    "Post Example",
    "Strategist Note",
    "Performance Insight",
  ],
  "Visual Pattern Study": [
    "Visual Pattern",
    "Post Example",
    "Carousel Example",
    "Strategist Note",
  ],
  "Competitor Study": [
    "Page",
    "Post Example",
    "Hook Pattern",
    "Performance Insight",
    "Audience Insight",
    "Strategist Note",
  ],
  "Client Narrative Study": [
    "Client Narrative Angle",
    "Content Pillar",
    "Hook Pattern",
    "Strategist Note",
  ],
  "New Page Strategy": [
    "Page",
    "Content Pillar",
    "Content Bucket",
    "Strategy Rule",
    "Repeatable Formula",
    "Strategist Note",
  ],
};

export function getSuggestedNodeTypes(studyType: StudyType): readonly string[] {
  return STUDY_NODE_TEMPLATES[studyType] ?? [];
}
