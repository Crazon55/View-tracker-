export type FsiCanvasTheme = "dark" | "light";

export type FsiCanvasThemePalette = {
  canvasBgClass: string;
  gridMajor: string;
  gridMinor: string;
  gridMicro: string;
  controlsClass: string;
  minimapClass: string;
  minimapMask: string;
  hintClass: string;
};

const STORAGE_KEY = "fsi-canvas-theme";

export const FSI_CANVAS_THEME_PALETTES: Record<FsiCanvasTheme, FsiCanvasThemePalette> = {
  dark: {
    canvasBgClass: "bg-zinc-950",
    gridMajor: "rgba(255, 255, 255, 0.09)",
    gridMinor: "rgba(255, 255, 255, 0.05)",
    gridMicro: "rgba(255, 255, 255, 0.03)",
    controlsClass:
      "!z-20 !bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-white",
    minimapClass: "!z-20 !rounded-md !border !border-zinc-600 !bg-zinc-900/95 !shadow-lg",
    minimapMask: "rgba(0,0,0,0.55)",
    hintClass: "border-zinc-700 bg-zinc-950/90 text-zinc-400",
  },
  light: {
    canvasBgClass: "bg-[#f3f4f6]",
    gridMajor: "rgba(0, 0, 0, 0.11)",
    gridMinor: "rgba(0, 0, 0, 0.055)",
    gridMicro: "rgba(0, 0, 0, 0.03)",
    controlsClass:
      "!z-20 !bg-white !border-zinc-300 [&>button]:!bg-zinc-50 [&>button]:!border-zinc-300 [&>button]:!text-zinc-700",
    minimapClass: "!z-20 !rounded-md !border !border-zinc-300 !bg-white/95 !shadow-lg",
    minimapMask: "rgba(243, 244, 246, 0.65)",
    hintClass: "border-zinc-300 bg-white/90 text-zinc-600",
  },
};

export function loadCanvasTheme(): FsiCanvasTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function saveCanvasTheme(theme: FsiCanvasTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function toggleCanvasTheme(theme: FsiCanvasTheme): FsiCanvasTheme {
  return theme === "dark" ? "light" : "dark";
}

export function paletteForCanvasTheme(theme: FsiCanvasTheme): FsiCanvasThemePalette {
  return FSI_CANVAS_THEME_PALETTES[theme];
}
