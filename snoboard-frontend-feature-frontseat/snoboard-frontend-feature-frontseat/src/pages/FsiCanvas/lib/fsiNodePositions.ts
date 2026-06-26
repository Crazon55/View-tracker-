import type { FsiNodeRecord } from "./fsiNodeSchemas";

/** Convert stored absolute canvas coords to React Flow position (relative when parented). */
export function toFlowPosition(
  node: FsiNodeRecord,
  nodesById: Map<string, FsiNodeRecord>,
): { x: number; y: number } {
  let x = node.canvas_x ?? 0;
  let y = node.canvas_y ?? 0;
  if (node.parent_node_id) {
    const parent = nodesById.get(node.parent_node_id);
    if (parent) {
      x -= parent.canvas_x ?? 0;
      y -= parent.canvas_y ?? 0;
    }
  }
  return { x, y };
}

export function collectDescendantIds(parentId: string, nodes: FsiNodeRecord[]): string[] {
  const ids: string[] = [];
  const queue = nodes.filter((n) => n.parent_node_id === parentId).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    ids.push(id);
    queue.push(...nodes.filter((n) => n.parent_node_id === id).map((n) => n.id));
  }
  return ids;
}
