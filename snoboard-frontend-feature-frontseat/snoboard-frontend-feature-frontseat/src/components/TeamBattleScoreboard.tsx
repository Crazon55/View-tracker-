import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Swords, Flame } from "lucide-react";
import { getTeamsPerformance, getTrackerIdeas, getTrackerNiches, getSixDayMonth } from "@/services/api";
import { buildTeamPerformanceFromTracker } from "@/lib/teamPerformanceCompute";

function formatViews(n: number | undefined | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return `${v}`;
}

const SKIN: Record<string, { grad: string; text: string; tagline: string }> = {
  garfields:   { grad: "from-orange-500 via-amber-500 to-yellow-400",  text: "text-orange-300", tagline: "lasagna-powered" },
  goofies:     { grad: "from-sky-400 via-indigo-500 to-fuchsia-500",   text: "text-sky-300",    tagline: "hyuck hyuck gang" },
  sheruses:    { grad: "from-rose-500 via-pink-500 to-fuchsia-400",    text: "text-rose-300",   tagline: "changing the order" },
  experimentx: { grad: "from-violet-500 via-purple-500 to-fuchsia-600", text: "text-violet-300", tagline: "in the lab" },
};

async function fetchTeams() {
  const now = new Date();
  const ym = now.getDate() === 1
    ? `${new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1).padStart(2, "0")}`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  try {
    const data = await getTeamsPerformance();
    const hasAllTeams = ["garfields", "goofies", "sheruses", "experimentx"].every(
      (k) => (data as any)?.teams?.some((t: any) => t.key === k)
    );
    if (data && (data as any).views_period != null && hasAllTeams) return data as any;
  } catch { /* fall through to client compute */ }
  const [ideas, niches, sixDay] = await Promise.all([
    getTrackerIdeas(),
    getTrackerNiches(),
    getSixDayMonth(ym).catch(() => null),
  ]);
  return buildTeamPerformanceFromTracker(
    Array.isArray(ideas) ? ideas : [],
    Array.isArray(niches) ? niches : [],
    sixDay,
  );
}

export default function TeamBattleScoreboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["teams-performance"],
    queryFn: fetchTeams,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const teams: any[] = (data as any)?.teams ?? [];
  const totalViews6d = teams.reduce((s: number, t: any) => s + (t.views_6d || 0), 0);
  const teamA = teams.find((t: any) => t.key === "garfields");
  const teamB = teams.find((t: any) => t.key === "goofies");
  const teamC = teams.find((t: any) => t.key === "sheruses");
  const teamD = teams.find((t: any) => t.key === "experimentx");

  const pctA = totalViews6d > 0 ? Math.max(1, Math.round(((teamA?.views_6d || 0) / totalViews6d) * 100)) : 25;
  const pctC = totalViews6d > 0 ? Math.max(1, Math.round(((teamC?.views_6d || 0) / totalViews6d) * 100)) : 25;
  const pctD = totalViews6d > 0 ? Math.max(1, Math.round(((teamD?.views_6d || 0) / totalViews6d) * 100)) : 25;
  const pctB = Math.max(1, 100 - pctA - pctC - pctD);

  return (
    <div
      className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-6 flex flex-col h-full cursor-pointer hover:border-zinc-700 transition-colors group"
      onClick={() => navigate("/team-performance")}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Swords className="w-4 h-4 text-amber-400" />
        <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">The Arena</h2>
        <span className="text-xs text-zinc-500 ml-auto group-hover:text-zinc-400 transition-colors">
          this month · open full view →
        </span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm py-8">Loading…</div>
      ) : (
        <>
          {/* Team cards */}
          <div className="grid grid-cols-4 gap-3 flex-1 items-start content-start">
            {[teamA, teamB, teamC, teamD].filter(Boolean).map((team: any) => {
              const skin = SKIN[team.key] ?? SKIN.garfields;
              return (
                <div key={team.key} className="flex flex-col items-center text-center w-full">
                  <div className="h-14 sm:h-16 flex items-center justify-center mb-2">
                    <span className="text-4xl sm:text-5xl leading-none">{team.emoji}</span>
                  </div>
                  <p className={`min-h-[1rem] text-[10px] font-black tracking-[0.15em] uppercase ${skin.text}`}>
                    {team.label}
                  </p>
                  <p className="min-h-[1rem] text-[9px] text-zinc-500 italic mb-2">{skin.tagline}</p>
                  <p className="min-h-[2rem] flex items-center justify-center text-2xl sm:text-3xl font-black text-white tabular-nums leading-none">
                    {formatViews(team.views_6d)}
                  </p>
                  <p className="min-h-[1rem] text-[9px] text-zinc-500 mt-1 tabular-nums">
                    All time · <span className="text-zinc-400">{formatViews(team.views_total)}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {/* Split bar */}
          <div className="mt-6">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-400" /> Month view split
              </span>
              <span className="text-white tabular-nums">{formatViews(totalViews6d)} total</span>
            </div>
            <div className="h-3.5 rounded-full bg-zinc-900 overflow-hidden flex border border-zinc-800">
              {teamA && (
                <motion.div
                  initial={{ width: "34%" }}
                  animate={{ width: `${pctA}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
                  className={`h-full bg-gradient-to-r ${SKIN.garfields.grad} flex items-center justify-end pr-1`}
                >
                  {pctA >= 8 && <span className="text-[8px] font-black text-zinc-900">{pctA}%</span>}
                </motion.div>
              )}
              {teamB && (
                <motion.div
                  initial={{ width: "33%" }}
                  animate={{ width: `${pctB}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
                  className={`h-full bg-gradient-to-r ${SKIN.goofies.grad} flex items-center justify-center`}
                >
                  {pctB >= 8 && <span className="text-[8px] font-black text-zinc-900">{pctB}%</span>}
                </motion.div>
              )}
              {teamC && (
                <motion.div
                  initial={{ width: "25%" }}
                  animate={{ width: `${pctC}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
                  className={`h-full bg-gradient-to-r ${SKIN.sheruses.grad} flex items-center justify-center`}
                >
                  {pctC >= 8 && <span className="text-[8px] font-black text-zinc-900">{pctC}%</span>}
                </motion.div>
              )}
              {teamD && (
                <motion.div
                  initial={{ width: "25%" }}
                  animate={{ width: `${pctD}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
                  className={`h-full bg-gradient-to-r ${SKIN.experimentx.grad} flex items-center justify-start pl-1`}
                >
                  {pctD >= 8 && <span className="text-[8px] font-black text-zinc-900">{pctD}%</span>}
                </motion.div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
