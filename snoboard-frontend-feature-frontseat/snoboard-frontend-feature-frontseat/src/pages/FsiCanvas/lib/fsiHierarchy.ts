import type { FsiNodeRecord } from "./fsiNodeSchemas";

export { isLegacyFieldNode, isCanvasNode, isNoteNode, isFreeformNode } from "./fsiLegacyMigrate";
export { isScreenshotNode, getScreenshotImageUrl, screenshotNodePayload, SCREENSHOT_NODE_TYPE } from "./fsiScreenshotNode";

/** @deprecated Legacy field-node detection — used only during migration. */
export function isFieldNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.hierarchy_level === "field") return true;
  if (typeof node.structured_payload?.field_key === "string") return true;
  return !!node.parent_node_id;
}
