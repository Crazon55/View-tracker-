import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  motion,
  AnimatePresence,
  useInView,
  useMotionValue,
  useTransform,
  animate,
  useAnimationControls,
} from "framer-motion";
import { getSixDayMonth, getTeamsPerformance, getTrackerIdeas, getTrackerNiches } from "@/services/api";
import { buildTeamPerformanceFromTracker, computeStreaksFromTrackerIdeas, type StreakDigest } from "@/lib/teamPerformanceCompute";
import {
  Trophy,
  Flame,
  Sparkles,
  Crown,
  Film,
  Image as ImageIcon,
  Rocket,
  Target,
  Swords,
  Users,
  AtSign,
  Medal,
  TrendingUp,
  Star,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wind,
  Leaf,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ============================== helpers ============================== */

function normalizePersonKey(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function guessDisplayNameFromEmail(email: string | undefined | null) {
  if (!email) return "";
  const raw = String(email).split("@")[0] || "";
  const cleaned = raw.replace(/[._-]+/g, " ").trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function streakCountFromTail(days: boolean[]) {
  let c = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!days[i]) break;
    c++;
  }
  return c;
}

function formatViews(n: number | undefined | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return `${v}`;
}

function formatPct(rate: number | undefined | null): string {
  return `${((rate ?? 0) * 100).toFixed(1)}%`;
}

const TEAM_SKIN: Record<
  string,
  {
    grad: string;
    glow: string;
    ring: string;
    text: string;
    bg: string;
    accent: string;
    tagline: string;
  }
> = {
  garfields: {
    grad: "from-orange-500 via-amber-500 to-yellow-400",
    glow: "shadow-orange-500/30",
    ring: "ring-orange-500/40",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    accent: "bg-orange-500",
    tagline: "lasagna-powered",
  },
  goofies: {
    grad: "from-sky-400 via-indigo-500 to-fuchsia-500",
    glow: "shadow-indigo-500/30",
    ring: "ring-indigo-500/40",
    text: "text-sky-300",
    bg: "bg-indigo-500/10",
    accent: "bg-indigo-500",
    tagline: "hyuck hyuck gang",
  },
};

function teamSkin(key: string) {
  return TEAM_SKIN[key] ?? TEAM_SKIN.garfields;
}

/**
 * Fade + rise when a section enters the viewport; eases back when it leaves
 * (scroll up or down). Do not use on the top hero scoreboard.
 */
function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, {
    once: false,
    amount: 0.12,
    margin: "0px 0px -12% 0px",
  });
  return (
    <motion.div
      ref={ref}
      animate={
        inView
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: 28 }
      }
      transition={{
        duration: 0.55,
        delay: inView ? delay : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ============================== easter-egg sounds ============================== */
// Real CC0 audio from BigSoundBank (no attribution required):
//   meow.mp3 -> "Little Meow of a Cat #1" (1 s kitten meow)
//   bark.mp3 -> "Barking of a Spitz"      (1 s small dog yip)
// Kept quiet on purpose — cute, not startling.
const MEOW_SRC = "/sounds/meow.mp3";
const BARK_SRC = "/sounds/bark.mp3";
const EASTER_EGG_VOLUME = 0.35;

function playClip(src: string) {
  try {
    const a = new Audio(src);
    a.volume = EASTER_EGG_VOLUME;
    // Small preload hint; ignored if already cached.
    a.preload = "auto";
    // play() returns a Promise that can reject if the browser blocks
    // autoplay — a double-click is a valid user gesture so it normally
    // works, but swallow the error just in case.
    void a.play().catch(() => {});
  } catch {
    /* no-op */
  }
}

function playTeamSound(teamKey: string) {
  if (teamKey === "goofies") playClip(BARK_SRC);
  else if (teamKey === "garfields") playClip(MEOW_SRC);
}

/* ============================== odometer ============================== */

function Odometer({
  value,
  format = (v: number) => v.toLocaleString(),
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => format(Math.round(v)));
  const [text, setText] = useState(format(0));
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = display.on("change", (latest) => setText(latest));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, mv, display]);
  return <span className={className}>{text}</span>;
}

/* ============================== data fetch ============================== */

type PerfData = {
  teams: any[];
  leader_key: string | null;
  leader_margin_views_6d?: number;
  leader_margin_views_total?: number;
  top_idea_overall?: any | null;
  top_idea_6d?: any | null;
  top_creator_6d?: any | null;
  people?: any[];
  window_days?: number;
  _source?: "api" | "client";
};

async function fetchPerf(): Promise<PerfData> {
  try {
    const data = await getTeamsPerformance();
    return { ...data, _source: "api" };
  } catch {
    const y = new Date();
    const ym = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}`;
    const [ideas, niches, sixDay] = await Promise.all([
      getTrackerIdeas(),
      getTrackerNiches(),
      getSixDayMonth(ym).catch(() => null),
    ]);
    const ideaList = Array.isArray(ideas) ? ideas : [];
    const nicheList = Array.isArray(niches) ? niches : [];
    return { ...buildTeamPerformanceFromTracker(ideaList, nicheList, sixDay), _source: "client" };
  }
}

/* ============================== page ============================== */

export default function TeamPerformance() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teams-performance"],
    queryFn: fetchPerf,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [showDetails, setShowDetails] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [breathMode, setBreathMode] = useState<"idle" | "breathing" | "done" | "touchgrass">("idle");
  const [breathLeft, setBreathLeft] = useState(120);
  const [grassLeft, setGrassLeft] = useState(300);
  const [resetIntent, setResetIntent] = useState<"breathing" | "touchgrass">("breathing");

  const streakIdeasQ = useQuery({
    queryKey: ["teams-performance-streak-ideas"],
    queryFn: () => getTrackerIdeas(),
    enabled: streakOpen,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const teams = data?.teams ?? [];
  const leaderKey = data?.leader_key ?? null;
  const people = data?.people ?? [];
  // order teams in fixed slot order so the hero scoreboard is stable
  const teamA = teams.find((t: any) => t.key === "garfields");
  const teamB = teams.find((t: any) => t.key === "goofies");
  const orderedTeams = [teamA, teamB].filter(Boolean);

  const totalViews6d = teams.reduce((s: number, t: any) => s + (t.views_6d || 0), 0);
  const totalViewsAll = teams.reduce((s: number, t: any) => s + (t.views_total || 0), 0);

  useEffect(() => {
    if (selectedPerson) return;
    const byEmail = guessDisplayNameFromEmail(user?.email);
    const targetKey = normalizePersonKey(byEmail);
    const found =
      people.find((p: any) => normalizePersonKey(p?.name) === targetKey)?.name ??
      people.find((p: any) => normalizePersonKey(p?.name).includes(targetKey) && targetKey.length >= 3)?.name ??
      people[0]?.name ??
      "";
    if (found) setSelectedPerson(found);
  }, [people, selectedPerson, user?.email]);

  const streaks: StreakDigest | null = useMemo(() => {
    const ideas = streakIdeasQ.data;
    if (!Array.isArray(ideas) || ideas.length === 0) return null;
    return computeStreaksFromTrackerIdeas(ideas, 7);
  }, [streakIdeasQ.data]);

  const selectedStreak =
    selectedPerson && streaks?.by_person?.[selectedPerson] ? streaks.by_person[selectedPerson] : null;
  const ideaNow = selectedStreak ? streakCountFromTail(selectedStreak.idea.last7) : 0;
  const postNow = selectedStreak ? streakCountFromTail(selectedStreak.posting.last7) : 0;

  useEffect(() => {
    if (!resetOpen) {
      setBreathMode("idle");
      setBreathLeft(120);
      setGrassLeft(300);
      return;
    }
    if (resetIntent === "touchgrass") {
      setBreathMode("touchgrass");
      setGrassLeft(300);
    } else {
      setBreathMode("breathing");
      setBreathLeft(120);
    }
  }, [resetOpen, resetIntent]);

  useEffect(() => {
    if (!resetOpen || breathMode !== "breathing") return;
    const t = window.setInterval(() => {
      setBreathLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          setBreathMode("done");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [resetOpen, breathMode]);

  useEffect(() => {
    if (!resetOpen || breathMode !== "touchgrass") return;
    const t = window.setInterval(() => {
      setGrassLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          setBreathMode("done");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [resetOpen, breathMode]);

  // Render states AFTER hooks (avoids hook-order crashes)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        Warming up the arena…
      </div>
    );
  }
  if (isError || !data) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-red-400 text-sm">Could not load the leaderboard.</p>
        <p className="text-zinc-500 text-xs break-words">{msg}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-20 px-4 sm:px-6 overflow-hidden relative">
      {/* bg decor */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* ============================== header ============================== */}
        <ScrollReveal>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Swords className="w-5 h-5 text-amber-400" />
                <span className="text-[11px] uppercase tracking-[0.25em] text-amber-400 font-bold">
                  The arena · last {data.window_days ?? 6} days
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
                Leader<span className="text-amber-400">board</span>
              </h1>
              <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
                Garfields vs Goofies — same stats as below, in a calmer read.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Popover open={streakOpen} onOpenChange={setStreakOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black",
                      "border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-zinc-200 transition-colors",
                    )}
                    title="Streaks"
                  >
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-zinc-300">{selectedPerson || "Streaks"}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-violet-200">Ideas {ideaNow}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-orange-200">Posts {postNow}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[340px] rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl p-4 text-zinc-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Streaks</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Last 7 days. Click a name to switch.</p>
                    </div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {streakIdeasQ.isFetching ? "Updating…" : ""}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {(people || []).map((p: any) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setSelectedPerson(p.name)}
                        className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors",
                          selectedPerson === p.name
                            ? "bg-amber-500/15 text-amber-200 border-amber-500/25"
                            : "bg-white/[0.03] text-zinc-200 border-white/10 hover:bg-white/[0.06]",
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {!streaks ? (
                    <div className="mt-4 text-sm text-zinc-500">
                      {streakIdeasQ.isLoading ? "Loading…" : "No streak data yet."}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-violet-200 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-violet-300" /> Idea-making
                          </p>
                          <p className="text-xs text-zinc-400 tabular-nums">Current: {ideaNow}</p>
                        </div>
                        <div className="mt-2 flex gap-1">
                          {(selectedStreak?.idea.last7 ?? Array(7).fill(false)).map((ok, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-2.5 w-2.5 rounded-full border",
                                ok ? "bg-violet-500/70 border-violet-400/40" : "bg-zinc-900 border-white/10",
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-orange-200 flex items-center gap-2">
                            <Rocket className="w-4 h-4 text-orange-300" /> Posting
                          </p>
                          <p className="text-xs text-zinc-400 tabular-nums">Current: {postNow}</p>
                        </div>
                        <div className="mt-2 flex gap-1">
                          {(selectedStreak?.posting.last7 ?? Array(7).fill(false)).map((ok, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-2.5 w-2.5 rounded-full border",
                                ok ? "bg-orange-500/70 border-orange-400/40" : "bg-zinc-900 border-white/10",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {data._source === "client" && (
                <p className="text-[11px] text-amber-400/90 border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-500/5 max-w-xs">
                  Showing client-computed stats — redeploy the API for live aggregates.
                </p>
              )}
            </div>
          </div>
        </ScrollReveal>

        {/* ============================== HERO SCOREBOARD (no scroll-reveal: hero stays immediate) ============================== */}
        {orderedTeams.length === 2 && (
          <HeroScoreboard
            teamA={orderedTeams[0]}
            teamB={orderedTeams[1]}
            leaderKey={leaderKey}
            totalViews6d={totalViews6d}
            totalViewsAll={totalViewsAll}
          />
        )}

        {/* ============================== HALL OF FAME ============================== */}
        <ScrollReveal delay={0.05}>
          <HallOfFame
            topCreator={data.top_creator_6d}
            topIdea6d={data.top_idea_6d}
            topIdeaAll={data.top_idea_overall}
          />
        </ScrollReveal>

        {/* ============================== DETAILS TOGGLE ============================== */}
        <div className="mt-6 sticky top-16 z-10">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-300">Keep it clean</p>
              <p className="text-[11px] text-zinc-500 truncate">
                Toggle extra sections (team breakdown + creator board)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-zinc-200 px-3 py-2 text-xs font-bold transition-colors"
            >
              {showDetails ? (
                <>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                  Show details
                </>
              )}
            </button>
          </div>
        </div>

        {showDetails && (
          <>
            {/* ============================== TEAM CARDS ============================== */}
            <ScrollReveal delay={0.08} className="mt-8">
              <div className="grid gap-5 md:grid-cols-2">
                {orderedTeams.map((team: any) => (
                  <TeamCard key={team.key} team={team} isLeader={leaderKey === team.key} />
                ))}
              </div>
            </ScrollReveal>

            {/* ============================== PEOPLE LEADERBOARD ============================== */}
            <ScrollReveal delay={0.1}>
              <PeopleLeaderboard people={people} windowDays={data.window_days ?? 6} />
            </ScrollReveal>
          </>
        )}
      </div>

      {/* ============================== RESET (stress reliever) ============================== */}
      <div className="fixed bottom-24 right-6 z-[60] flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setResetIntent("breathing");
            setResetOpen(true);
          }}
          className="rounded-2xl border border-violet-500/25 bg-zinc-950/70 backdrop-blur-xl px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-500/10 hover:bg-zinc-900/70 transition-colors flex items-center gap-2"
          title="Stress reliever"
        >
          <Wind className="w-4 h-4 text-violet-300" />
          Stress reliever
        </button>
        <button
          type="button"
          onClick={() => {
            setResetIntent("touchgrass");
            setResetOpen(true);
          }}
          className="rounded-2xl border border-emerald-500/20 bg-zinc-950/70 backdrop-blur-xl px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/10 hover:bg-zinc-900/70 transition-colors flex items-center gap-2"
          title="Touch grass"
        >
          <Leaf className="w-4 h-4 text-emerald-300" />
          Touch grass
        </button>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl text-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {breathMode === "touchgrass" ? (
                <>
                  <Leaf className="w-5 h-5 text-emerald-300" /> Touch grass
                </>
              ) : (
                <>
                  <Wind className="w-5 h-5 text-violet-300" /> Stress reliever
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              {breathMode === "touchgrass"
                ? "Stand up. Look away. Come back fresh."
                : "Breathe in and out. Two minutes."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold">
              <span className="uppercase tracking-[0.2em]">
                {breathMode === "touchgrass" ? "Touch grass" : "Breathing"}
              </span>
              <span className="tabular-nums">
                {breathMode === "breathing" ? `${breathLeft}s` : breathMode === "touchgrass" ? `${grassLeft}s` : "—"}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-center">
              <motion.div
                animate={
                  breathMode === "breathing"
                    ? { scale: [1, 1.25, 1.18, 1.35, 1], opacity: [0.9, 1, 0.95, 1, 0.9] }
                    : breathMode === "touchgrass"
                      ? { scale: [1, 1.15, 1], opacity: [0.9, 1, 0.9] }
                      : { scale: 1, opacity: 0.95 }
                }
                transition={
                  breathMode === "breathing"
                    ? { duration: 12, repeat: Infinity, ease: "easeInOut" }
                    : breathMode === "touchgrass"
                      ? { duration: 4, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.2 }
                }
                className="relative w-32 h-32 rounded-full"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/35 via-fuchsia-500/20 to-orange-500/15 blur-xl" />
                <div className="absolute inset-0 rounded-full bg-zinc-950 border border-white/10" />
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_60%)]" />
              </motion.div>
            </div>

            <div className="mt-4 text-center">
              {breathMode === "idle" && <p className="text-sm text-zinc-400">Starting…</p>}
              {breathMode === "breathing" && (
                <p className="text-sm text-zinc-300">
                  In… hold… out… <span className="text-zinc-500">(you’ve got this)</span>
                </p>
              )}
              {breathMode === "touchgrass" && <p className="text-sm text-zinc-300">Touch grass time. Stand up. Look away.</p>}
              {breathMode === "done" && <p className="text-sm text-emerald-200 font-semibold">Reset complete.</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-end">
            {breathMode === "done" && (
              <button
                type="button"
                onClick={() => setBreathMode("touchgrass")}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-100 px-3 py-2 text-sm font-bold transition-colors"
              >
                <Leaf className="w-4 h-4" />
                Touch grass (5m)
              </button>
            )}
            {breathMode !== "done" && (
              <button
                type="button"
                onClick={() => setBreathMode("done")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-zinc-200 px-3 py-2 text-sm font-bold transition-colors"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] text-zinc-200 px-3 py-2 text-sm font-bold transition-colors"
            >
              Back to work
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================== hero scoreboard ============================== */

function HeroScoreboard({
  teamA,
  teamB,
  leaderKey,
  totalViews6d,
  totalViewsAll,
}: {
  teamA: any;
  teamB: any;
  leaderKey: string | null;
  totalViews6d: number;
  totalViewsAll: number;
}) {
  const pctA =
    totalViews6d > 0 ? Math.max(2, Math.round(((teamA.views_6d || 0) / totalViews6d) * 100)) : 50;
  const pctB = Math.max(2, 100 - pctA);
  const tie = leaderKey === null;

  return (
    <div className="relative rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-5 sm:p-8 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent pointer-events-none" />

      {tie && (
        <div className="flex items-center justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/80 text-zinc-400 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
            Tied on month views — go make some hits
          </div>
        </div>
      )}

      {/* score row */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <TeamScorePanel team={teamA} isLeader={leaderKey === teamA.key} align="right" />
        <div className="flex flex-col items-center gap-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold">VS</div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: [0, 5, -5, 0] }}
            transition={{ type: "spring", stiffness: 200, damping: 12 }}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30"
          >
            <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900" />
          </motion.div>
        </div>
        <TeamScorePanel team={teamB} isLeader={leaderKey === teamB.key} align="left" />
      </div>

      {/* 6-day tracker: month-total view split */}
      <div className="mt-7">
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">
          <span className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-400" /> Month view split
            <span className="lowercase text-zinc-600 font-medium normal-case tracking-normal">(6-day tracker)</span>
          </span>
          <span className="text-white tabular-nums">{formatViews(totalViews6d)} total</span>
        </div>
        <div className="h-4 rounded-full bg-zinc-900 overflow-hidden flex shadow-inner border border-zinc-800">
          <motion.div
            initial={{ width: "50%" }}
            animate={{ width: `${pctA}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
            className={`h-full bg-gradient-to-r ${teamSkin(teamA.key).grad} flex items-center justify-end pr-2`}
          >
            <span className="text-[10px] font-black text-zinc-900">{pctA}%</span>
          </motion.div>
          <motion.div
            initial={{ width: "50%" }}
            animate={{ width: `${pctB}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
            className={`h-full bg-gradient-to-r ${teamSkin(teamB.key).grad} flex items-center justify-start pl-2`}
          >
            <span className="text-[10px] font-black text-zinc-900">{pctB}%</span>
          </motion.div>
        </div>
        <p className="text-center text-[11px] text-zinc-500 mt-3">
          All-time views: <span className="text-white font-semibold">{formatViews(totalViewsAll)}</span>
        </p>
      </div>
    </div>
  );
}

function TeamScorePanel({
  team,
  isLeader,
  align,
}: {
  team: any;
  isLeader: boolean;
  align: "left" | "right";
}) {
  const skin = teamSkin(team.key);
  const emojiControls = useAnimationControls();
  const [poof, setPoof] = useState<{ id: number; char: string } | null>(null);

  const handleEasterEgg = () => {
    playTeamSound(team.key);
    const poofChar = team.key === "goofies" ? "🐾" : "🐟";
    setPoof({ id: Date.now(), char: poofChar });
    window.setTimeout(() => setPoof(null), 900);
    emojiControls.start({
      y: [0, -28, 0],
      rotate: [0, -14, 14, -8, 8, 0],
      scale: [1, 1.18, 1],
      transition: { duration: 0.7, ease: "easeOut" },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: align === "right" ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
    >
      <div
        onDoubleClick={handleEasterEgg}
        onTouchEnd={(e) => {
          // Treat a double-tap on mobile the same as dblclick
          const now = Date.now();
          const lastTap = (e.currentTarget as any)._lastTap || 0;
          (e.currentTarget as any)._lastTap = now;
          if (now - lastTap < 350) handleEasterEgg();
        }}
        title={team.key === "goofies" ? "Double-click me (woof)" : "Double-click me (meow)"}
        className="relative cursor-pointer select-none"
      >
        <motion.div
          animate={emojiControls}
          initial={{ y: 0, rotate: 0, scale: 1 }}
          className={`text-5xl sm:text-7xl drop-shadow-[0_4px_20px_rgba(255,180,0,0.3)] ${
            isLeader ? "" : "opacity-70"
          }`}
          aria-hidden
        >
          <motion.span
            animate={isLeader ? { y: [0, -4, 0] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block"
          >
            {team.emoji}
          </motion.span>
        </motion.div>
        <AnimatePresence>
          {poof && (
            <motion.span
              key={poof.id}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: -40, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 text-2xl"
              aria-hidden
            >
              {poof.char}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={`mt-1 text-xs font-black tracking-[0.2em] uppercase ${skin.text}`}>{team.label}</div>
      <div className={`text-[10px] text-zinc-500 ${align === "right" ? "mb-2" : "mb-2"} italic`}>
        {skin.tagline}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mt-1">
        Views · tracker (month)
      </div>
      <div className={`text-3xl sm:text-5xl font-black tabular-nums ${isLeader ? "text-white" : "text-zinc-400"}`}>
        <Odometer value={team.views_6d || 0} format={formatViews} />
      </div>
      <div className="text-[11px] text-zinc-500 mt-1 tabular-nums">
        All time · <span className="text-zinc-300 font-semibold">{formatViews(team.views_total)}</span>
      </div>
    </motion.div>
  );
}

/* ============================== hall of fame ============================== */

function HallOfFame({
  topCreator,
  topIdea6d,
  topIdeaAll,
}: {
  topCreator: any | null | undefined;
  topIdea6d: any | null | undefined;
  topIdeaAll: any | null | undefined;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Hall of Fame</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MvpCard creator={topCreator} />
        <IdeaTrophyCard
          idea={topIdea6d}
          label="Hottest idea · 6d"
          icon={<Flame className="w-4 h-4 text-orange-400" />}
          gradient="from-orange-500/20 via-red-500/10 to-transparent"
          borderClass="border-orange-500/30"
        />
        <IdeaTrophyCard
          idea={topIdeaAll}
          label="Biggest hit · all time"
          icon={<Star className="w-4 h-4 text-amber-400" />}
          gradient="from-amber-500/20 via-yellow-500/10 to-transparent"
          borderClass="border-amber-500/30"
        />
      </div>
    </div>
  );
}

function MvpCard({ creator }: { creator: any | null | undefined }) {
  if (!creator) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-zinc-500 text-sm">
        <Crown className="w-5 h-5 mx-auto mb-2 text-zinc-600" />
        No MVP yet — first posting with views takes the crown.
      </div>
    );
  }
  const skin = teamSkin(creator.team);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={`relative rounded-2xl border ${skin.ring} border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 overflow-hidden`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${skin.grad}`} />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400 mb-3">
        <Crown className="w-3.5 h-3.5" /> MVP of the week
      </div>
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br ${skin.grad} shadow-lg`}
        >
          {creator.team_emoji}
        </motion.div>
        <div className="min-w-0">
          <p className="text-xl font-black text-white truncate">{creator.name}</p>
          <p className="text-xs text-zinc-500">
            <span className={`${skin.text} font-semibold`}>{creator.team_label}</span> ·{" "}
            {creator.ideas} idea{creator.ideas === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Views · 6d</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none">
            <Odometer value={creator.views} format={formatViews} />
          </p>
        </div>
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-amber-400"
        >
          <Trophy className="w-8 h-8 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" />
        </motion.div>
      </div>
    </motion.div>
  );
}

function IdeaTrophyCard({
  idea,
  label,
  icon,
  gradient,
  borderClass,
}: {
  idea: any | null | undefined;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  borderClass: string;
}) {
  if (!idea) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-zinc-500 text-sm">
        <div className="flex justify-center mb-2 opacity-50">{icon}</div>
        Nothing here yet — the first viral post wins.
      </div>
    );
  }
  const skin = teamSkin(idea.team);
  const isReel = (idea.type || "").toLowerCase() === "reel";
  const isCompetitor = (idea.source || "").toLowerCase() === "competitor";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={`relative rounded-2xl border ${borderClass} bg-gradient-to-br ${gradient} bg-zinc-900/80 p-5 overflow-hidden`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-white/90 mb-3">
        {icon} <span>{label}</span>
      </div>
      <p className="text-base font-bold text-white line-clamp-2 leading-snug min-h-[2.5rem]">
        {idea.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <Badge
          className={`${skin.bg} ${skin.text} border border-white/10 text-[10px] font-bold`}
        >
          {idea.team_emoji} {idea.team_label}
        </Badge>
        <Badge
          className={`text-[10px] font-bold border ${
            isReel
              ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
              : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          }`}
        >
          {isReel ? <Film className="w-3 h-3 mr-1" /> : <ImageIcon className="w-3 h-3 mr-1" />}
          {isReel ? "Reel" : "Post"}
        </Badge>
        <Badge
          className={`text-[10px] font-bold border ${
            isCompetitor
              ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
              : "bg-sky-500/15 text-sky-300 border-sky-500/30"
          }`}
        >
          {isCompetitor ? (
            <>
              <Target className="w-3 h-3 mr-1" /> Competitor
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 mr-1" /> Original
            </>
          )}
        </Badge>
      </div>
      <div className="flex items-end justify-between mt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Views</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none">
            <Odometer value={idea.views || 0} format={formatViews} />
          </p>
        </div>
        {idea.creator && (
          <p className="text-[11px] text-zinc-400 italic text-right max-w-[45%] truncate">
            by {idea.creator}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ============================== team card ============================== */

function TeamCardLineProgress({
  label,
  icon,
  posted,
  total,
  barClass,
}: {
  label: string;
  icon: React.ReactNode;
  posted: number;
  total: number;
  barClass: string;
}) {
  const p = total > 0 ? Math.min(100, (posted / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="uppercase tracking-wide font-semibold text-zinc-500">{label}</span>
        </span>
        <span className="tabular-nums text-zinc-500 shrink-0">
          <span className="text-zinc-200 font-bold">{posted ?? 0}</span> / {total ?? 0}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-zinc-800/90 overflow-hidden border border-white/[0.04]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function TeamCard({ team, isLeader }: { team: any; isLeader: boolean }) {
  const skin = teamSkin(team.key);
  const cr = team.top_creator_6d;
  const idea = team.top_idea_6d;
  return (
    <div
      className={`relative rounded-3xl border ${
        isLeader ? `border-amber-500/35 shadow-lg ${skin.glow}` : "border-white/[0.08]"
      } bg-zinc-950/40 backdrop-blur-xl overflow-hidden`}
    >
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${skin.grad} opacity-90`} />

      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-3xl shrink-0" aria-hidden>
              {team.emoji}
            </span>
            <h2 className="text-xl font-black text-white truncate">{team.label}</h2>
            {isLeader && (
              <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/25 gap-1 shrink-0">
                <Trophy className="w-3 h-3" /> Leading
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {team.member_count} people · {team.account_count} account{team.account_count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Views · 6d</p>
          <p className="text-3xl font-black text-white tabular-nums leading-none">{formatViews(team.views_6d)}</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        <span className="inline-flex items-baseline gap-2 text-[13px]">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Ship</span>
          <span className="font-bold text-white tabular-nums">{formatPct(team.posted_rate)}</span>
        </span>
      </div>

      <div className="px-5 pb-5 space-y-5">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-4 space-y-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Top creator · 6d</p>
            <p className="text-sm font-bold text-white truncate">{cr?.name ?? "—"}</p>
            {cr ? (
              <p className="text-[12px] text-zinc-400 mt-0.5">
                {formatViews(cr.views)} · {cr.ideas} idea{cr.ideas === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="text-[12px] text-zinc-500 mt-0.5">—</p>
            )}
          </div>
          <div className="h-px bg-zinc-800/80" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Top idea · 6d</p>
            <p className="text-sm font-bold text-white line-clamp-2 leading-snug">{idea?.title ?? "—"}</p>
            {idea ? (
              <p className="text-[12px] text-zinc-400 mt-0.5">{formatViews(idea.views)} views</p>
            ) : (
              <p className="text-[12px] text-zinc-500 mt-0.5">—</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Ideas pipeline</p>
          <p className="text-[13px] text-zinc-300 leading-relaxed">
            <span className="font-black text-white tabular-nums">{team.ideas_total}</span> total
            <span className="text-zinc-600"> · </span>
            <span className="text-emerald-400/95 font-bold tabular-nums">{team.ideas_posted}</span> posted
            <span className="text-zinc-600"> · </span>
            <span className="text-violet-300/95 font-bold tabular-nums">{team.ideas_in_progress ?? 0}</span> WIP
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-500 font-bold tabular-nums">{team.ideas_killed ?? 0}</span> killed
          </p>
          <div className="mt-4 space-y-3">
            <TeamCardLineProgress
              label="Reels"
              icon={<Film className="w-3.5 h-3.5 text-violet-400/90" />}
              posted={team.reel_posted}
              total={team.reel_total}
              barClass="bg-gradient-to-r from-violet-500 to-fuchsia-500"
            />
            <TeamCardLineProgress
              label="Posts"
              icon={<ImageIcon className="w-3.5 h-3.5 text-emerald-400/90" />}
              posted={team.post_posted}
              total={team.post_total}
              barClass="bg-gradient-to-r from-emerald-500 to-emerald-400/90"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5 font-semibold">
            <Users className="w-3.5 h-3.5" /> Squad
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {(team.members as string[]).map((name) => (
              <li
                key={name}
                className={`text-xs font-semibold text-white ${skin.bg} px-2.5 py-1 rounded-lg border border-white/5`}
              >
                {name}
              </li>
            ))}
          </ul>
        </div>

        {team.accounts?.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 font-semibold list-none">
              <AtSign className="w-3.5 h-3.5" /> Accounts ({team.account_count})
              <span className="ml-auto text-zinc-600 group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="mt-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-sm p-2 max-h-28 overflow-y-auto">
              <ul className="flex flex-wrap gap-1.5">
                {team.accounts.map((a: { handle: string }) => (
                  <li key={a.handle} className={`text-[11px] font-mono ${skin.text}`}>
                    @{a.handle}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/* ============================== people leaderboard ============================== */

function PeopleLeaderboard({ people, windowDays }: { people: any[]; windowDays: number }) {
  const [mode, setMode] = useState<"6d" | "all">("6d");
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const arr = [...(people || [])];
    if (mode === "6d") arr.sort((a, b) => (b.views_6d - a.views_6d) || (b.views_total - a.views_total));
    else arr.sort((a, b) => (b.views_total - a.views_total) || (b.views_6d - a.views_6d));
    return arr;
  }, [people, mode]);

  const top = sorted[0];
  const max =
    mode === "6d"
      ? Math.max(1, ...sorted.map((p) => p.views_6d || 0))
      : Math.max(1, ...sorted.map((p) => p.views_total || 0));

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Medal className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
            Creator leaderboard
          </h2>
        </div>
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
          <button
            onClick={() => setMode("6d")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === "6d" ? "bg-amber-500 text-zinc-900" : "text-zinc-400 hover:text-white"
            }`}
          >
            Last {windowDays}d
          </button>
          <button
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === "all" ? "bg-amber-500 text-zinc-900" : "text-zinc-400 hover:text-white"
            }`}
          >
            All-time
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
          No creators on the board yet — post something and tag yourself on the idea.
        </div>
      ) : (
        <div ref={listRef} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800 overflow-hidden">
          {sorted.map((p, i) => {
            const skin = teamSkin(p.team);
            const score = mode === "6d" ? p.views_6d : p.views_total;
            const pct = Math.max(2, Math.round(((score || 0) / max) * 100));
            const rank = i + 1;
            const rankDecor =
              rank === 1
                ? "from-amber-400 to-yellow-300 text-zinc-900"
                : rank === 2
                  ? "from-zinc-300 to-zinc-200 text-zinc-900"
                  : rank === 3
                    ? "from-orange-400 to-amber-600 text-zinc-900"
                    : "bg-zinc-800 text-zinc-400";
            return (
              <motion.div
                key={`${p.team}-${p.name}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="relative flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/60 transition-colors"
              >
                <div
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black bg-gradient-to-br ${
                    rank <= 3 ? rankDecor : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {rank === 1 ? <Crown className="w-4 h-4" /> : rank}
                </div>
                <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl bg-zinc-800/70 border border-zinc-700">
                  {p.team_emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{p.name}</p>
                    <span className={`text-[10px] font-semibold uppercase ${skin.text}`}>
                      {p.team_label}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      · {p.ideas_count} idea{p.ideas_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.03 }}
                      className={`h-full bg-gradient-to-r ${skin.grad}`}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-white tabular-nums leading-none">
                    {formatViews(score)}
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {mode === "6d" ? "6d views" : "all time"}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {top && (
        <p className="text-center text-[11px] text-zinc-500 mt-3">
          Leading the pack: <span className="text-white font-semibold">{top.name}</span> ·{" "}
          <span className="text-amber-400 font-semibold">{formatViews(mode === "6d" ? top.views_6d : top.views_total)} views</span>
        </p>
      )}
    </div>
  );
}
