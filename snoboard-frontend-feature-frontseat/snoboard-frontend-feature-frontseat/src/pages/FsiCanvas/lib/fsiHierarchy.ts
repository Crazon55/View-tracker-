import type { FsiNodeRecord } from "./fsiNodeSchemas";

export type HierarchyLevel = "parent" | "field";

export function getHierarchyLevel(node: FsiNodeRecord): HierarchyLevel {
  if (node.structured_payload?.hierarchy_level === "field") return "field";
  return "parent";
}

export function isFieldNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.hierarchy_level === "field") return true;
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

/** Field nodes on the canvas keep their position; palette-only defs are not rendered in React Flow. */
export function isPlacedOnCanvas(node: FsiNodeRecord): boolean {
  if (!isFieldNode(node)) return true;
  if (node.structured_payload?.placed_on_canvas === true) return true;
  if (node.structured_payload?.placed_on_canvas === false) return false;
  // Legacy rows created before palette workflow: treat as on-canvas if not at origin sentinel.
  return !(node.canvas_x === 0 && node.canvas_y === 0);
}

export function parentPayload(existing: Record<string, unknown> = {}) {
  return { ...existing, hierarchy_level: "parent" as const };
}
