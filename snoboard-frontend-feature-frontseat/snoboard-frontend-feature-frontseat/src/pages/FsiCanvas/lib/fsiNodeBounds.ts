import { isNoteNode, isScreenshotNode } from "./fsiHierarchy";
import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { isCompactLabelNode, isFrameNode } from "./fsiWhiteboardTypes";

const FRAME_PADDING = 40;
const FRAME_HEADER = 40;

export function estimateNodeSize(node: FsiNodeRecord): { width: number; height: number } {
  if (isFrameNode(node)) {
    const payload = node.structured_payload ?? {};
    return {
      width: Number(payload.frame_width) || 520,
      height: Number(payload.frame_height) || 360,
    };
  }
  if (isScreenshotNode(node)) return { width: 280, height: 200 };
  if (isNoteNode(node)) return { width: 200, height: 96 };
  if (isCompactLabelNode(node)) return { width: 160, height: 56 };
  return { width: 260, height: 132 };
}

export function boundsForNodes(nodes: FsiNodeRecord[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { width, height } = estimateNodeSize(node);
    const x = node.canvas_x ?? 0;
    const y = node.canvas_y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  const contentW = maxX - minX + FRAME_PADDING * 2;
  const contentH = maxY - minY + FRAME_PADDING * 2 + FRAME_HEADER;

  return {
    x: minX - FRAME_PADDING,
    y: minY - FRAME_PADDING - FRAME_HEADER,
    width: Math.max(200, contentW),
    height: Math.max(160, contentH),
  };
}
