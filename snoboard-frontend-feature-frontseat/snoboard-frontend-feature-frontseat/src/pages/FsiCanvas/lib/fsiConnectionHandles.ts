import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { isNoteNode, isScreenshotNode } from "./fsiHierarchy";

export type FsiSourceHandleId = "top-out" | "right-out" | "bottom-out" | "left-out";
export type FsiTargetHandleId = "top-in" | "right-in" | "bottom-in" | "left-in";

export type FsiConnectionHandles = {
  sourceHandle: FsiSourceHandleId;
  targetHandle: FsiTargetHandleId;
};

const VALID_SOURCE = new Set<FsiSourceHandleId>(["top-out", "right-out", "bottom-out", "left-out"]);
const VALID_TARGET = new Set<FsiTargetHandleId>(["top-in", "right-in", "bottom-in", "left-in"]);

function nodeCenter(node: FsiNodeRecord): { x: number; y: number } {
  const w = isScreenshotNode(node) ? 280 : isNoteNode(node) ? 180 : 250;
  const h = isScreenshotNode(node) ? 200 : isNoteNode(node) ? 56 : 110;
  return {
    x: (node.canvas_x ?? 0) + w / 2,
    y: (node.canvas_y ?? 0) + h / 2,
  };
}

/** Pick the best source/target handle pair from relative node positions. */
export function inferConnectionHandles(
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): FsiConnectionHandles {
  const s = nodeCenter(source);
  const t = nodeCenter(target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return { sourceHandle: "right-out", targetHandle: "left-in" };
    return { sourceHandle: "left-out", targetHandle: "right-in" };
  }
  if (dy >= 0) return { sourceHandle: "bottom-out", targetHandle: "top-in" };
  return { sourceHandle: "top-out", targetHandle: "bottom-in" };
}

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): FsiConnectionHandles {
  const sourceHandle = connection.source_handle;
  const targetHandle = connection.target_handle;
  if (
    sourceHandle &&
    targetHandle &&
    VALID_SOURCE.has(sourceHandle as FsiSourceHandleId) &&
    VALID_TARGET.has(targetHandle as FsiTargetHandleId)
  ) {
    return {
      sourceHandle: sourceHandle as FsiSourceHandleId,
      targetHandle: targetHandle as FsiTargetHandleId,
    };
  }
  return inferConnectionHandles(source, target);
}
