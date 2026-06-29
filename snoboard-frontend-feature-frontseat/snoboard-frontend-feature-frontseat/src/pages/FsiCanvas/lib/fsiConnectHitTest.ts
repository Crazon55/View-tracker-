import type { Node as FlowNode, XYPosition } from "@xyflow/react";

function nodeSize(node: FlowNode): { w: number; h: number } {
  return {
    w: node.measured?.width ?? node.width ?? 200,
    h: node.measured?.height ?? node.height ?? 80,
  };
}

/** Distance from point to rectangle edge (0 if inside). */
function distanceToRectEdge(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  if (dx === 0 && dy === 0) {
    return Math.min(px - x, x + w - px, py - y, y + h - py);
  }
  return Math.hypot(dx, dy);
}

/** Nearest connectable node when releasing near its edge (Miro-style drop zone). */
export function findConnectTargetAtPointer(
  nodes: FlowNode[],
  absPos: (node: FlowNode) => XYPosition,
  pointer: XYPosition,
  excludeId: string,
  margin = 32,
): { node: FlowNode; abs: XYPosition } | null {
  let best: { node: FlowNode; abs: XYPosition; dist: number } | null = null;

  for (const node of nodes) {
    if (node.id === excludeId || node.type === "fsiFrame") continue;
    const pos = absPos(node);
    const { w, h } = nodeSize(node);
    const dist = distanceToRectEdge(pointer.x, pointer.y, pos.x, pos.y, w, h);
    if (dist > margin) continue;
    if (!best || dist < best.dist) {
      best = { node, abs: pos, dist };
    }
  }

  return best ? { node: best.node, abs: best.abs } : null;
}
