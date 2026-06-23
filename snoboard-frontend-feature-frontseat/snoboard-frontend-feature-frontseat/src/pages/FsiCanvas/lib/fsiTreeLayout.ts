import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { isFieldNode, isParentNode } from "./fsiHierarchy";

export const PARENT_NODE_W = 220;
export const FIELD_NODE_W = 200;
export const H_GAP = 20;
export const V_GAP = 72;

type TreeEdge = { source: string; target: string };

function buildTreeEdges(nodes: FsiNodeRecord[], connections: FsiConnectionRecord[]): TreeEdge[] {
  const edges: TreeEdge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    if (n.parent_node_id && nodeIds.has(n.parent_node_id)) {
      edges.push({ source: n.parent_node_id, target: n.id });
    }
  }

  for (const c of connections) {
    if (nodeIds.has(c.source_node_id) && nodeIds.has(c.target_node_id)) {
      edges.push({ source: c.source_node_id, target: c.target_node_id });
    }
  }

  return edges;
}

function nodeWidth(node: FsiNodeRecord): number {
  return isFieldNode(node) ? FIELD_NODE_W : PARENT_NODE_W;
}

function layoutSubtree(
  nodeId: string,
  nodesById: Map<string, FsiNodeRecord>,
  childrenByParent: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  x: number,
  y: number,
): number {
  const node = nodesById.get(nodeId);
  if (!node) return PARENT_NODE_W;

  const childIds = childrenByParent.get(nodeId) ?? [];
  if (childIds.length === 0) {
    positions.set(nodeId, { x, y });
    return nodeWidth(node);
  }

  let cursorX = x;
  let totalChildrenW = 0;
  for (const childId of childIds) {
    const w = layoutSubtree(childId, nodesById, childrenByParent, positions, cursorX, y + V_GAP);
    totalChildrenW += w + H_GAP;
    cursorX += w + H_GAP;
  }
  totalChildrenW -= H_GAP;

  const parentW = nodeWidth(node);
  const clusterW = Math.max(parentW, totalChildrenW);
  const parentX = x + clusterW / 2 - parentW / 2;
  positions.set(nodeId, { x: parentX, y });

  return clusterW;
}

/** Top-down Miro-style tree layout from parent_node_id + connections. */
export function layoutFsiTree(
  nodes: FsiNodeRecord[],
  connections: FsiConnectionRecord[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return positions;

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const edges = buildTreeEdges(nodes, connections);
  const incoming = new Map<string, number>();
  for (const id of nodesById.keys()) incoming.set(id, 0);
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const e of edges) {
    const list = childrenByParent.get(e.source) ?? [];
    list.push(e.target);
    childrenByParent.set(e.source, list);
  }

  for (const [, childIds] of childrenByParent) {
    childIds.sort((a, b) => {
      const fa = isFieldNode(nodesById.get(a)!);
      const fb = isFieldNode(nodesById.get(b)!);
      if (fa && fb) {
        return (nodesById.get(a)?.display_title ?? "").localeCompare(nodesById.get(b)?.display_title ?? "");
      }
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });
  }

  const roots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0 && isParentNode(n));
  const layoutRoots = roots.length ? roots : nodes.filter(isParentNode);

  let cursorX = 40;
  const baseY = 40;
  for (const root of layoutRoots) {
    const anchorX = root.canvas_x > 0 ? root.canvas_x : cursorX;
    const anchorY = root.canvas_y > 0 ? root.canvas_y : baseY;
    const w = layoutSubtree(root.id, nodesById, childrenByParent, positions, anchorX, anchorY);
    cursorX = Math.max(cursorX, anchorX + w + 80);
  }

  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: n.canvas_x || cursorX, y: n.canvas_y || baseY });
    }
  }

  return positions;
}
