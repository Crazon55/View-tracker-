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

/** All cycles in the month (getSixDayMonth) → per-team month totals, or null to use posting 6d. */
function computeTeamViews6dFromSixDay(
  teamAccounts: Record<TeamKey, Set<string>>,
  sixDayMonth: any | null | undefined,
): Record<TeamKey, number> | null {
  if (!sixDayMonth?.cycles?.length) return null;
  const handleToTeam: Record<string, TeamKey> = {};
  for (const k of TEAM_ORDER) {
    for (const h of teamAccounts[k]) {
      handleToTeam[h] = k;
    }
  }
  const pidToH = new Map<string, string>();
  for (const p of sixDayMonth.pages || []) {
    if (!p?.id) continue;
    const h = String(p.handle || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    pidToH.set(String(p.id), h);
  }
  const entries: any[] = [];
  for (const c of sixDayMonth.cycles as Array<{ entries?: any[] }>) {
    for (const e of c?.entries || []) {
      entries.push(e);
    }
  }
  if (entries.length === 0) return null;
  const out: Record<TeamKey, number> = { garfields: 0, goofies: 0 };
  for (const e of entries) {
    const h = pidToH.get(String(e.page_id)) || "";
    const tk = handleToTeam[h];
    if (!tk) continue;
    out[tk] += Number(e?.views || 0) || 0;
  }
  return out;
}

function normCreator(raw: any): string {
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

export function buildTeamPerformanceFromTracker(
  ideas: any[],
  niches: any[],
  sixDayMonth?: any,
): {
  teams: any[];
  leader_key: string | null;
  leader_margin_views_6d: number;
  leader_margin_views_total: number;
  top_idea_overall: any | null;
  top_idea_6d: any | null;
  top_creator_6d: any | null;
  people: any[];
  window_days: number;
} {
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

  // Views aggregation
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 6);

  type CreatorStat = { views_total: number; views_6d: number; ideas: Set<string> };
  const teamViews: Record<TeamKey, {
    views_total: number;
    views_6d: number;
    views_by_idea: Map<string, number>;
    views_by_idea_6d: Map<string, number>;
    views_by_creator: Map<string, CreatorStat>;
  }> = {
    garfields: { views_total: 0, views_6d: 0, views_by_idea: new Map(), views_by_idea_6d: new Map(), views_by_creator: new Map() },
    goofies: { views_total: 0, views_6d: 0, views_by_idea: new Map(), views_by_idea_6d: new Map(), views_by_creator: new Map() },
  };
  const ideaById: Record<string, any> = {};
  const ideaViewsTotal = new Map<string, number>();
  const ideaViewsSixD = new Map<string, number>();

  for (const idea of ideas) {
    if (idea?.id) ideaById[idea.id] = idea;
    const tk = ideaTeam(idea);
    if (!tk) continue;
    const bucket = contentBucket(idea);
    const st = String(idea.stage || "").toLowerCase();
    const s = stats[tk];
    s.ideas_total += 1;
    if (bucket === "post") s.post_total += 1;
    else s.reel_total += 1;
    // Post Tracker uses "uploaded" for the final shipped state, Content
    // Tracker uses "posted". Treat them as the same thing so a PostTracker
    // idea marked uploaded counts toward the team's posted totals.
    if (st === "posted" || st === "uploaded") {
      s.ideas_posted += 1;
      if (bucket === "post") s.post_posted += 1;
      else s.reel_posted += 1;
    } else if (st === "kill") {
      s.ideas_killed += 1;
      if (bucket === "post") s.post_killed += 1;
      else s.reel_killed += 1;
    }

    const postings = (idea as any).tracker_postings || [];
    const creator = normCreator(idea.created_by);
    const tv = teamViews[tk];
    for (const p of postings) {
      const v = Number(p?.views || 0) || 0;
      if (v <= 0) continue;
      const dStr = String(p?.date || "").slice(0, 10);
      let in6d = false;
      if (dStr) {
        const d = new Date(dStr + "T00:00:00");
        if (!isNaN(d.getTime())) in6d = d >= cutoff && d <= today;
      }
      tv.views_total += v;
      tv.views_by_idea.set(idea.id, (tv.views_by_idea.get(idea.id) || 0) + v);
      ideaViewsTotal.set(idea.id, (ideaViewsTotal.get(idea.id) || 0) + v);
      if (in6d) {
        tv.views_6d += v;
        tv.views_by_idea_6d.set(idea.id, (tv.views_by_idea_6d.get(idea.id) || 0) + v);
        ideaViewsSixD.set(idea.id, (ideaViewsSixD.get(idea.id) || 0) + v);
      }
      if (creator) {
        const c = tv.views_by_creator.get(creator) || { views_total: 0, views_6d: 0, ideas: new Set<string>() };
        c.views_total += v;
        c.ideas.add(idea.id);
        if (in6d) c.views_6d += v;
        tv.views_by_creator.set(creator, c);
      }
    }
  }

  function ideaCard(iid: string, team_key: TeamKey) {
    const idea = ideaById[iid];
    if (!idea) return null;
    return {
      id: iid,
      title: idea.title || "Untitled",
      type: contentBucket(idea),
      source: idea.source || "original",
      creator: normCreator(idea.created_by),
      team: team_key,
    };
  }

  const sixDayByTeam = computeTeamViews6dFromSixDay(teamAccounts, sixDayMonth);

  const teams_out = TEAM_ORDER.map((team_key) => {
    const handles = Array.from(teamAccounts[team_key]).sort();
    const st = stats[team_key];
    const meta = TEAM_META[team_key];
    const tv = teamViews[team_key];

    let top_creator_6d: any = null;
    let top_creator_all: any = null;
    if (tv.views_by_creator.size) {
      const entries = Array.from(tv.views_by_creator.entries());
      const r6 = entries.slice().sort((a, b) => (b[1].views_6d - a[1].views_6d) || (b[1].views_total - a[1].views_total));
      if (r6[0][1].views_6d > 0) top_creator_6d = { name: r6[0][0], views: r6[0][1].views_6d, ideas: r6[0][1].ideas.size };
      const rAll = entries.slice().sort((a, b) => (b[1].views_total - a[1].views_total) || (b[1].views_6d - a[1].views_6d));
      if (rAll[0][1].views_total > 0) top_creator_all = { name: rAll[0][0], views: rAll[0][1].views_total, ideas: rAll[0][1].ideas.size };
    }

    let top_idea_6d: any = null;
    if (tv.views_by_idea_6d.size) {
      const [iid, v] = Array.from(tv.views_by_idea_6d.entries()).reduce((a, b) => (b[1] > a[1] ? b : a));
      const c = ideaCard(iid, team_key);
      if (c) top_idea_6d = { ...c, views: v };
    }
    let top_idea_all: any = null;
    if (tv.views_by_idea.size) {
      const [iid, v] = Array.from(tv.views_by_idea.entries()).reduce((a, b) => (b[1] > a[1] ? b : a));
      const c = ideaCard(iid, team_key);
      if (c) top_idea_all = { ...c, views: v };
    }

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
      views_total: tv.views_total,
      views_6d: sixDayByTeam != null ? sixDayByTeam[team_key] : tv.views_6d,
      top_creator_6d,
      top_creator_all,
      top_idea_6d,
      top_idea_all,
    };
  });

  teams_out.sort(
    (a, b) =>
      b.views_6d - a.views_6d ||
      b.views_total - a.views_total ||
      b.posted_rate - a.posted_rate ||
      b.ideas_posted - a.ideas_posted,
  );

  let leader_key: string | null = null;
  let leader_margin_views_6d = 0;
  let leader_margin_views_total = 0;
  if (teams_out.length === 1) {
    if (teams_out[0].ideas_total > 0 || teams_out[0].views_6d > 0) leader_key = teams_out[0].key;
  } else if (teams_out.length >= 2) {
    const t0 = teams_out[0];
    const t1 = teams_out[1];
    const k0 = [t0.views_6d, t0.views_total, t0.posted_rate, t0.ideas_posted];
    const k1 = [t1.views_6d, t1.views_total, t1.posted_rate, t1.ideas_posted];
    let greater = false;
    for (let i = 0; i < k0.length; i++) {
      if (k0[i] !== k1[i]) {
        greater = k0[i] > k1[i];
        break;
      }
    }
    if (greater) leader_key = t0.key;
    leader_margin_views_6d = t0.views_6d - t1.views_6d;
    leader_margin_views_total = t0.views_total - t1.views_total;
  }

  function pickTopIdea(pool: Map<string, number>) {
    if (!pool.size) return null;
    const [iid, v] = Array.from(pool.entries()).reduce((a, b) => (b[1] > a[1] ? b : a));
    const idea = ideaById[iid];
    if (!idea) return null;
    const tk = ideaTeam(idea);
    if (!tk) return null;
    const c = ideaCard(iid, tk);
    if (!c) return null;
    return { ...c, views: v, team_label: TEAM_META[tk].label, team_emoji: TEAM_META[tk].emoji };
  }

  const top_idea_overall = pickTopIdea(ideaViewsTotal);
  const top_idea_6d = pickTopIdea(ideaViewsSixD);

  let top_creator_6d_overall: any = null;
  const flat: { team: TeamKey; name: string; stat: CreatorStat }[] = [];
  for (const tk of TEAM_ORDER) {
    for (const [name, stat] of teamViews[tk].views_by_creator.entries()) {
      if (stat.views_6d > 0) flat.push({ team: tk, name, stat });
    }
  }
  if (flat.length) {
    flat.sort((a, b) => (b.stat.views_6d - a.stat.views_6d) || (b.stat.views_total - a.stat.views_total));
    const t = flat[0];
    top_creator_6d_overall = {
      name: t.name,
      team: t.team,
      team_label: TEAM_META[t.team].label,
      team_emoji: TEAM_META[t.team].emoji,
      views: t.stat.views_6d,
      ideas: t.stat.ideas.size,
    };
  }

  const people: any[] = [];
  for (const tk of TEAM_ORDER) {
    for (const [name, stat] of teamViews[tk].views_by_creator.entries()) {
      people.push({
        name,
        team: tk,
        team_label: TEAM_META[tk].label,
        team_emoji: TEAM_META[tk].emoji,
        views_total: stat.views_total,
        views_6d: stat.views_6d,
        ideas_count: stat.ideas.size,
      });
    }
  }
  people.sort((a, b) => (b.views_6d - a.views_6d) || (b.views_total - a.views_total));

  return {
    teams: teams_out,
    leader_key,
    leader_margin_views_6d,
    leader_margin_views_total,
    top_idea_overall,
    top_idea_6d,
    top_creator_6d: top_creator_6d_overall,
    people,
    window_days: 6,
  };
}
