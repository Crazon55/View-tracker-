import { isNoteNode, isScreenshotNode } from "./fsiHierarchy";
import type { FsiNodeRecord } from "./fsiNodeSchemas";
import {
  isCompactLabelNode,
  isDropdownCardNode,
  isFrameNode,
  isPostDetailsNode,
  isSimpleLabelNode,
  isCarouselBodyNode,
  isNodeUiExpanded,
  nodeCardWidth,
  nodeCardHeight,
  postDetailsCardHeight,
  postDetailsCardWidth,
  COMPACT_NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  DROPDOWN_COLLAPSED_HEIGHT,
} from "./fsiWhiteboardTypes";

const FRAME_PADDING = 48;
const FRAME_HEADER = 44;

export function boundsFromExtents(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): { x: number; y: number; width: number; height: number } {
  const contentW = maxX - minX + FRAME_PADDING * 2;
  const contentH = maxY - minY + FRAME_PADDING * 2 + FRAME_HEADER;
  return {
    x: minX - FRAME_PADDING,
    y: minY - FRAME_PADDING - FRAME_HEADER,
    width: Math.max(220, contentW),
    height: Math.max(180, contentH),
  };
}

export function estimateNodeSize(node: FsiNodeRecord): { width: number; height: number } {
  if (isFrameNode(node)) {
    const payload = node.structured_payload ?? {};
    return {
      width: Number(payload.frame_width) || 520,
      height: Number(payload.frame_height) || 360,
    };
  }
  if (isScreenshotNode(node)) {
    return { width: 280, height: 360 };
  }
  if (isNoteNode(node)) return { width: 220, height: 120 };
  if (isPostDetailsNode(node)) {
    const payload = node.structured_payload ?? {};
    return {
      width: postDetailsCardWidth(payload),
      height: postDetailsCardHeight(payload),
    };
  }
  if (isDropdownCardNode(node) || isCarouselBodyNode(node)) {
    const expanded = isNodeUiExpanded(node.structured_payload ?? {});
    return {
      width: nodeCardWidth(node.structured_payload, expanded),
      height: expanded
        ? nodeCardHeight(node.structured_payload, true)
        : isDropdownCardNode(node)
          ? DROPDOWN_COLLAPSED_HEIGHT
          : COMPACT_NODE_HEIGHT,
    };
  }
  if (isCompactLabelNode(node) || isSimpleLabelNode(node)) {
    return { width: COMPACT_NODE_WIDTH, height: COMPACT_NODE_HEIGHT };
  }
  return { width: 280, height: 168 };
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

  return boundsFromExtents(minX, minY, maxX, maxY);
}
