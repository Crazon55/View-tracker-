import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import {
  inferAnchorHandles,
  snapHandleToSideMid,
} from "./fsiConnectionAnchors";
import { parseEmbeddedHandles } from "./fsiConnectionHandleMeta";

export type FsiSourceHandleId = string;
export type FsiTargetHandleId = string;

/** Normalize stored id to a mid-side React Flow handle (`right-out-50`). */
export function toFlowAnchorHandle(id: string | null | undefined): string | undefined {
  return snapHandleToSideMid(id);
}

/** Collect every anchor handle id a node must render for its edges. */
export function anchorIdsForNode(
  nodeId: string,
  connections: FsiConnectionRecord[],
): string[] {
  const ids = new Set<string>();
  for (const c of connections) {
    if (c.source_node_id === nodeId) {
      const h = toFlowAnchorHandle(c.source_handle) ?? parseEmbeddedHandles(c.edge_label_note).sourceHandle;
      if (h) ids.add(toFlowAnchorHandle(h) ?? h);
    }
    if (c.target_node_id === nodeId) {
      const h = toFlowAnchorHandle(c.target_handle) ?? parseEmbeddedHandles(c.edge_label_note).targetHandle;
      if (h) ids.add(toFlowAnchorHandle(h) ?? h);
    }
  }
  return Array.from(ids);
}

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  // Prefer the handles the user actually connected. Only infer when missing.
  const embedded = parseEmbeddedHandles(connection.edge_label_note);
  const sourceHandle =
    toFlowAnchorHandle(connection.source_handle) ??
    toFlowAnchorHandle(embedded.sourceHandle);
  const targetHandle =
    toFlowAnchorHandle(connection.target_handle) ??
    toFlowAnchorHandle(embedded.targetHandle);
  if (sourceHandle && targetHandle) {
    return { sourceHandle, targetHandle };
  }
  const inferred = inferAnchorHandles(source, target);
  return {
    sourceHandle: sourceHandle ?? inferred.sourceHandle,
    targetHandle: targetHandle ?? inferred.targetHandle,
  };
}

export const inferConnectionHandles = inferAnchorHandles;

/** @deprecated use toFlowAnchorHandle */
export const toFlowStripHandle = toFlowAnchorHandle;
