import type { FsiNodeRecord } from "./fsiNodeSchemas";

export type HierarchyLevel = "parent" | "field";

export function getHierarchyLevel(node: FsiNodeRecord): HierarchyLevel {
  if (node.structured_payload?.hierarchy_level === "field") return "field";
  return "parent";
}

export function isFieldNode(node: FsiNodeRecord): boolean {
  return getHierarchyLevel(node) === "field";
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

export function fieldPayload(key: string, label: string, value: string, inputType: string) {
  return {
    hierarchy_level: "field" as const,
    field_key: key,
    field_label: label,
    field_value: value,
    field_input_type: inputType,
  };
}

export function parentPayload(existing: Record<string, unknown> = {}) {
  return { ...existing, hierarchy_level: "parent" as const };
}
