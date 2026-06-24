export type SavedViewport = {
  x: number;
  y: number;
  zoom: number;
};

const storageKey = (studyId: string) => `fsi-canvas-viewport:${studyId}`;

export function loadSavedViewport(studyId: string): SavedViewport | null {
  try {
    const raw = localStorage.getItem(storageKey(studyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedViewport;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.zoom === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y) &&
      Number.isFinite(parsed.zoom) &&
      parsed.zoom > 0
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function saveViewport(studyId: string, viewport: SavedViewport): void {
  try {
    localStorage.setItem(storageKey(studyId), JSON.stringify(viewport));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSavedViewport(studyId: string): void {
  try {
    localStorage.removeItem(storageKey(studyId));
  } catch {
    /* ignore */
  }
}
