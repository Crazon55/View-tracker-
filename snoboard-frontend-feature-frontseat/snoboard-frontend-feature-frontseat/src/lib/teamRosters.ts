// ─────────────────────────────────────────────────────────────────────────────
// IP group rosters — home IP filters (FramerHome). Keep in sync with SixDayTracker.
// ─────────────────────────────────────────────────────────────────────────────
export type TeamRoster = { id: string; label: string; handles: string[] };

export const normTeamHandle = (h: unknown) =>
  String(h || "").replace(/^@/, "").trim().toLowerCase();

export const TEAM_ROSTERS: TeamRoster[] = [
  {
    id: "bizz",
    label: "Bizz playbook",
    handles: ["bizzindia", "startupbydog"],
  },
  {
    id: "founders",
    label: "Founders",
    handles: ["foundersindex", "foundersinindia", "startupcoded"],
  },
  {
    id: "x101",
    label: "101x",
    handles: ["101xfounders"],
  },
  {
    id: "news",
    label: "News playbook",
    handles: ["thechangingorder", "indiahappeningnow"],
  },
  {
    id: "tech",
    label: "Tech playbook",
    handles: ["indiantechdaily", "ai.cracked", "101xtechnology"],
  },
  {
    id: "inactive",
    label: "Inactive",
    handles: [
      "indianfoundersco",
      "indianbusinesscom",
      "entrepreneursindia.co",
      "therealfoundr",
      "elitefoundrs",
      "indiastartupstory",
      "indiabusinesscom",
      "indiafounderscore",
      "indiafounderbrief",
      "startupswtf",
    ],
  },
];
