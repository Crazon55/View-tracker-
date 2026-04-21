/**
 * People seed for the Bandwidth Tracker.
 *
 * Hardcoded role (CS / CDI / CW / …) and niche (garfields / goofies) for every
 * person who produces reel-tracker work. The Bandwidth page joins this seed
 * against `created_by` / `base_edit_by` / `pintu_set_by` / `posted_by` from
 * the backend.
 *
 * EDIT THIS when the team changes — no backend redeploy needed.
 *
 * Matching is case/whitespace-insensitive on the normalized name (first
 * initial-capped words joined with single spaces). Both full name and any
 * `aliases` (common nicknames / email local parts) are matched.
 */

export type PersonRole = "cs" | "cdi" | "cw" | "design" | "ai_automations" | "ops_manager" | "editors" | "content_creators";
export type PersonNiche = "garfields" | "goofies";

export type SeedPerson = {
  name: string;
  role: PersonRole;
  niche: PersonNiche;
  aliases?: string[];
  emoji?: string;
};

// NOTE: Role/niche assignments below are starter values mirrored from
// TEAM_META in teamPerformanceCompute.ts. Correct them to match reality.
export const PEOPLE_SEED: SeedPerson[] = [
  // Garfields
  { name: "Deepak", role: "cs",  niche: "garfields", emoji: "🧠" },
  { name: "Kaavya", role: "cs",  niche: "garfields", aliases: ["Kaavya Mahajan"], emoji: "🧠" },
  { name: "Swati",  role: "cdi", niche: "garfields", emoji: "🎬" },
  // Goofies
  { name: "Arohi",  role: "cs",  niche: "goofies", emoji: "🧠" },
  { name: "Harish", role: "cs",  niche: "goofies", aliases: ["Harish R"], emoji: "🧠" },
  { name: "Pulkit", role: "cdi", niche: "goofies", emoji: "🎬" },
];

export const ROLE_LABEL: Record<PersonRole, string> = {
  cs: "CS",
  cdi: "CDI",
  cw: "CW",
  design: "Design",
  ai_automations: "AI / Automations",
  ops_manager: "Ops",
  editors: "Editors",
  content_creators: "Creators",
};

export const ROLE_COLOR: Record<PersonRole, { text: string; bg: string; border: string }> = {
  cs:              { text: "#7BB0FF", bg: "rgba(74,127,212,0.15)",  border: "rgba(74,127,212,0.40)" },
  cdi:             { text: "#F0A050", bg: "rgba(212,118,42,0.15)",  border: "rgba(212,118,42,0.40)" },
  cw:              { text: "#50E0B0", bg: "rgba(29,158,117,0.15)",  border: "rgba(29,158,117,0.40)" },
  design:          { text: "#B49EFF", bg: "rgba(123,97,196,0.15)",  border: "rgba(123,97,196,0.40)" },
  ai_automations:  { text: "#9B8FFF", bg: "rgba(83,74,183,0.15)",   border: "rgba(83,74,183,0.40)" },
  ops_manager:     { text: "#F0C060", bg: "rgba(212,149,42,0.15)",  border: "rgba(212,149,42,0.40)" },
  editors:         { text: "#FF7070", bg: "rgba(201,59,59,0.15)",   border: "rgba(201,59,59,0.40)" },
  content_creators:{ text: "#5AE0A0", bg: "rgba(45,158,95,0.15)",   border: "rgba(45,158,95,0.40)" },
};

export const NICHE_LABEL: Record<PersonNiche | "unassigned", string> = {
  garfields: "Garfields",
  goofies: "Goofies",
  unassigned: "Unassigned",
};

export const NICHE_EMOJI: Record<PersonNiche | "unassigned", string> = {
  garfields: "🐱",
  goofies: "🐶",
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
