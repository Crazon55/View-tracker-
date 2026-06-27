import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { formatAnchorHandle, inferAnchorHandles, isAnchorHandle, parseAnchorHandle } from "./fsiConnectionAnchors";

export type FsiSourceHandleId = `${"top" | "right" | "bottom" | "left"}-out` | string;
export type FsiTargetHandleId = `${"top" | "right" | "bottom" | "left"}-in` | string;

const LEGACY_SOURCE = new Set(["top-out", "right-out", "bottom-out", "left-out"]);
const LEGACY_TARGET = new Set(["top-in", "right-in", "bottom-in", "left-in"]);

/** Legacy center handles → midpoint anchor so edges stay on the chosen side. */
export function normalizeToAnchorHandle(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  if (isAnchorHandle(id)) return id;
  if (LEGACY_SOURCE.has(id)) {
    const side = id.replace("-out", "") as "top" | "right" | "bottom" | "left";
    return formatAnchorHandle(side, "out", 50);
  }
  if (LEGACY_TARGET.has(id)) {
    const side = id.replace("-in", "") as "top" | "right" | "bottom" | "left";
    return formatAnchorHandle(side, "in", 50);
  }
  return id;
}

/** Pass anchor ids through unchanged — do not collapse to side center. */
export function toFlowHandleId(id: string | null | undefined): string | undefined {
  return normalizeToAnchorHandle(id);
}

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const sourceHandle = connection.source_handle;
  const targetHandle = connection.target_handle;

  if (sourceHandle || targetHandle) {
    const inferred = inferAnchorHandles(source, target);
    return {
      sourceHandle: normalizeToAnchorHandle(sourceHandle) ?? inferred.sourceHandle,
      targetHandle: normalizeToAnchorHandle(targetHandle) ?? inferred.targetHandle,
    };
  }

  const inferred = inferAnchorHandles(source, target);
  return {
    sourceHandle: normalizeToAnchorHandle(inferred.sourceHandle) ?? inferred.sourceHandle,
    targetHandle: normalizeToAnchorHandle(inferred.targetHandle) ?? inferred.targetHandle,
  };
}

export function anchorIdsForNode(
  nodeId: string,
  connections: FsiConnectionRecord[],
  nodesById: Map<string, FsiNodeRecord>,
): string[] {
  const ids = new Set<string>();
  for (const c of connections) {
    const source = nodesById.get(c.source_node_id);
    const target = nodesById.get(c.target_node_id);
    if (!source || !target) continue;
    const { sourceHandle, targetHandle } = resolveConnectionHandles(c, source, target);
    if (c.source_node_id === nodeId) ids.add(sourceHandle);
    if (c.target_node_id === nodeId) ids.add(targetHandle);
  }
  return [...ids];
}

export function isLegacyOrAnchorHandle(id: string): boolean {
  return LEGACY_SOURCE.has(id) || LEGACY_TARGET.has(id) || isAnchorHandle(id);
}

export const inferConnectionHandles = inferAnchorHandles;
