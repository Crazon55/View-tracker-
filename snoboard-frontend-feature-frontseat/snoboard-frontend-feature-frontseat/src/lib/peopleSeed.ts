/**
 * People seed for the Bandwidth Tracker.
 *
 * Hardcoded role and niche for every person who produces reel/post tracker work.
 * The Bandwidth page joins this seed against `created_by` / `base_edit_by` /
 * `pintu_set_by` / `posted_by` from the backend.
 *
 * EDIT THIS when the team changes — no backend redeploy needed.
 *
 * Matching is case/whitespace-insensitive on the normalized name (first
 * initial-capped words joined with single spaces). Both full name and any
 * `aliases` (common nicknames / email local parts) are matched.
 */

export type PersonRole = "senior_cs" | "cs" | "cw" | "design" | "ai_dev" | "editors" | "content_creators" | "carousel_designer" | "smm";
export type PersonNiche = "garfields" | "goofies" | "sheruses";

export type SeedPerson = {
  name: string;
  role: PersonRole;
  niche: PersonNiche;
  aliases?: string[];
  emoji?: string;
  /** Optional: handles (without @) owned by this person for posting attribution. */
  pages?: string[];
};

// Role / niche assignments. Edit here when the team changes.
export const PEOPLE_SEED: SeedPerson[] = [
  // Garfields
  { name: "Om Verma",  role: "senior_cs", niche: "garfields", emoji: "⭐" },
  { name: "Deepak",    role: "cs",        niche: "garfields", emoji: "🧠" },
  { name: "Kaavya",    role: "cw",        niche: "garfields", aliases: ["Kaavya Mahajan"], emoji: "📝" },
  { name: "Swati",     role: "cs",        niche: "garfields", emoji: "🧠" },
  // Goofies
  { name: "Arohi",    role: "cs", niche: "goofies", emoji: "🧠" },
  { name: "Harish",   role: "cw", niche: "goofies", aliases: ["Harish R"], emoji: "📝" },
  { name: "Pulkit",   role: "cs", niche: "goofies", emoji: "🧠" },
  // The Sherus
  { name: "Sugam",  role: "cs", niche: "sheruses", emoji: "🦁" },
  { name: "Nitesh", role: "cs", niche: "sheruses", emoji: "🦁" },
];

export const ROLE_LABEL: Record<PersonRole, string> = {
  senior_cs:         "Senior CS",
  cs:                "CS",
  cw:                "CW",
  design:            "Designer",
  ai_dev:            "AI Dev",
  editors:           "Editor",
  content_creators:  "Creator",
  carousel_designer: "Carousel Designer",
  smm:               "SMM",
};

export const ROLE_COLOR: Record<PersonRole, { text: string; bg: string; border: string }> = {
  senior_cs:         { text: "#C084FC", bg: "rgba(192,132,252,0.15)", border: "rgba(192,132,252,0.40)" },
  cs:                { text: "#7BB0FF", bg: "rgba(74,127,212,0.15)",  border: "rgba(74,127,212,0.40)" },
  cw:                { text: "#50E0B0", bg: "rgba(29,158,117,0.15)",  border: "rgba(29,158,117,0.40)" },
  design:            { text: "#B49EFF", bg: "rgba(123,97,196,0.15)",  border: "rgba(123,97,196,0.40)" },
  ai_dev:            { text: "#9B8FFF", bg: "rgba(83,74,183,0.15)",   border: "rgba(83,74,183,0.40)" },
  editors:           { text: "#FF7070", bg: "rgba(201,59,59,0.15)",   border: "rgba(201,59,59,0.40)" },
  content_creators:  { text: "#5AE0A0", bg: "rgba(45,158,95,0.15)",   border: "rgba(45,158,95,0.40)" },
  carousel_designer: { text: "#FFA07A", bg: "rgba(255,160,122,0.15)", border: "rgba(255,160,122,0.40)" },
  smm:               { text: "#F472B6", bg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.40)" },
} as any;

export const NICHE_LABEL: Record<PersonNiche | "unassigned", string> = {
  garfields: "Garfields",
  goofies: "Goofies",
  sheruses: "The Sherus",
  unassigned: "Unassigned",
};

export const NICHE_EMOJI: Record<PersonNiche | "unassigned", string> = {
  garfields: "🐱",
  goofies: "🐶",
  sheruses: "🦁",
  unassigned: "❓",
};

function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (s.includes("@")) s = s.split("@")[0];
  s = s.replace(/[._-]+/g, " ").trim();
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const SEED_LOOKUP: Record<string, SeedPerson> = (() => {
  const map: Record<string, SeedPerson> = {};
  for (const p of PEOPLE_SEED) {
    map[normalizeName(p.name)] = p;
    for (const a of p.aliases || []) map[normalizeName(a)] = p;
  }
  return map;
})();

export function lookupPerson(rawName: string | null | undefined): SeedPerson | null {
  const n = normalizeName(rawName);
  if (!n) return null;
  if (SEED_LOOKUP[n]) return SEED_LOOKUP[n];
  // Fall back to first-word match ("Kaavya Mahajan" -> "Kaavya")
  const first = n.split(" ")[0];
  if (SEED_LOOKUP[first]) return SEED_LOOKUP[first];
  return null;
}

export { normalizeName };
