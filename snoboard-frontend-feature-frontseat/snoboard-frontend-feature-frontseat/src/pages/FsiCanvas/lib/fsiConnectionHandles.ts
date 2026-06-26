import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { inferAnchorHandles, isAnchorHandle, parseAnchorHandle } from "./fsiConnectionAnchors";

export type FsiSourceHandleId = `${"top" | "right" | "bottom" | "left"}-out` | string;
export type FsiTargetHandleId = `${"top" | "right" | "bottom" | "left"}-in` | string;

const LEGACY_SOURCE = new Set(["top-out", "right-out", "bottom-out", "left-out"]);
const LEGACY_TARGET = new Set(["top-in", "right-in", "bottom-in", "left-in"]);

/** Map anchor handles (right-out-50) to nearest legacy center handle for rendering. */
export function toFlowHandleId(id: string | null | undefined, kind: "source" | "target"): string | undefined {
  if (!id) return undefined;
  if (LEGACY_SOURCE.has(id) || LEGACY_TARGET.has(id)) return id;
  const parsed = parseAnchorHandle(id);
  if (parsed) {
    return `${parsed.side}-${parsed.kind === "out" ? "out" : "in"}`;
  }
  return id;
}

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const sourceHandle = connection.source_handle;
  const targetHandle = connection.target_handle;

  if (sourceHandle && targetHandle) {
    const sh = toFlowHandleId(sourceHandle, "source") ?? sourceHandle;
    const th = toFlowHandleId(targetHandle, "target") ?? targetHandle;
    if (
      (LEGACY_SOURCE.has(sh) || isAnchorHandle(sh)) &&
      (LEGACY_TARGET.has(th) || isAnchorHandle(th))
    ) {
      return { sourceHandle: sh, targetHandle: th };
    }
  }

  const inferred = inferAnchorHandles(source, target);
  return {
    sourceHandle: toFlowHandleId(inferred.sourceHandle, "source") ?? inferred.sourceHandle,
    targetHandle: toFlowHandleId(inferred.targetHandle, "target") ?? inferred.targetHandle,
  };
}

export const inferConnectionHandles = inferAnchorHandles;
