import type { Node as FlowNode, XYPosition } from "@xyflow/react";
import {
  anchorOnSide,
  parseAnchorHandle,
  pointerToAnchorHandle,
  sideFromHandleId,
  type AnchorKind,
  type AnchorSide,
} from "./fsiConnectionAnchors";
import { toFlowAnchorHandle } from "./fsiConnectionHandles";

export function clientPointFromConnectEvent(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

function nodeBox(node: FlowNode, absPos: XYPosition): { x: number; y: number; w: number; h: number } {
  const w = node.measured?.width ?? node.width ?? 200;
  const h = node.measured?.height ?? node.height ?? 80;
  return { x: absPos.x, y: absPos.y, w, h };
}

/** Resolve side + pointer position to a snapped perimeter anchor id. */
export function pointerToSideAnchor(
  side: AnchorSide,
  kind: AnchorKind,
  node: FlowNode,
  absPos: XYPosition,
  pointer: XYPosition,
): string {
  const box = nodeBox(node, absPos);
  return anchorOnSide(side, kind, box.x, box.y, box.w, box.h, pointer.x, pointer.y, 5);
}

export function anchorHandlesFromConnection(params: {
  sourceNode: FlowNode;
  targetNode: FlowNode;
  sourceAbs: XYPosition;
  targetAbs: XYPosition;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  sourcePointer?: XYPosition | null;
  targetPointer?: XYPosition | null;
}): { sourceHandle: string; targetHandle: string } {
  const sourceSideMeta = sideFromHandleId(params.sourceHandleId);
  const targetSideMeta = sideFromHandleId(params.targetHandleId);
  const srcParsed = parseAnchorHandle(params.sourceHandleId ?? "");

  let sourceHandle =
    toFlowAnchorHandle(params.sourceHandleId) ??
    (srcParsed ? params.sourceHandleId! : "right-out-50");

  if (!srcParsed && sourceSideMeta && params.sourcePointer) {
    sourceHandle = pointerToSideAnchor(
      sourceSideMeta.side,
      "out",
      params.sourceNode,
      params.sourceAbs,
      params.sourcePointer,
    );
  }

  // Drop pointer decides the target side — never let RF default to a facing-side guess.
  let targetHandle = toFlowAnchorHandle(params.targetHandleId) ?? "left-in-50";
  if (params.targetPointer) {
    if (targetSideMeta) {
      targetHandle = pointerToSideAnchor(
        targetSideMeta.side,
        "in",
        params.targetNode,
        params.targetAbs,
        params.targetPointer,
      );
    } else {
      const box = nodeBox(params.targetNode, params.targetAbs);
      targetHandle = pointerToAnchorHandle(
        box.x,
        box.y,
        box.w,
        box.h,
        params.targetPointer.x,
        params.targetPointer.y,
        "in",
      );
    }
  }

  return { sourceHandle, targetHandle };
}
