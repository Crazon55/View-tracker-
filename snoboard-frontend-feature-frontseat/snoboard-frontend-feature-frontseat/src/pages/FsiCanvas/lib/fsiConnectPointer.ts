import type { XYPosition } from "@xyflow/react";
import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { estimateNodeSize } from "./fsiNodeBounds";
import { isScreenshotNode } from "./fsiHierarchy";
import {
  formatAnchorHandle,
  parseAnchorHandle,
  pointerToAnchorHandle,
} from "./fsiConnectionAnchors";
import { normalizeToAnchorHandle } from "./fsiConnectionHandles";

function snapPct(pct: number, fine: boolean): number {
  const step = fine ? 5 : 10;
  return Math.max(0, Math.min(100, Math.round(pct / step) * step));
}

function pointerToSnappedAnchor(
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  kind: "in" | "out",
  fine: boolean,
): string {
  const raw = pointerToAnchorHandle(nodeX, nodeY, width, height, pointerX, pointerY, kind);
  const parsed = parseAnchorHandle(raw);
  if (!parsed) return raw;
  return formatAnchorHandle(parsed.side, parsed.kind, snapPct(parsed.pct, fine));
}

export function clientPointFromConnectEvent(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

export function refineConnectionHandlesFromPointers(opts: {
  sourceDb: FsiNodeRecord;
  targetDb: FsiNodeRecord;
  sourceAbs: XYPosition;
  targetAbs: XYPosition;
  startPointer: XYPosition | null;
  endPointer: XYPosition | null;
  fallbackSource?: string | null;
  fallbackTarget?: string | null;
}): { sourceHandle: string; targetHandle: string } {
  const sw = estimateNodeSize(opts.sourceDb);
  const tw = estimateNodeSize(opts.targetDb);
  const sourceFine = isScreenshotNode(opts.sourceDb);
  const targetFine = isScreenshotNode(opts.targetDb);

  let sourceHandle =
    normalizeToAnchorHandle(opts.fallbackSource) ?? formatAnchorHandle("right", "out", 50);
  let targetHandle =
    normalizeToAnchorHandle(opts.fallbackTarget) ?? formatAnchorHandle("left", "in", 50);

  if (opts.startPointer) {
    sourceHandle = pointerToSnappedAnchor(
      opts.sourceAbs.x,
      opts.sourceAbs.y,
      sw.width,
      sw.height,
      opts.startPointer.x,
      opts.startPointer.y,
      "out",
      sourceFine,
    );
  }
  if (opts.endPointer) {
    targetHandle = pointerToSnappedAnchor(
      opts.targetAbs.x,
      opts.targetAbs.y,
      tw.width,
      tw.height,
      opts.endPointer.x,
      opts.endPointer.y,
      "in",
      targetFine,
    );
  }

  return { sourceHandle, targetHandle };
}
