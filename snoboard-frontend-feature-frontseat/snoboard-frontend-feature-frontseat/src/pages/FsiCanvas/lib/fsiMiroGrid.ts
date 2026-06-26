/** Miro-style nested grid: major cells subdivide into 5×5 minor cells; spacing adapts to zoom. */
export const MIRO_GRID_SUBDIVISIONS = 5;

/** Target major line spacing on screen (px) — grid steps when zoom crosses thresholds. */
const TARGET_MAJOR_SCREEN_PX = 96;

export type MiroGridLevel = {
  majorGap: number;
  minorGap: number;
  microGap: number;
  minorOpacity: number;
  microOpacity: number;
};

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const n = raw / base;
  if (n >= 5) return 5 * base;
  if (n >= 2) return 2 * base;
  return base;
}

function fadeOpacity(screenPx: number, start: number, end: number): number {
  if (screenPx <= start) return 0;
  if (screenPx >= end) return 1;
  return (screenPx - start) / (end - start);
}

export function computeMiroGridLevel(zoom: number): MiroGridLevel {
  const z = Math.max(zoom, 0.05);
  const majorGap = niceStep(TARGET_MAJOR_SCREEN_PX / z);
  const minorGap = majorGap / MIRO_GRID_SUBDIVISIONS;
  const microGap = minorGap / MIRO_GRID_SUBDIVISIONS;

  const minorScreenPx = minorGap * z;
  const microScreenPx = microGap * z;

  return {
    majorGap,
    minorGap,
    microGap,
    minorOpacity: fadeOpacity(minorScreenPx, 7, 18),
    microOpacity: fadeOpacity(microScreenPx, 6, 14) * fadeOpacity(z, 0.55, 1.05),
  };
}
