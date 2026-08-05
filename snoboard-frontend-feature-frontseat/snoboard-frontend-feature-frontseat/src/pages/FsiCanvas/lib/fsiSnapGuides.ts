export type SnapBox = { left: number; top: number; width: number; height: number };

export type SnapLine = {
  orientation: "vertical" | "horizontal";
  /** Flow-space x (vertical line) or y (horizontal line) the line sits at. */
  position: number;
  start: number;
  end: number;
};

export type SnapResult = { dx: number; dy: number; lines: SnapLine[] };

/** Boxes align if an edge/center lands within this many flow units of the guide. */
const ALIGNMENT_EPSILON = 0.5;

function xValues(b: SnapBox): number[] {
  return [b.left, b.left + b.width / 2, b.left + b.width];
}

function yValues(b: SnapBox): number[] {
  return [b.top, b.top + b.height / 2, b.top + b.height];
}

function verticalOverlap(a: SnapBox, b: SnapBox): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return overlap > Math.min(a.height, b.height) * 0.25;
}

function horizontalOverlap(a: SnapBox, b: SnapBox): boolean {
  const overlap = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  return overlap > Math.min(a.width, b.width) * 0.25;
}

/** Miro-style equal-gap positions — center a row/column between two other boxes. */
function equalGapSnapTargets(dragged: SnapBox, others: SnapBox[]): { x: number[]; y: number[] } {
  const xTargets: number[] = [];
  const yTargets: number[] = [];

  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i];
      const b = others[j];

      // Horizontal row: equal gaps left and right of dragged box between A and B.
      if (verticalOverlap(a, dragged) || verticalOverlap(b, dragged) || verticalOverlap(a, b)) {
        const aRight = a.left + a.width;
        const bRight = b.left + b.width;
        const leftEdge = Math.min(a.left, b.left);
        const rightEdge = Math.max(aRight, bRight);
        const span = rightEdge - leftEdge;
        if (span > dragged.width + 4) {
          const centeredLeft = leftEdge + (span - dragged.width) / 2;
          xTargets.push(centeredLeft, centeredLeft + dragged.width / 2, centeredLeft + dragged.width);
        }
      }

      // Vertical stack: equal gaps above and below between A and B.
      if (horizontalOverlap(a, dragged) || horizontalOverlap(b, dragged) || horizontalOverlap(a, b)) {
        const aBottom = a.top + a.height;
        const bBottom = b.top + b.height;
        const topEdge = Math.min(a.top, b.top);
        const bottomEdge = Math.max(aBottom, bBottom);
        const span = bottomEdge - topEdge;
        if (span > dragged.height + 4) {
          const centeredTop = topEdge + (span - dragged.height) / 2;
          yTargets.push(centeredTop, centeredTop + dragged.height / 2, centeredTop + dragged.height);
        }
      }
    }
  }

  return { x: xTargets, y: yTargets };
}

type Match = { diff: number; position: number; draggedValue: number };

function findBestMatch(
  draggedValues: number[],
  others: SnapBox[],
  valuesOf: (b: SnapBox) => number[],
  threshold: number,
  extraTargets: number[] = [],
): Match | null {
  let best: Match | null = null;
  for (const other of others) {
    for (const ov of valuesOf(other)) {
      for (const dv of draggedValues) {
        const diff = Math.abs(dv - ov);
        if (diff <= threshold && (!best || diff < best.diff)) {
          best = { diff, position: ov, draggedValue: dv };
        }
      }
    }
  }
  for (const target of extraTargets) {
    for (const dv of draggedValues) {
      const diff = Math.abs(dv - target);
      if (diff <= threshold && (!best || diff < best.diff)) {
        best = { diff, position: target, draggedValue: dv };
      }
    }
  }
  return best;
}

/**
 * Miro/Figma-style "smart guides": edge/center alignment plus equal-gap spacing
 * between pairs of other nodes. Returns correction + guide lines in flow space.
 */
export function computeSnapGuides(dragged: SnapBox, others: SnapBox[], threshold: number): SnapResult {
  const gapTargets = equalGapSnapTargets(dragged, others);

  const bestX = findBestMatch(xValues(dragged), others, xValues, threshold, gapTargets.x);
  const bestY = findBestMatch(yValues(dragged), others, yValues, threshold, gapTargets.y);

  const dx = bestX ? bestX.position - bestX.draggedValue : 0;
  const dy = bestY ? bestY.position - bestY.draggedValue : 0;

  const snapped: SnapBox = { left: dragged.left + dx, top: dragged.top + dy, width: dragged.width, height: dragged.height };
  const lines: SnapLine[] = [];

  if (bestX) {
    const aligned = others.filter((o) => xValues(o).some((v) => Math.abs(v - bestX.position) <= ALIGNMENT_EPSILON));
    const extents = [snapped.top, snapped.top + snapped.height, ...aligned.flatMap((b) => [b.top, b.top + b.height])];
    lines.push({ orientation: "vertical", position: bestX.position, start: Math.min(...extents), end: Math.max(...extents) });
  }

  if (bestY) {
    const aligned = others.filter((o) => yValues(o).some((v) => Math.abs(v - bestY.position) <= ALIGNMENT_EPSILON));
    const extents = [snapped.left, snapped.left + snapped.width, ...aligned.flatMap((b) => [b.left, b.left + b.width])];
    lines.push({ orientation: "horizontal", position: bestY.position, start: Math.min(...extents), end: Math.max(...extents) });
  }

  return { dx, dy, lines };
}
