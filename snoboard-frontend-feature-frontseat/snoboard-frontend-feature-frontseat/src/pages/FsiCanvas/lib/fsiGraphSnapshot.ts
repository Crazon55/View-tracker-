import type { FsiConnectionRecord, FsiGraph, FsiNodeRecord } from "./fsiNodeSchemas";
import { isCanvasNode } from "./fsiHierarchy";

export type FsiGraphSnapshot = {
  study: FsiGraph["study"];
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
};

/** Serialize the live canvas graph for AI requests (matches what the user sees). */
export function buildGraphSnapshot(graph: FsiGraph | null | undefined): FsiGraphSnapshot | undefined {
  if (!graph?.study) return undefined;
  const nodes = graph.nodes.filter(isCanvasNode);
  const ids = new Set(nodes.map((n) => n.id));
  const connections = graph.connections.filter(
    (c) => ids.has(c.source_node_id) && ids.has(c.target_node_id),
  );
  return {
    study: graph.study,
    nodes,
    connections,
  };
}

export function graphSnapshotStats(snapshot: FsiGraphSnapshot | undefined): {
  nodeCount: number;
  connectionCount: number;
} {
  return {
    nodeCount: snapshot?.nodes.length ?? 0,
    connectionCount: snapshot?.connections.length ?? 0,
  };
}
