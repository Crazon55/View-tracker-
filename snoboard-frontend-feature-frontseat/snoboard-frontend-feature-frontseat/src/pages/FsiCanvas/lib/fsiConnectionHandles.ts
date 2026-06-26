import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { inferAnchorHandles, isAnchorHandle } from "./fsiConnectionAnchors";

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const sourceHandle = connection.source_handle;
  const targetHandle = connection.target_handle;
  if (isAnchorHandle(sourceHandle) && isAnchorHandle(targetHandle)) {
    return { sourceHandle: sourceHandle!, targetHandle: targetHandle! };
  }
  return inferAnchorHandles(source, target);
}

/** @deprecated use inferAnchorHandles */
export const inferConnectionHandles = inferAnchorHandles;
