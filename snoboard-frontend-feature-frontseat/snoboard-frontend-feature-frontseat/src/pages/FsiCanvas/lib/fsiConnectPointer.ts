import { sideFromHandleId } from "./fsiConnectionAnchors";
import { toFlowStripHandle } from "./fsiConnectionHandles";

/** Use the exact strip handles the user grabbed — no pointer math, no side flipping. */
export function stripHandlesFromConnection(params: {
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
}): { sourceHandle: string; targetHandle: string } {
  const sourceFromParams = toFlowStripHandle(params.sourceHandleId);
  const targetFromParams = toFlowStripHandle(params.targetHandleId);

  const sourceMeta = sideFromHandleId(params.sourceHandleId);
  const targetMeta = sideFromHandleId(params.targetHandleId);

  const sourceHandle =
    sourceFromParams ??
    (sourceMeta ? `${sourceMeta.side}-out` : undefined) ??
    "right-out";
  const targetHandle =
    targetFromParams ??
    (targetMeta ? `${targetMeta.side}-in` : undefined) ??
    "left-in";

  return { sourceHandle, targetHandle };
}

export function clientPointFromConnectEvent(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}
