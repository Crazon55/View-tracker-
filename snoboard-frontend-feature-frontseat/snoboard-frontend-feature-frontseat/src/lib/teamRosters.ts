// ─────────────────────────────────────────────────────────────────────────────
// Team rosters — the single source of truth for which IP page handles belong to
// which FBS team. Used by the home "ALL THE IPs" team filter. Mirrors the curated
// rosters in SixDayTracker (the app trusts these over the raw DB niche assignment,
// so roster changes apply immediately). Edit the `handles` arrays to reassign pages.
// ─────────────────────────────────────────────────────────────────────────────
export type TeamRoster = { id: string; label: string; handles: string[] };

export const normTeamHandle = (h: unknown) =>
  String(h || "").replace(/^@/, "").trim().toLowerCase();

export const TEAM_ROSTERS: TeamRoster[] = [
  {
    id: "garfields",
    label: "FBS - Garfields",
    handles: [
      "indianfoundersco",
      "bizzindia",
      "startupbydog",
      "indianbusinesscom",
      "entrepreneursindia.co",
      "therealfoundr",
      "elitefoundrs",
      "foundersindex",
    ],
  },
  {
    id: "goofies",
    label: "FBS - Goofies",
    handles: ["101xfounders", "foundersinindia", "startupcoded"],
  },
  {
    id: "sherus",
    label: "FBS - Sherus",
    handles: ["thechangingorder", "startupswtf"],
  },
  {
    id: "experimentx",
    label: "FBS - Experiment X",
    handles: [
      "indiastartupstory",
      "indiabusinesscom",
      "indiafounderscore",
      "indiafounderbrief",
    ],
  },
  {
    id: "tech",
    label: "FBS - Tech Playbook",
    handles: ["indiantechdaily", "ai.cracked", "101xtechnology"],
  },
];
