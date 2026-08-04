import type { FsiNodeRecord } from "./fsiNodeSchemas";
import { estimateNodeSize } from "./fsiNodeBounds";

export type AnchorSide = "top" | "right" | "bottom" | "left";
export type AnchorKind = "in" | "out";
export type CornerId = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const SIDE_RE = /^(top|right|bottom|left)-(in|out)-(\d{1,3})$/;

/** Canonical corner handles use top/bottom at 0 or 100. */
export const CORNER_IDS: CornerId[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

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

export function cornerHandle(corner: CornerId, kind: AnchorKind): string {
  switch (corner) {
    case "top-left":
      return formatAnchorHandle("top", kind, 0);
    case "top-right":
      return formatAnchorHandle("top", kind, 100);
    case "bottom-left":
      return formatAnchorHandle("bottom", kind, 0);
    case "bottom-right":
      return formatAnchorHandle("bottom", kind, 100);
  }
}

/** Map any side/pct (or strip) handle onto one of the four box corners. */
export function snapHandleToCorner(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  const parsed = parseAnchorHandle(trimmed);
  if (parsed) {
    return cornerHandle(sidePctToCorner(parsed.side, parsed.pct), parsed.kind);
  }
  const strip = sideFromHandleId(trimmed);
  if (strip) {
    // Mid-side strips → prefer the "top" or "left" corner of that side.
    return cornerHandle(sidePctToCorner(strip.side, 0), strip.kind);
  }
  return undefined;
}

function sidePctToCorner(side: AnchorSide, pct: number): CornerId {
  const towardEnd = pct >= 50;
  switch (side) {
    case "top":
      return towardEnd ? "top-right" : "top-left";
    case "bottom":
      return towardEnd ? "bottom-right" : "bottom-left";
    case "left":
      return towardEnd ? "bottom-left" : "top-left";
    case "right":
      return towardEnd ? "bottom-right" : "top-right";
  }
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
  _snapStep = 10,
): string {
  // Only corners — project the pointer onto this side, then snap to nearer end.
  let pct = 50;
  if (side === "top" || side === "bottom") {
    pct = width > 0 ? ((pointerX - nodeX) / width) * 100 : 50;
  } else {
    pct = height > 0 ? ((pointerY - nodeY) / height) * 100 : 50;
  }
  return cornerHandle(sidePctToCorner(side, pct), kind);
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

function cornerPoint(
  corner: CornerId,
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  switch (corner) {
    case "top-left":
      return { x: nodeX, y: nodeY };
    case "top-right":
      return { x: nodeX + width, y: nodeY };
    case "bottom-left":
      return { x: nodeX, y: nodeY + height };
    case "bottom-right":
      return { x: nodeX + width, y: nodeY + height };
  }
}

/** Snap pointer (flow coords) to the nearest of the four box corners. */
export function pointerToAnchorHandle(
  nodeX: number,
  nodeY: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  kind: AnchorKind,
): string {
  let best: CornerId = "top-left";
  let bestDist = Infinity;
  for (const corner of CORNER_IDS) {
    const p = cornerPoint(corner, nodeX, nodeY, width, height);
    const d = (p.x - pointerX) ** 2 + (p.y - pointerY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = corner;
    }
  }
  return cornerHandle(best, kind);
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

  // Pick the source corner closest to the target center, and vice versa.
  const nearestCorner = (
    left: number,
    top: number,
    width: number,
    height: number,
    towardX: number,
    towardY: number,
  ): CornerId => {
    let best: CornerId = "top-left";
    let bestDist = Infinity;
    for (const corner of CORNER_IDS) {
      const p = cornerPoint(corner, left, top, width, height);
      const d = (p.x - towardX) ** 2 + (p.y - towardY) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = corner;
      }
    }
    return best;
  };

  return {
    sourceHandle: cornerHandle(nearestCorner(sLeft, sTop, sw.width, sw.height, tx, ty), "out"),
    targetHandle: cornerHandle(nearestCorner(tLeft, tTop, tw.width, tw.height, sx, sy), "in"),
  };
}
