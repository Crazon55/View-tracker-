import { useQuery } from "@tanstack/react-query";
import { getTeamsPerformance, getTrackerIdeas, getTrackerNiches } from "@/services/api";
import { buildTeamPerformanceFromTracker } from "@/lib/teamPerformanceCompute";
import { Trophy, Users, AtSign, Lightbulb, CheckCircle2, Skull, Loader2, Film, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function formatShipRate(rate: number | undefined): string {
  return `${((rate ?? 0) * 100).toFixed(1)}%`;
}

export type TeamPerformancePayload = {
  teams: any[];
  leader_key: string | null;
  _source?: "api" | "client";
};

async function fetchTeamPerformance(): Promise<TeamPerformancePayload> {
  try {
    const data = await getTeamsPerformance();
    return { teams: data.teams ?? [], leader_key: data.leader_key ?? null, _source: "api" };
  } catch {
    const [ideas, niches] = await Promise.all([getTrackerIdeas(), getTrackerNiches()]);
    const ideaList = Array.isArray(ideas) ? ideas : [];
    const nicheList = Array.isArray(niches) ? niches : [];
    return {
      ...buildTeamPerformanceFromTracker(ideaList, nicheList),
      _source: "client",
    };
  }
}

export default function TeamPerformance() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teams-performance"],
    queryFn: fetchTeamPerformance,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const teams = data?.teams ?? [];
  const leaderKey = data?.leader_key ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        Loading team stats…
      </div>
    );
  }

  if (isError || !data) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-red-400 text-sm">Could not load team performance.</p>
        <p className="text-zinc-500 text-xs break-words">{msg}</p>
        <p className="text-zinc-600 text-xs">
          If you see 404, pull the latest backend on the server and restart uvicorn so{" "}
          <code className="text-zinc-400">/api/v1/teams/performance</code> exists.
        </p>
      </div>
    );
  }

  const maxRate = Math.max(0, ...teams.map((t: any) => t.posted_rate ?? 0), 1e-9);

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
            Team performance
          </h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Garfields vs Goofies — <span className="text-zinc-400">reels and posts</span> from the content tracker.{" "}
            <span className="text-amber-400/90 font-medium">Winning team</span> has the higher{" "}
            <span className="text-violet-400 font-medium">posted ÷ total</span> ideas (ship rate). Tie-break: more ideas posted, then more total ideas.
          </p>
          {data._source === "client" && (
            <p className="text-xs text-amber-400/90 mt-2 max-w-2xl border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-500/5">
              Stats are computed in the browser from Reel Tracker ideas + niches (the dedicated team API is unavailable — e.g. backend not restarted). Redeploy the API to use{" "}
              <code className="text-zinc-400">/api/v1/teams/performance</code> directly.
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {teams.map((team: any) => {
            const isLeader = leaderKey === team.key;
            const posted = team.ideas_posted || 0;
            const totalIdeas = team.ideas_total || 0;
            const barPct = Math.round(((team.posted_rate ?? 0) / maxRate) * 100);

            return (
              <div
                key={team.key}
                className={`rounded-2xl border bg-zinc-900/80 overflow-hidden ${
                  isLeader
                    ? "border-amber-500/40 shadow-lg shadow-amber-500/10"
                    : "border-zinc-800"
                }`}
              >
                <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl" aria-hidden>{team.emoji}</span>
                      <h2 className="text-lg font-bold text-white">{team.label}</h2>
                      {isLeader && (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1">
                          <Trophy className="w-3 h-3" /> Winning
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      {team.account_count} account{team.account_count !== 1 ? "s" : ""} ·{" "}
                      {team.member_count} people
                    </p>
                    <p className="text-sm font-bold text-amber-400/95 mt-2 tabular-nums">
                      Ship rate {formatShipRate(team.posted_rate)}
                      <span className="text-zinc-500 font-normal text-xs ml-2">
                        ({posted}/{totalIdeas} posted)
                      </span>
                    </p>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> People
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {(team.members as string[]).map((name) => (
                        <li
                          key={name}
                          className="text-xs font-medium text-zinc-200 bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-700"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                      <AtSign className="w-3.5 h-3.5" /> Accounts in niche
                    </p>
                    {team.accounts?.length ? (
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                        <ul className="flex flex-wrap gap-1.5">
                          {team.accounts.map((a: { handle: string }) => (
                            <li
                              key={a.handle}
                              className="text-[11px] text-violet-300/90 font-mono"
                            >
                              @{a.handle}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600">
                        No handles in tracker niche yet — run niche setup or add pages in Reel / Post tracker niches.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" /> Ideas
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/80 py-3">
                        <p className="text-[10px] text-zinc-500 uppercase">Total</p>
                        <p className="text-xl font-black text-white tabular-nums">{team.ideas_total}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 py-3">
                        <p className="text-[10px] text-emerald-400/80 uppercase flex items-center justify-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Posted
                        </p>
                        <p className="text-xl font-black text-emerald-400 tabular-nums">{posted}</p>
                      </div>
                      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/80 py-3">
                        <p className="text-[10px] text-zinc-500 uppercase flex items-center justify-center gap-0.5">
                          <Skull className="w-3 h-3" /> Killed
                        </p>
                        <p className="text-xl font-black text-zinc-400 tabular-nums">
                          {team.ideas_killed ?? 0}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-2">
                      In progress (not posted / not killed):{" "}
                      <span className="text-zinc-400 font-medium">{team.ideas_in_progress ?? 0}</span>
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 px-2 py-2">
                        <p className="text-[10px] text-purple-300 uppercase font-medium flex items-center gap-1 mb-1.5">
                          <Film className="w-3 h-3" /> Reels
                        </p>
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span>Total</span>
                          <span className="text-white tabular-nums font-semibold">{team.reel_total ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span className="text-emerald-400/90">Posted</span>
                          <span className="text-emerald-400 tabular-nums font-semibold">{team.reel_posted ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-zinc-500">
                          <span>Killed</span>
                          <span className="tabular-nums">{team.reel_killed ?? 0}</span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2 py-2">
                        <p className="text-[10px] text-emerald-300 uppercase font-medium flex items-center gap-1 mb-1.5">
                          <ImageIcon className="w-3 h-3" /> Posts
                        </p>
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span>Total</span>
                          <span className="text-white tabular-nums font-semibold">{team.post_total ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span className="text-emerald-400/90">Posted</span>
                          <span className="text-emerald-400 tabular-nums font-semibold">{team.post_posted ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-zinc-500">
                          <span>Killed</span>
                          <span className="tabular-nums">{team.post_killed ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                      <span>Ship rate vs other team (bar scale)</span>
                      <span className="text-white font-bold tabular-nums">{formatShipRate(team.posted_rate)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isLeader ? "bg-amber-500" : "bg-violet-600"
                        }`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!leaderKey && teams.length >= 2 && (
          <p className="text-center text-sm text-zinc-500 mt-6">
            Tie on ship rate (and tie-breakers) — even match for now.
          </p>
        )}
      </div>
    </div>
  );
}
