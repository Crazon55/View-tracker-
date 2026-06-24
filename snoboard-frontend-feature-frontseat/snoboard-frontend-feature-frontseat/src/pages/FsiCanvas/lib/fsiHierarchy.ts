import type { FsiNodeRecord } from "./fsiNodeSchemas";

export type HierarchyLevel = "parent" | "field";

export function getHierarchyLevel(node: FsiNodeRecord): HierarchyLevel {
  if (node.structured_payload?.hierarchy_level === "field") return "field";
  return "parent";
}

export function isFieldNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.hierarchy_level === "field") return true;
  if (typeof node.structured_payload?.field_key === "string") return true;
  return !!node.parent_node_id;
}

export function isParentNode(node: FsiNodeRecord): boolean {
  return !isFieldNode(node);
}

export function getFieldKey(node: FsiNodeRecord): string | null {
  const key = node.structured_payload?.field_key;
  return typeof key === "string" ? key : null;
}

export function getFieldValue(node: FsiNodeRecord): string {
  const v = node.structured_payload?.field_value;
  if (v === undefined || v === null) return "";
  return String(v);
}

export function fieldPayload(
  key: string,
  label: string,
  value: string,
  inputType: string,
  placedOnCanvas = false,
) {
  return {
    hierarchy_level: "field" as const,
    field_key: key,
    field_label: label,
    field_value: value,
    field_input_type: inputType,
    placed_on_canvas: placedOnCanvas,
  };
}

/** Only field nodes explicitly placed on the canvas (avoids legacy auto-spawn clutter). */
export function isPlacedOnCanvas(node: FsiNodeRecord): boolean {
  if (!isFieldNode(node)) return true;
  return node.structured_payload?.placed_on_canvas === true;
}

export function parentPayload(existing: Record<string, unknown> = {}) {
  return { ...existing, hierarchy_level: "parent" as const };
}
