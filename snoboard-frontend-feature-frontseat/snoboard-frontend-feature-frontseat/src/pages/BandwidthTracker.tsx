import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBandwidth, type BandwidthPerson } from "@/services/api";
import {
  PEOPLE_SEED,
  ROLE_LABEL,
  ROLE_COLOR,
  NICHE_LABEL,
  NICHE_EMOJI,
  lookupPerson,
  type PersonRole,
  type PersonNiche,
} from "@/lib/peopleSeed";
import { Gauge, Users, Sparkles, Film, Scissors, Rocket, Search, Lightbulb, Loader2 } from "lucide-react";

/* ============================== helpers ============================== */

type MetricKey = "comp_found" | "og_created" | "base_edits" | "pintu_sets" | "posted";

const METRIC_META: Record<MetricKey, { label: string; short: string; icon: any; color: string; accent: string }> = {
  comp_found: { label: "Competitor ideas found",   short: "Comp",       icon: Search,    color: "#7BB0FF", accent: "rgba(74,127,212,0.18)" },
  og_created: { label: "Original ideas created",   short: "OG",         icon: Lightbulb, color: "#F0C060", accent: "rgba(212,149,42,0.18)" },
  base_edits: { label: "Base edits done",          short: "Base edit",  icon: Scissors,  color: "#B49EFF", accent: "rgba(123,97,196,0.18)" },
  pintu_sets: { label: "Sets on Pintu (batch)",    short: "Pintu",      icon: Film,      color: "#9B8FFF", accent: "rgba(83,74,183,0.18)" },
  posted:     { label: "Posted",                   short: "Posted",     icon: Rocket,    color: "#5AE0A0", accent: "rgba(45,158,95,0.18)" },
};

const METRIC_KEYS: MetricKey[] = ["comp_found", "og_created", "base_edits", "pintu_sets", "posted"];

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekdayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "narrow" });
}

/* ============================== page ============================== */

export default function BandwidthTracker() {
  const [days, setDays] = useState<number>(14);
  const [roleFilter, setRoleFilter] = useState<"all" | PersonRole>("all");
  const [nicheFilter, setNicheFilter] = useState<"all" | PersonNiche>("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["bandwidth", days],
    queryFn: () => getBandwidth(days, "reel"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  /* Merge backend aggregates with the PeopleSeed so every seeded person
     shows up even if they have zero activity in the window — lets the user
     spot who's idle at a glance. */
  const joinedPeople = useMemo(() => {
    const byNorm = new Map<string, BandwidthPerson & { role: PersonRole | null; niche: PersonNiche | "unassigned"; seeded: boolean }>();
    const all_days = data?.all_days || [];

    const mk = (name: string): BandwidthPerson => ({
      name,
      niche_guess: "unassigned",
      niche_counts: { garfields: 0, goofies: 0, unassigned: 0 },
      totals: { comp_found: 0, og_created: 0, base_edits: 0, pintu_sets: 0, posted: 0 },
      daily: all_days.map((d) => ({ date: d, comp_found: 0, og_created: 0, base_edits: 0, pintu_sets: 0, posted: 0 })),
    });

    for (const p of PEOPLE_SEED) {
      byNorm.set(p.name, { ...mk(p.name), role: p.role, niche: p.niche, seeded: true });
    }

    for (const p of data?.people || []) {
      const seed = lookupPerson(p.name);
      const key = seed?.name ?? p.name;
      const existing = byNorm.get(key);
      if (existing) {
        byNorm.set(key, { ...existing, ...p, name: seed?.name ?? p.name, role: seed?.role ?? existing.role, niche: seed?.niche ?? existing.niche });
      } else {
        byNorm.set(key, { ...p, role: null, niche: (p.niche_guess as PersonNiche | "unassigned"), seeded: false });
      }
    }

    return Array.from(byNorm.values()).sort((a, b) => {
      const sumA = METRIC_KEYS.reduce((s, k) => s + (a.totals[k] || 0), 0);
      const sumB = METRIC_KEYS.reduce((s, k) => s + (b.totals[k] || 0), 0);
      return sumB - sumA;
    });
  }, [data]);

  const filteredPeople = useMemo(() => {
    return joinedPeople.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (nicheFilter !== "all" && p.niche !== nicheFilter) return false;
      return true;
    });
  }, [joinedPeople, roleFilter, nicheFilter]);

  /* Group filtered people by role (CS, CDI, …) for the page sections. */
  const groupedByRole = useMemo(() => {
    const groups: Record<string, typeof filteredPeople> = {};
    for (const p of filteredPeople) {
      const k = p.role || "unassigned";
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }
    const roleOrder: string[] = ["cs", "cdi", "cw", "design", "ai_automations", "ops_manager", "editors", "content_creators", "unassigned"];
    return roleOrder.filter((r) => groups[r]?.length).map((r) => ({ role: r as PersonRole | "unassigned", people: groups[r] }));
  }, [filteredPeople]);

  const teamTotals = data?.team_totals || { garfields: {}, goofies: {}, unassigned: {} } as any;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        Computing bandwidth…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-red-400 text-sm">Could not load bandwidth data.</p>
        <p className="text-zinc-500 text-xs break-words">{error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-20 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* ---------- header ---------- */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-5 h-5 text-violet-400" />
              <span className="text-[11px] uppercase tracking-[0.25em] text-violet-400 font-bold">
                Bandwidth tracker · reel pipeline
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
              Who's <span className="text-violet-400">shipping</span> what.
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
              Per-person output on the reel pipeline: competitor ideas found, OG ideas created, base edits, Pintu batch sets, and posts shipped. Window: {shortDate(data.window_start)} – {shortDate(data.window_end)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* window */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${days === d ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            {/* role */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
              {(["all", "cs", "cdi"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${roleFilter === r ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {r === "all" ? "All roles" : ROLE_LABEL[r as PersonRole]}
                </button>
              ))}
            </div>
            {/* niche */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
              {(["all", "garfields", "goofies"] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setNicheFilter(n)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${nicheFilter === n ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {n === "all" ? "All niches" : `${NICHE_EMOJI[n]} ${NICHE_LABEL[n]}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- team totals strip ---------- */}
        <TeamTotalsStrip teamTotals={teamTotals} />

        {/* ---------- empty ---------- */}
        {filteredPeople.length === 0 && (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
            <Users className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
            No people match the current filters.
          </div>
        )}

        {/* ---------- grouped by role ---------- */}
        <div className="mt-8 space-y-8">
          {groupedByRole.map(({ role, people }) => (
            <div key={role}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[11px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-md border"
                  style={
                    role === "unassigned"
                      ? { color: "#a1a1aa", background: "rgba(63,63,70,0.2)", borderColor: "rgba(63,63,70,0.4)" }
                      : {
                          color: ROLE_COLOR[role].text,
                          background: ROLE_COLOR[role].bg,
                          borderColor: ROLE_COLOR[role].border,
                        }
                  }
                >
                  {role === "unassigned" ? "Unassigned role" : ROLE_LABEL[role]}
                </span>
                <span className="text-xs text-zinc-600">
                  {people.length} {people.length === 1 ? "person" : "people"}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {people.map((p) => (
                  <PersonCard key={p.name} person={p} allDays={data.all_days} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* footnote */}
        <p className="text-center text-[11px] text-zinc-600 mt-10 max-w-2xl mx-auto">
          Attribution is captured when you click the stage buttons in the Reel Tracker (Start base edit, Proven / Batch edit, Mark posted).
          Historical ideas moved before this feature shipped won't appear under Base edits / Pintu sets / Posted until they're re-stamped.
          Edit <code className="text-zinc-500">src/lib/peopleSeed.ts</code> to fix roles or niches.
        </p>
      </div>
    </div>
  );
}

/* ============================== team totals strip ============================== */

function TeamTotalsStrip({ teamTotals }: { teamTotals: Record<string, Record<string, number>> }) {
  const rows: { key: "garfields" | "goofies"; label: string; emoji: string; grad: string }[] = [
    { key: "garfields", label: "Garfields", emoji: "🐱", grad: "from-orange-500 via-amber-500 to-yellow-400" },
    { key: "goofies",   label: "Goofies",   emoji: "🐶", grad: "from-sky-400 via-indigo-500 to-fuchsia-500" },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const t = teamTotals[r.key] || {};
        const total = METRIC_KEYS.reduce((s, k) => s + (t[k] || 0), 0);
        return (
          <div key={r.key} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
            <div className={`h-1 bg-gradient-to-r ${r.grad}`} />
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>{r.emoji}</span>
                  <h2 className="text-lg font-black text-white">{r.label}</h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Output</p>
                  <p className="text-2xl font-black text-white tabular-nums">{total}</p>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-3">
                {METRIC_KEYS.map((k) => {
                  const meta = METRIC_META[k];
                  const Icon = meta.icon;
                  const v = t[k] || 0;
                  return (
                    <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-2">
                      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold" style={{ color: meta.color }}>
                        <Icon className="w-3 h-3" />
                        <span className="truncate">{meta.short}</span>
                      </div>
                      <p className="text-base font-black tabular-nums text-white mt-0.5">{v}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== person card ============================== */

type JoinedPerson = BandwidthPerson & {
  role: PersonRole | null;
  niche: PersonNiche | "unassigned";
  seeded?: boolean;
};

function PersonCard({ person, allDays }: { person: JoinedPerson; allDays: string[] }) {
  const totalOutput = METRIC_KEYS.reduce((s, k) => s + (person.totals[k] || 0), 0);
  const roleColor = person.role ? ROLE_COLOR[person.role] : { text: "#a1a1aa", bg: "rgba(63,63,70,0.2)", border: "rgba(63,63,70,0.4)" };
  const nicheEmoji = NICHE_EMOJI[person.niche];
  const nicheLabel = NICHE_LABEL[person.niche];
  const idle = totalOutput === 0;

  return (
    <div className={`rounded-2xl border bg-zinc-900/60 overflow-hidden ${idle ? "border-zinc-800/80 opacity-80" : "border-zinc-800"}`}>
      {/* header */}
      <div className="px-4 py-3 flex items-start justify-between gap-2 border-b border-zinc-800/80">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl" aria-hidden>{nicheEmoji}</span>
            <p className="text-base font-black text-white truncate">{person.name}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className="text-[9px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border"
              style={{ color: roleColor.text, background: roleColor.bg, borderColor: roleColor.border }}
            >
              {person.role ? ROLE_LABEL[person.role] : "Unassigned"}
            </span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{nicheLabel}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Total</p>
          <p className={`text-2xl font-black tabular-nums ${idle ? "text-zinc-600" : "text-white"}`}>{totalOutput}</p>
        </div>
      </div>

      {/* metric cells */}
      <div className="p-3 grid grid-cols-5 gap-2">
        {METRIC_KEYS.map((k) => {
          const meta = METRIC_META[k];
          const Icon = meta.icon;
          const v = person.totals[k] || 0;
          return (
            <div key={k} className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-2 text-center">
              <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: meta.color }} />
              <p className="text-[8.5px] uppercase tracking-wider text-zinc-500 font-semibold truncate">{meta.short}</p>
              <p className={`text-base font-black tabular-nums ${v === 0 ? "text-zinc-600" : "text-white"}`}>{v}</p>
            </div>
          );
        })}
      </div>

      {/* daily sparkline */}
      <div className="px-3 pb-3">
        <DailyBars person={person} allDays={allDays} />
      </div>

      {idle && (
        <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Sparkles className="w-3 h-3" /> Nothing shipped in window
        </div>
      )}
    </div>
  );
}

/* ============================== daily bars ============================== */

function DailyBars({ person, allDays }: { person: JoinedPerson; allDays: string[] }) {
  const daily = person.daily.length ? person.daily : allDays.map((d) => ({ date: d, comp_found: 0, og_created: 0, base_edits: 0, pintu_sets: 0, posted: 0 }));
  const max = Math.max(1, ...daily.map((d) => METRIC_KEYS.reduce((s, k) => s + (d as any)[k], 0)));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-end gap-0.5 h-12">
        {daily.map((d) => {
          const total = METRIC_KEYS.reduce((s, k) => s + (d as any)[k], 0);
          const isToday = d.date === today;
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end min-w-0"
              title={`${shortDate(d.date)} · ${total} item${total === 1 ? "" : "s"}`}
            >
              <div
                className={`w-full rounded-sm transition-all ${total === 0 ? "bg-zinc-800/50" : ""}`}
                style={{
                  height: total === 0 ? 2 : `${Math.max(4, (total / max) * 48)}px`,
                  background:
                    total === 0
                      ? undefined
                      : `linear-gradient(to top, ${stackedGradient(d as any)})`,
                  outline: isToday ? "1px solid rgba(124,58,237,0.5)" : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600 mt-1 tabular-nums">
        <span>{weekdayLabel(daily[0]?.date || allDays[0] || today)}</span>
        <span>{weekdayLabel(daily[daily.length - 1]?.date || allDays[allDays.length - 1] || today)}</span>
      </div>
    </div>
  );
}

function stackedGradient(day: Record<MetricKey, number>): string {
  // Build a simple vertical stack by just using the dominant-metric color.
  // Keeps the bar readable at tiny widths without rendering 5 rects per day.
  let maxK: MetricKey = "comp_found";
  let maxV = 0;
  for (const k of METRIC_KEYS) {
    const v = day[k] || 0;
    if (v > maxV) {
      maxV = v;
      maxK = k;
    }
  }
  return `${METRIC_META[maxK].color}, ${METRIC_META[maxK].color}`;
}
