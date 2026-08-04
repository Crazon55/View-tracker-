import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { estimateNodeSize } from "./fsiNodeBounds";

export type AnchorSide = "top" | "right" | "bottom" | "left";
export type AnchorKind = "in" | "out";

export const SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

const SIDE_RE = /^(top|right|bottom|left)-(in|out)-(\d{1,3})$/;

/** Mid-edge handle id — Miro-style ports live at the center of each side. */
export function sideMidHandle(side: AnchorSide, kind: AnchorKind): string {
  return formatAnchorHandle(side, kind, 50);
}

/** Handle id: `{side}-{in|out}-{pct}` where pct is 0–100 along that edge (snapped to 5). */
export function formatAnchorHandle(side: AnchorSide, kind: AnchorKind, pct: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const snapped = Math.round(clamped / 5) * 5;
  return `${side}-${kind}-${snapped}`;
}

export function parseAnchorHandle(id: string): { side: AnchorSide; kind: AnchorKind; pct: number } | null {
  const m = SIDE_RE.exec(id);
  if (!m) return null;
  return { side: m[1] as AnchorSide, kind: m[2] as AnchorKind, pct: Number(m[3]) };
}

export function isAnchorHandle(id: string | null | undefined): boolean {
  return !!id && SIDE_RE.test(id);
}

/** Map any stored handle (corner, mid, strip) onto a mid-side port. */
export function snapHandleToSideMid(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  const parsed = parseAnchorHandle(trimmed);
  if (parsed) return sideMidHandle(parsed.side, parsed.kind);
  const strip = sideFromHandleId(trimmed);
  if (strip) return sideMidHandle(strip.side, strip.kind);
  return undefined;
}

/** @deprecated use snapHandleToSideMid */
export const snapHandleToCorner = snapHandleToSideMid;

export function anchorOnSide(
  side: AnchorSide,
  kind: AnchorKind,
  _nodeX: number,
  _nodeY: number,
  _width: number,
  _height: number,
  _pointerX: number,
  _pointerY: number,
  _snapStep = 10,
): string {
  return sideMidHandle(side, kind);
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

function sideMidPoint(
  side: AnchorSide,
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: nodeX + width / 2, y: nodeY };
    case "bottom":
      return { x: nodeX + width / 2, y: nodeY + height };
    case "left":
      return { x: nodeX, y: nodeY + height / 2 };
    case "right":
      return { x: nodeX + width, y: nodeY + height / 2 };
  }
}

/** Snap pointer to the nearest mid-side port (top / right / bottom / left). */
export function pointerToAnchorHandle(
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  kind: AnchorKind,
): string {
  let best: AnchorSide = "right";
  let bestDist = Infinity;
  for (const side of SIDES) {
    const p = sideMidPoint(side, nodeX, nodeY, width, height);
    const d = (p.x - pointerX) ** 2 + (p.y - pointerY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return sideMidHandle(best, kind);
}

export function inferAnchorHandles(
  source: FsiNodeRecord,
  target: FsiNodeRecord,
): { sourceHandle: string; targetHandle: string } {
  const sw = estimateNodeSize(source);
  const tw = estimateNodeSize(target);
  const sLeft = source.canvas_x ?? 0;
  const sTop = source.canvas_y ?? 0;
  const tLeft = target.canvas_x ?? 0;
  const tTop = target.canvas_y ?? 0;
  const sx = sLeft + sw.width / 2;
  const sy = sTop + sw.height / 2;
  const tx = tLeft + tw.width / 2;
  const ty = tTop + tw.height / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  // Prefer the facing mid-sides so orthogonal wires stay clean (Miro-style trees).
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceHandle: sideMidHandle("right", "out"), targetHandle: sideMidHandle("left", "in") };
    }
    return { sourceHandle: sideMidHandle("left", "out"), targetHandle: sideMidHandle("right", "in") };
  }
  if (dy >= 0) {
    return { sourceHandle: sideMidHandle("bottom", "out"), targetHandle: sideMidHandle("top", "in") };
  }
  return { sourceHandle: sideMidHandle("top", "out"), targetHandle: sideMidHandle("bottom", "in") };
}
