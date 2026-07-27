import type { FsiConnectionRecord, FsiGraph, FsiNodeRecord } from "./fsiNodeSchemas";
import { isCanvasNode } from "./fsiHierarchy";

export type FsiGraphSnapshot = {
  study: FsiGraph["study"];
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
};

/**
 * Blur any focused field so pending title/body/metric edits commit into the graph
 * before we snapshot for AI. Wait briefly for React state + setGraph to settle.
 */
export async function flushPendingCanvasEdits(): Promise<void> {
  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable)
  ) {
    active.blur();
  }
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 60);
  });
}

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
