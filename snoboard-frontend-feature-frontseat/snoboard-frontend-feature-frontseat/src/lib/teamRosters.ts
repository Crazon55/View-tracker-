// ─────────────────────────────────────────────────────────────────────────────
// IP group rosters — home IP filters (FramerHome). Keep in sync with SixDayTracker.
// ─────────────────────────────────────────────────────────────────────────────
export type TeamRoster = { id: string; label: string; handles: string[] };

export const normTeamHandle = (h: unknown) =>
  String(h || "").replace(/^@/, "").trim().toLowerCase();

export const TEAM_ROSTERS: TeamRoster[] = [
  {
    id: "tech",
    label: "Tech playbook",
    handles: ["indiantechdaily", "101xtechnology", "ai.cracked"],
  },
  {
    id: "bizz_playbook",
    label: "Bizz playbook",
    handles: [
      "indiabusinesscom",
      "indiafounderscore",
      "indianfoundersco",
      "indiastartupstory",
    ],
  },
  {
    id: "bizz",
    label: "BIZZ",
    handles: ["bizzindia"],
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
    id: "founders",
    label: "Founders",
    handles: ["foundersinindia", "foundersindex", "startupcoded"],
  },
  {
    id: "inactive",
    label: "Inactive",
    handles: [
      "startupbydog",
      "indianbusinesscom",
      "entrepreneursindia.co",
      "therealfoundr",
      "elitefoundrs",
      "indiafounderbrief",
      "startupswtf",
    ],
  },
];
