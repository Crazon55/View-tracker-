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
    handles: ["101xtechnology", "ai.cracked"],
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

/** Active 6-day tracker groups only (excludes Inactive). */
export const ACTIVE_TEAM_ROSTERS: TeamRoster[] = TEAM_ROSTERS.filter((t) => t.id !== "inactive");

export const INACTIVE_HANDLES = new Set(
  (TEAM_ROSTERS.find((t) => t.id === "inactive")?.handles ?? []).map(normTeamHandle),
);

export const ACTIVE_HANDLES = new Set(
  ACTIVE_TEAM_ROSTERS.flatMap((t) => t.handles.map(normTeamHandle)),
);