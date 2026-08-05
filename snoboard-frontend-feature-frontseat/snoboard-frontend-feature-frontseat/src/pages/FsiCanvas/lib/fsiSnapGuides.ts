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

type Match = { diff: number; position: number; draggedValue: number };

function findBestMatch(draggedValues: number[], others: SnapBox[], valuesOf: (b: SnapBox) => number[], threshold: number): Match | null {
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
  return best;
}

/**
 * Miro/Figma-style "smart guides": finds the closest edge/center alignment
 * (in flow coordinates) between the dragged box and every other box on the
 * board, independently on each axis. Returns the correction to snap the
 * dragged box into place plus guide lines spanning the aligned shapes.
 */
export function computeSnapGuides(dragged: SnapBox, others: SnapBox[], threshold: number): SnapResult {
  const bestX = findBestMatch(xValues(dragged), others, xValues, threshold);
  const bestY = findBestMatch(yValues(dragged), others, yValues, threshold);

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
