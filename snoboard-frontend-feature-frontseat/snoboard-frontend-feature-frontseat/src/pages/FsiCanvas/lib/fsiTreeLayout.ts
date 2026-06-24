import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";

export const NODE_W = 220;
export const H_GAP = 48;
export const V_GAP = 100;

type TreeEdge = { source: string; target: string };

export function buildTreeEdges(nodes: FsiNodeRecord[], connections: FsiConnectionRecord[]): TreeEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: TreeEdge[] = [];

  for (const c of connections) {
    if (!nodeIds.has(c.source_node_id) || !nodeIds.has(c.target_node_id)) continue;
    const key = `${c.source_node_id}->${c.target_node_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: c.source_node_id, target: c.target_node_id });
  }

  return edges;
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
  if (!node) return NODE_W;

  const childIds = childrenByParent.get(nodeId) ?? [];
  if (childIds.length === 0) {
    positions.set(nodeId, { x, y });
    return NODE_W;
  }

  let cursorX = x;
  let totalChildrenW = 0;
  for (const childId of childIds) {
    const w = layoutSubtree(childId, nodesById, childrenByParent, positions, cursorX, y + V_GAP);
    totalChildrenW += w + H_GAP;
    cursorX += w + H_GAP;
  }
  totalChildrenW -= H_GAP;

  const clusterW = Math.max(NODE_W, totalChildrenW);
  const parentX = x + clusterW / 2 - NODE_W / 2;
  positions.set(nodeId, { x: parentX, y });

  return clusterW;
}

/** Miro-style top-down tree from connections only. */
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

  const roots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const layoutRoots = roots.length ? roots : [nodes[0]];

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
      cursorX += NODE_W + H_GAP;
    }
  }

  return positions;
}
