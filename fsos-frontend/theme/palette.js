/**
 * Light and dark mode without touching every className.
 *
 * The app was written light-only, with ~1,000 hard-coded colour classes (`text-stone-500`,
 * `bg-white`, `bg-amber-50`…). Rather than add a `dark:` twin to each, the colours those
 * classes resolve to are CSS variables, and `.dark` swaps the values:
 *
 * - stone (the greys) inverts end to end, so dark text becomes light text, a dark button
 *   becomes a light one, and a pale fill becomes a slightly raised dark one;
 * - `bg-white` is the card surface, dark in dark mode (`text-white` stays white — it sits
 *   on solid colour, which does not change);
 * - the colour families invert for text and borders (text-amber-800 → a light amber), and
 *   their pale backgrounds (50–300) become deep tints. Solid backgrounds (400+) keep their
 *   colour, because they carry white text and a button should stay recognisably green;
 * - `canvas`, `panel`, `panel-2` and `line` are the app's own warm neutrals, which used to
 *   be written as hex (`bg-[#FAF8F5]`, `border-[#E6E1D8]`).
 *
 * Every value is "r g b" so opacity modifiers (`bg-white/90`) keep working.
 */
const tw = require("tailwindcss/colors");
const plugin = require("tailwindcss/plugin");

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const FAMILIES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];

const rgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const channels = (c) => (Array.isArray(c) ? c : rgb(c)).join(" ");
const mix = (a, b, t) => rgb(a).map((v, i) => Math.round(v * t + rgb(b)[i] * (1 - t)));
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

// Dark surfaces, warm like the light theme rather than a cold blue-grey.
const DARK = {
  surface: "#1f1d1a",   // cards (bg-white)
  canvas: "#161412",    // page background
  panel: "#1b1917",
  panel2: "#282521",
  line: "#34302b",
};

const LIGHT_NAMED = { surface: "#ffffff", canvas: "#faf8f5", panel: "#f5f2ec", panel2: "#efebe4", line: "#e6e1d8" };

// The greys, darkest-last in light; in dark each shade takes the role of its mirror.
const STONE_DARK = {
  50: "#25221f", 100: "#2c2825", 200: "#3a3631", 300: "#544e47", 400: "#80786e",
  500: "#9e968b", 600: "#bab2a7", 700: "#d4cdc3", 800: "#e6e1d9", 900: "#f3f0eb", 950: "#faf9f7",
};

const MIRROR = { 50: "950", 100: "900", 200: "800", 300: "700", 400: "400", 500: "400", 600: "400", 700: "300", 800: "200", 900: "100", 950: "50" };
// How much of the family's dark shade shows through the surface for a pale background.
const TINT = { 50: ["950", 0.45], 100: ["900", 0.55], 200: ["800", 0.6], 300: ["700", 0.65] };
const PALE = ["50", "100", "200", "300"];

const light = {};
const dark = {};

for (const [k, hex] of Object.entries(LIGHT_NAMED)) {
  light[k] = channels(hex);
  dark[k] = channels(DARK[k]);
}
for (const s of SHADES) {
  light[`stone-${s}`] = channels(tw.stone[s]);
  dark[`stone-${s}`] = channels(STONE_DARK[s]);
}
for (const f of FAMILIES) {
  for (const s of SHADES) {
    light[`${f}-${s}`] = channels(tw[f][s]);
    dark[`${f}-${s}`] = channels(tw[f][MIRROR[s]]);
  }
  for (const s of PALE) {
    light[`bg-${f}-${s}`] = channels(tw[f][s]);
    const [shade, t] = TINT[s];
    dark[`bg-${f}-${s}`] = channels(mix(tw[f][shade], DARK.surface, t));
  }
}

const colors = {
  stone: Object.fromEntries(SHADES.map((s) => [s, v(`stone-${s}`)])),
  canvas: v("canvas"),
  panel: { DEFAULT: v("panel"), 2: v("panel2") },
  line: v("line"),
  surface: v("surface"),
  // For the few places that need white whatever the theme — text on solid colour.
  snow: "#ffffff",
};
for (const f of FAMILIES) colors[f] = Object.fromEntries(SHADES.map((s) => [s, v(`${f}-${s}`)]));

// Backgrounds: white is the surface; pale family shades are tints; solid ones keep
// their real colour so white text on them still reads.
const backgroundColor = { white: v("surface") };
for (const f of FAMILIES) {
  backgroundColor[f] = Object.fromEntries(SHADES.map((s) => [
    s, PALE.includes(s) ? v(`bg-${f}-${s}`) : tw[f][s],
  ]));
}

const toVars = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [`--${k}`, val]));

module.exports = {
  colors,
  backgroundColor,
  plugin: plugin(({ addBase }) => {
    addBase({ ":root": toVars(light), ".dark": { ...toVars(dark), colorScheme: "dark" } });
  }),
};
