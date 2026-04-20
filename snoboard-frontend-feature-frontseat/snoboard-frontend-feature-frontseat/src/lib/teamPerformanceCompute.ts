/** Mirrors backend /api/v1/teams/performance so the dashboard works if that route is not deployed yet. */

const TEAM_ORDER = ["garfields", "goofies"] as const;
export type TeamKey = (typeof TEAM_ORDER)[number];

const TEAM_META: Record<
  TeamKey,
  { label: string; emoji: string; members: string[]; nicheMatch: string[] }
> = {
  garfields: {
    label: "Garfields",
    emoji: "🐱",
    members: ["Deepak", "Kaavya", "Swati"],
    nicheMatch: ["garfields"],
  },
  goofies: {
    label: "Goofies",
    emoji: "🐶",
    members: ["Arohi", "Harish", "Pulkit"],
    nicheMatch: ["goofies"],
  },
};

function emptyStats() {
  return {
    ideas_total: 0,
    ideas_posted: 0,
    ideas_killed: 0,
    reel_total: 0,
    reel_posted: 0,
    reel_killed: 0,
    post_total: 0,
    post_posted: 0,
    post_killed: 0,
  };
}

export function buildTeamPerformanceFromTracker(
  ideas: any[],
  niches: any[],
): { teams: any[]; leader_key: string | null } {
  const nicheIdToTeam: Record<string, TeamKey> = {};
  for (const n of niches) {
    const nid = n.id;
    const nm = String(n.name || "").toLowerCase();
    if (!nid) continue;
    for (const key of TEAM_ORDER) {
      if (TEAM_META[key].nicheMatch.some((sub) => nm.includes(sub))) {
        nicheIdToTeam[nid] = key;
        break;
      }
    }
  }

  const teamAccounts: Record<TeamKey, Set<string>> = {
    garfields: new Set(),
    goofies: new Set(),
  };
  for (const n of niches) {
    const tid = nicheIdToTeam[n.id];
    if (!tid) continue;
    for (const h of n.pages || []) {
      if (h) teamAccounts[tid].add(String(h).replace(/^@/, "").trim().toLowerCase());
    }
  }

  function ideaTeam(idea: any): TeamKey | null {
    const nid = idea.niche_id;
    if (nid && nicheIdToTeam[nid]) return nicheIdToTeam[nid];
    for (const x of idea.niche_ids || []) {
      if (nicheIdToTeam[x]) return nicheIdToTeam[x];
    }
    return null;
  }

  function contentBucket(idea: any): "reel" | "post" {
    const t = String(idea.type || "reel").toLowerCase().trim();
    return t === "post" ? "post" : "reel";
  }

  const stats: Record<TeamKey, ReturnType<typeof emptyStats>> = {
    garfields: emptyStats(),
    goofies: emptyStats(),
  };

  for (const idea of ideas) {
    const tk = ideaTeam(idea);
    if (!tk) continue;
    const bucket = contentBucket(idea);
    const st = String(idea.stage || "").toLowerCase();
    const s = stats[tk];
    s.ideas_total += 1;
    if (bucket === "post") s.post_total += 1;
    else s.reel_total += 1;
    if (st === "posted") {
      s.ideas_posted += 1;
      if (bucket === "post") s.post_posted += 1;
      else s.reel_posted += 1;
    } else if (st === "kill") {
      s.ideas_killed += 1;
      if (bucket === "post") s.post_killed += 1;
      else s.reel_killed += 1;
    }
  }

  const teams_out = TEAM_ORDER.map((team_key) => {
    const handles = Array.from(teamAccounts[team_key]).sort();
    const st = stats[team_key];
    const meta = TEAM_META[team_key];
    return {
      key: team_key,
      label: meta.label,
      emoji: meta.emoji,
      members: meta.members,
      member_count: meta.members.length,
      accounts: handles.map((handle) => ({ handle })),
      account_count: handles.length,
      ideas_total: st.ideas_total,
      ideas_posted: st.ideas_posted,
      ideas_killed: st.ideas_killed,
      ideas_in_progress: Math.max(0, st.ideas_total - st.ideas_posted - st.ideas_killed),
      reel_total: st.reel_total,
      reel_posted: st.reel_posted,
      reel_killed: st.reel_killed,
      post_total: st.post_total,
      post_posted: st.post_posted,
      post_killed: st.post_killed,
      posted_rate: st.ideas_total > 0 ? st.ideas_posted / st.ideas_total : 0,
    };
  });

  teams_out.sort(
    (a, b) =>
      b.posted_rate - a.posted_rate ||
      b.ideas_posted - a.ideas_posted ||
      b.ideas_total - a.ideas_total,
  );

  /** Lexicographic a > b (same as Python tuple compare). */
  function lexGreater(a: number[], b: number[]): boolean {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  let leader_key: string | null = null;
  if (teams_out.length === 1) {
    if (teams_out[0].ideas_total > 0) leader_key = teams_out[0].key;
  } else if (teams_out.length >= 2) {
    const t0 = [teams_out[0].posted_rate, teams_out[0].ideas_posted, teams_out[0].ideas_total];
    const t1 = [teams_out[1].posted_rate, teams_out[1].ideas_posted, teams_out[1].ideas_total];
    if (lexGreater(t0, t1)) leader_key = teams_out[0].key;
  }

  return { teams: teams_out, leader_key };
}
