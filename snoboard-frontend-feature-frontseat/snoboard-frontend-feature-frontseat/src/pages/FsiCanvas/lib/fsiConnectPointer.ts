import type { XYPosition } from "@xyflow/react";
import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { estimateNodeSize } from "./fsiNodeBounds";
import { isScreenshotNode } from "./fsiHierarchy";
import {
  anchorOnSide,
  formatAnchorHandle,
  inferAnchorHandles,
  parseAnchorHandle,
  pointerToAnchorHandle,
  sideFromHandleId,
} from "./fsiConnectionAnchors";
import { normalizeToAnchorHandle } from "./fsiConnectionHandles";

function snapStep(fine: boolean): number {
  return fine ? 5 : 10;
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
  const step = snapStep(fine);
  const snapped = Math.max(0, Math.min(100, Math.round(parsed.pct / step) * step));
  return formatAnchorHandle(parsed.side, parsed.kind, snapped);
}

export function clientPointFromConnectEvent(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

/**
 * Miro-style: lock source/target SIDE to the handle strip the user grabbed/released on.
 * Only move along that edge — never auto-flip to a different side or nearest node.
 */
export function refineConnectionHandlesFromPointers(opts: {
  sourceDb: FsiNodeRecord;
  targetDb: FsiNodeRecord;
  sourceAbs: XYPosition;
  targetAbs: XYPosition;
  startPointer: XYPosition | null;
  endPointer: XYPosition | null;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
}): { sourceHandle: string; targetHandle: string } {
  const sw = estimateNodeSize(opts.sourceDb);
  const tw = estimateNodeSize(opts.targetDb);
  const sourceFine = isScreenshotNode(opts.sourceDb);
  const targetFine = isScreenshotNode(opts.targetDb);
  const sourceStep = snapStep(sourceFine);
  const targetStep = snapStep(targetFine);

  const sourceMeta = sideFromHandleId(opts.sourceHandleId);
  const targetMeta = sideFromHandleId(opts.targetHandleId);

  let sourceHandle: string;
  if (sourceMeta) {
    sourceHandle = opts.startPointer
      ? anchorOnSide(
          sourceMeta.side,
          "out",
          opts.sourceAbs.x,
          opts.sourceAbs.y,
          sw.width,
          sw.height,
          opts.startPointer.x,
          opts.startPointer.y,
          sourceStep,
        )
      : formatAnchorHandle(sourceMeta.side, "out", 50);
  } else if (opts.startPointer) {
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
  } else {
    sourceHandle =
      normalizeToAnchorHandle(opts.sourceHandleId) ??
      inferAnchorHandles(opts.sourceDb, opts.targetDb).sourceHandle;
  }

  let targetHandle: string;
  if (targetMeta) {
    targetHandle = opts.endPointer
      ? anchorOnSide(
          targetMeta.side,
          "in",
          opts.targetAbs.x,
          opts.targetAbs.y,
          tw.width,
          tw.height,
          opts.endPointer.x,
          opts.endPointer.y,
          targetStep,
        )
      : formatAnchorHandle(targetMeta.side, "in", 50);
  } else if (opts.endPointer) {
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
  } else {
    targetHandle =
      normalizeToAnchorHandle(opts.targetHandleId) ??
      inferAnchorHandles(opts.sourceDb, opts.targetDb).targetHandle;
  }

  return { sourceHandle, targetHandle };
}
