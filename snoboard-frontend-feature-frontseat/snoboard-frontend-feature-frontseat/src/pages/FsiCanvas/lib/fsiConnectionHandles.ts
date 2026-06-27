import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import {
  inferAnchorHandles,
  parseAnchorHandle,
  sideFromHandleId,
} from "./fsiConnectionAnchors";
import { parseEmbeddedHandles } from "./fsiConnectionHandleMeta";

export type FsiSourceHandleId = string;
export type FsiTargetHandleId = string;

/** Normalize stored id to a React Flow anchor handle (`right-out-35`, not bare `right-out`). */
export function toFlowAnchorHandle(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (parseAnchorHandle(trimmed)) return trimmed;
  const sideMeta = sideFromHandleId(trimmed);
  if (sideMeta) {
    return `${sideMeta.side}-${sideMeta.kind}-${50}`;
  }
  return undefined;
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
  const fromNote = parseEmbeddedHandles(connection.edge_label_note);
  const inferred = inferAnchorHandles(source, target);
  return {
    sourceHandle:
      toFlowAnchorHandle(connection.source_handle) ??
      toFlowAnchorHandle(fromNote.sourceHandle) ??
      inferred.sourceHandle,
    targetHandle:
      toFlowAnchorHandle(connection.target_handle) ??
      toFlowAnchorHandle(fromNote.targetHandle) ??
      inferred.targetHandle,
  };
}

export const inferConnectionHandles = inferAnchorHandles;

/** @deprecated use toFlowAnchorHandle */
export const toFlowStripHandle = toFlowAnchorHandle;
