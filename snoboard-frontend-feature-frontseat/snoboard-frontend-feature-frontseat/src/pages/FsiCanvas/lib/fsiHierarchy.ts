import type { FsiNodeRecord } from "./fsiNodeSchemas";

export { isLegacyFieldNode, isCanvasNode, isFreeformNode } from "./fsiLegacyMigrate";

/** @deprecated Legacy field-node detection — used only during migration. */
export function isFieldNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.hierarchy_level === "field") return true;
  if (typeof node.structured_payload?.field_key === "string") return true;
  return !!node.parent_node_id;
}
