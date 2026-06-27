import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { inferAnchorHandles, parseAnchorHandle } from "./fsiConnectionAnchors";

export type FsiSourceHandleId = `${"top" | "right" | "bottom" | "left"}-out` | string;
export type FsiTargetHandleId = `${"top" | "right" | "bottom" | "left"}-in` | string;

const LEGACY_SOURCE = new Set(["top-out", "right-out", "bottom-out", "left-out"]);
const LEGACY_TARGET = new Set(["top-in", "right-in", "bottom-in", "left-in"]);

/** Map any stored handle id to the strip handle React Flow renders (`right-out`, `left-in`, …). */
export function toFlowStripHandle(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (LEGACY_SOURCE.has(trimmed) || LEGACY_TARGET.has(trimmed)) return trimmed;
  const parsed = parseAnchorHandle(trimmed);
  if (parsed) {
    return `${parsed.side}-${parsed.kind === "out" ? "out" : "in"}`;
  }
  const strip = /^(top|right|bottom|left)-(in|out)/.exec(trimmed);
  if (strip) return `${strip[1]}-${strip[2]}`;
  return undefined;
}

export function resolveConnectionHandles(
  connection: FsiConnectionRecord,
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const inferred = inferAnchorHandles(source, target);
  return {
    sourceHandle: toFlowStripHandle(connection.source_handle) ?? inferred.sourceHandle,
    targetHandle: toFlowStripHandle(connection.target_handle) ?? inferred.targetHandle,
  };
}

export const inferConnectionHandles = inferAnchorHandles;
