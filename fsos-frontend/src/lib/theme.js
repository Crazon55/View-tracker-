import { useTheme } from "next-themes";

// Light unless the person has switched, and then whatever they last picked — the
// choice is kept in this browser (localStorage) and applied before the first paint.
export const THEME_STORAGE_KEY = "fsos_theme";

/** Colours for places that can't take a class name — chart axes, gridlines, inline
 *  styles. Kept to the same greys the classes use in each theme. */
const CHART = {
  light: { axis: "#78716C", axisStrong: "#44403C", grid: "#E7E5E4", gridStrong: "#D6D3D1", ink: "#1C1917", muted: "#8C857B", neutral: "#d6d3d1", tooltipBg: "#ffffff", onInk: "#ffffff" },
  dark:  { axis: "#9e968b", axisStrong: "#d4cdc3", grid: "#34302b", gridStrong: "#544e47", ink: "#f3f0eb", muted: "#80786e", neutral: "#544e47", tooltipBg: "#1f1d1a", onInk: "#1c1917" },
};

export function useThemeColors() {
  const { resolvedTheme } = useTheme();
  return CHART[resolvedTheme === "dark" ? "dark" : "light"];
}
