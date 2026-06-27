import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { estimateNodeSize } from "./fsiNodeBounds";

export type AnchorSide = "top" | "right" | "bottom" | "left";
export type AnchorKind = "in" | "out";

const SIDE_RE = /^(top|right|bottom|left)-(in|out)-(\d{1,3})$/;

/** Handle id: `{side}-{in|out}-{pct}` where pct is 0–100 along that edge. */
export function formatAnchorHandle(side: AnchorSide, kind: AnchorKind, pct: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return `${side}-${kind}-${clamped}`;
}

export function parseAnchorHandle(id: string): { side: AnchorSide; kind: AnchorKind; pct: number } | null {
  const m = SIDE_RE.exec(id);
  if (!m) return null;
  return { side: m[1] as AnchorSide, kind: m[2] as AnchorKind, pct: Number(m[3]) };
}

export function isAnchorHandle(id: string | null | undefined): boolean {
  return !!id && SIDE_RE.test(id);
}

export function anchorOnSide(
  side: AnchorSide,
  kind: AnchorKind,
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  snapStep = 10,
): string {
  let pct = 50;
  if (side === "top" || side === "bottom") {
    pct = width > 0 ? ((pointerX - nodeX) / width) * 100 : 50;
  } else {
    pct = height > 0 ? ((pointerY - nodeY) / height) * 100 : 50;
  }
  const step = snapStep;
  const snapped = Math.max(0, Math.min(100, Math.round(pct / step) * step));
  return formatAnchorHandle(side, kind, snapped);
}

/** Parse strip (`right-out`) or anchor (`right-out-50`) handle ids. */
export function sideFromHandleId(
  id: string | null | undefined,
): { side: AnchorSide; kind: AnchorKind } | null {
  if (!id) return null;
  const parsed = parseAnchorHandle(id);
  if (parsed) return { side: parsed.side, kind: parsed.kind };
  const m = /^(top|right|bottom|left)-(in|out)$/.exec(id);
  if (m) return { side: m[1] as AnchorSide, kind: m[2] as AnchorKind };
  return null;
}

/** Snap pointer (flow coords) to nearest point on the node rectangle perimeter. */
export function pointerToAnchorHandle(
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  kind: AnchorKind,
): string {
  const left = nodeX;
  const right = nodeX + width;
  const top = nodeY;
  const bottom = nodeY + height;
  const cx = left + width / 2;
  const cy = top + height / 2;

  const dx = pointerX - cx;
  const dy = pointerY - cy;

  if (Math.abs(dx) / width >= Math.abs(dy) / height) {
    const pct = width > 0 ? ((pointerX - left) / width) * 100 : 50;
    return formatAnchorHandle(dx >= 0 ? "right" : "left", kind, pct);
  }
  const pct = height > 0 ? ((pointerY - top) / height) * 100 : 50;
  return formatAnchorHandle(dy >= 0 ? "bottom" : "top", kind, pct);
}

export function inferAnchorHandles(
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const sw = estimateNodeSize(source);
  const tw = estimateNodeSize(target);
  const sx = (source.canvas_x ?? 0) + sw.width / 2;
  const sy = (source.canvas_y ?? 0) + sw.height / 2;
  const tx = (target.canvas_x ?? 0) + tw.width / 2;
  const ty = (target.canvas_y ?? 0) + tw.height / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceHandle: "right-out", targetHandle: "left-in" };
    }
    return { sourceHandle: "left-out", targetHandle: "right-in" };
  }
  if (dy >= 0) {
    return { sourceHandle: "bottom-out", targetHandle: "top-in" };
  }
  return { sourceHandle: "top-out", targetHandle: "bottom-in" };
}
