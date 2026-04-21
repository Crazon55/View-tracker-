import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getBandwidth,
  type BandwidthPerson,
  type BandwidthMetricKey,
  type BandwidthTotals,
  type BandwidthDailyRow,
} from "@/services/api";
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
import {
  Gauge,
  Users,
  Sparkles,
  Film,
  Scissors,
  Rocket,
  Search,
  Lightbulb,
  Loader2,
  Megaphone,
  FileText,
} from "lucide-react";

/* ============================== metric meta ============================== */

type MetricCell = {
  key: BandwidthMetricKey;
  label: string;
  icon: any;
  color: string;
};

const METRIC_META: Record<BandwidthMetricKey, MetricCell> = {
  // Reel pipeline
  reel_comp:       { key: "reel_comp",       label: "Comp",      icon: Search,    color: "#7BB0FF" },
  reel_og:         { key: "reel_og",         label: "OG",        icon: Lightbulb, color: "#F0C060" },
  reel_base_edits: { key: "reel_base_edits", label: "Base edit", icon: Scissors,  color: "#B49EFF" },
  reel_pintu:      { key: "reel_pintu",      label: "Pintu",     icon: Film,      color: "#9B8FFF" },
  reel_posted:     { key: "reel_posted",     label: "Posted",    icon: Rocket,    color: "#5AE0A0" },
  // Post pipeline
  post_comp:       { key: "post_comp",       label: "Comp",      icon: Search,    color: "#7BB0FF" },
  post_og:         { key: "post_og",         label: "OG",        icon: Lightbulb, color: "#F0C060" },
  post_mm:         { key: "post_mm",         label: "MM",        icon: Megaphone, color: "#FF9E7A" },
  post_edits:      { key: "post_edits",      label: "Edits",     icon: FileText,  color: "#B49EFF" },
  post_posted:     { key: "post_posted",     label: "Posted",    icon: Rocket,    color: "#5AE0A0" },
};

// Which 5 cells a given role sees on their card.
const REEL_METRICS: BandwidthMetricKey[] = [
  "reel_comp", "reel_og", "reel_base_edits", "reel_pintu", "reel_posted",
];
const POST_METRICS: BandwidthMetricKey[] = [
  "post_comp", "post_og", "post_mm", "post_edits", "post_posted",
];

function metricsForRole(role: PersonRole | null | undefined): BandwidthMetricKey[] {
  if (role === "cw") return POST_METRICS;
  // CS / CDI / unassigned / everyone else -> reel pipeline.
  return REEL_METRICS;
}

function zeroTotals(): BandwidthTotals {
  return {
    reel_comp: 0, reel_og: 0, reel_base_edits: 0, reel_pintu: 0, reel_posted: 0,
    post_comp: 0, post_og: 0, post_mm: 0, post_edits: 0, post_posted: 0,
  };
}
function zeroDaily(date: string): BandwidthDailyRow {
  return { date, ...zeroTotals() };
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function weekdayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "narrow" });
}

/* ============================== page ============================== */

type WindowKey = "today" | "7d" | "14d" | "month" | "custom";

function daysForWindow(w: WindowKey): number {
  switch (w) {
    case "today": return 1;
    case "7d":    return 7;
    case "14d":   return 14;
    case "month": {
      // 1st of the current month through today, inclusive.
      const now = new Date();
      return now.getDate();
    }
    case "custom":
      // `days` isn't used for custom ranges — the backend receives
      // explicit start/end params — but we still need a numeric value
      // for the cache key.
      return 0;
  }
}

const WINDOW_OPTS: { key: WindowKey; label: string }[] = [
  { key: "today",  label: "Today" },
  { key: "7d",     label: "7d" },
  { key: "14d",    label: "14d" },
  { key: "month",  label: "Month" },
  { key: "custom", label: "Custom" },
];

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function isoMinusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function BandwidthTracker() {
  const [windowKey, setWindowKey] = useState<WindowKey>("14d");
  const [roleFilter, setRoleFilter] = useState<"all" | PersonRole>("all");
  const [nicheFilter, setNicheFilter] = useState<"all" | PersonNiche>("all");

  // Custom range state — initialised to the last 14 days so "Custom" feels
  // sensible the moment you click it.
  const [customEnd, setCustomEnd] = useState<string>(todayISO());
  const [customStart, setCustomStart] = useState<string>(isoMinusDays(todayISO(), 13));

  const days = daysForWindow(windowKey);
  const isCustom = windowKey === "custom";
  const effectiveStart = isCustom ? customStart : undefined;
  const effectiveEnd   = isCustom ? customEnd   : undefined;

  const { data, isLoading, isError, error } = useQuery({
    // `undefined` type -> backend returns both pipelines.
    queryKey: ["bandwidth", days, effectiveStart ?? "", effectiveEnd ?? ""],
    queryFn: () => getBandwidth(days, undefined, effectiveStart, effectiveEnd),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // Guard: if custom is picked with start > end, skip the fetch.
    enabled: !isCustom || (!!customStart && !!customEnd && customStart <= customEnd),
  });

  /* Merge backend aggregates with the PeopleSeed so every seeded person
     shows up even if they have zero activity in the window. */
  const joinedPeople = useMemo(() => {
    const byKey = new Map<
      string,
      BandwidthPerson & {
        role: PersonRole | null;
        niche: PersonNiche | "unassigned";
        seeded: boolean;
      }
    >();
    const all_days = data?.all_days || [];
    const emptyDaily = all_days.map((d) => zeroDaily(d));

    for (const p of PEOPLE_SEED) {
      byKey.set(p.name, {
        name: p.name,
        niche_guess: "unassigned",
        niche_counts: { garfields: 0, goofies: 0, unassigned: 0 },
        totals: zeroTotals(),
        daily: emptyDaily,
        role: p.role,
        niche: p.niche,
        seeded: true,
      });
    }

    for (const p of data?.people || []) {
      const seed = lookupPerson(p.name);
      const key = seed?.name ?? p.name;
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, {
          ...existing,
          ...p,
          name: seed?.name ?? p.name,
          role: seed?.role ?? existing.role,
          niche: seed?.niche ?? existing.niche,
        });
      } else {
        byKey.set(key, {
          ...p,
          role: null,
          niche: p.niche_guess as PersonNiche | "unassigned",
          seeded: false,
        });
      }
    }

    // Sort by total activity across whichever 5 metrics their role tracks.
    return Array.from(byKey.values()).sort((a, b) => {
      const ma = metricsForRole(a.role).reduce((s, k) => s + (a.totals[k] || 0), 0);
      const mb = metricsForRole(b.role).reduce((s, k) => s + (b.totals[k] || 0), 0);
      return mb - ma;
    });
  }, [data]);

  const filteredPeople = useMemo(() => {
    return joinedPeople.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (nicheFilter !== "all" && p.niche !== nicheFilter) return false;
      return true;
    });
  }, [joinedPeople, roleFilter, nicheFilter]);

  /* Group filtered people by role for the page sections. */
  const groupedByRole = useMemo(() => {
    const groups: Record<string, typeof filteredPeople> = {};
    for (const p of filteredPeople) {
      const k = p.role || "unassigned";
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }
    const roleOrder: string[] = [
      "cs", "cdi", "cw", "design", "ai_automations",
      "ops_manager", "editors", "content_creators", "unassigned",
    ];
    return roleOrder
      .filter((r) => groups[r]?.length)
      .map((r) => ({ role: r as PersonRole | "unassigned", people: groups[r] }));
  }, [filteredPeople]);

  const teamTotals = data?.team_totals || {
    garfields: zeroTotals(),
    goofies: zeroTotals(),
    unassigned: zeroTotals(),
  };

  // Custom range with start > end: show a friendly prompt instead of
  // falling through to the generic error state (the query is disabled).
  const customRangeInvalid =
    isCustom && (!customStart || !customEnd || customStart > customEnd);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        Computing bandwidth…
      </div>
    );
  }
  if (customRangeInvalid) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-amber-400 text-sm">Pick a valid custom date range.</p>
        <p className="text-zinc-500 text-xs">
          The start date must be on or before the end date.
        </p>
        <button
          onClick={() => setWindowKey("14d")}
          className="mt-2 px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700"
        >
          Back to 14d
        </button>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-16 px-6 text-center space-y-3 max-w-lg mx-auto">
        <p className="text-red-400 text-sm">Could not load bandwidth data.</p>
        <p className="text-zinc-500 text-xs break-words">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
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
                Bandwidth tracker
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
              Who's <span className="text-violet-400">shipping</span> what.
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
              Per-person output across the reel pipeline (CS, CDI) and the post pipeline (CW). Each role sees the metrics that matter to their own work. Window: {shortDate(data.window_start)} – {shortDate(data.window_end)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* window */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
              {WINDOW_OPTS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setWindowKey(w.key)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${windowKey === w.key ? "bg-violet-500 text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            {/* custom range pickers — only visible when Custom is active */}
            {isCustom && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-zinc-900 px-2 py-1 text-[11px] font-semibold">
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-violet-500"
                />
                <span className="text-zinc-500">→</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayISO()}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-[11px] focus:outline-none focus:border-violet-500"
                />
              </div>
            )}
            {/* role */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-[11px] font-bold">
              {(["all", "cs", "cdi", "cw"] as const).map((r) => (
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
          <strong className="text-zinc-500">CS / CDI</strong> see reel-pipeline metrics (Comp &middot; OG &middot; Base edit &middot; Pintu &middot; Posted).{" "}
          <strong className="text-zinc-500">CW</strong> see post-pipeline metrics (Comp &middot; OG &middot; MM &middot; Edits &middot; Posted).
          Each count is based on the idea's current stage / tag in the trackers. Historical ideas are credited to <code className="text-zinc-500">created_by</code>;
          once someone clicks a stage button (Start base edit / Proven-Batch edit / Mark posted) the real actor overrides. Edit <code className="text-zinc-500">src/lib/peopleSeed.ts</code> to fix roles or niches.
        </p>
      </div>
    </div>
  );
}

/* ============================== team totals strip ============================== */

function TeamTotalsStrip({ teamTotals }: { teamTotals: Record<string, BandwidthTotals> }) {
  const rows: { key: "garfields" | "goofies"; label: string; emoji: string; grad: string }[] = [
    { key: "garfields", label: "Garfields", emoji: "🐱", grad: "from-orange-500 via-amber-500 to-yellow-400" },
    { key: "goofies",   label: "Goofies",   emoji: "🐶", grad: "from-sky-400 via-indigo-500 to-fuchsia-500" },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => {
        const t = teamTotals[r.key] || zeroTotals();
        // Team output = sum of all pipeline metrics for that team.
        const allMetrics: BandwidthMetricKey[] = [...REEL_METRICS, ...POST_METRICS];
        const total = allMetrics.reduce((s, k) => s + (t[k] || 0), 0);
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
              <PipelineBlock title="Reel pipeline · CS + CDI" metrics={REEL_METRICS} totals={t} />
              <PipelineBlock title="Post pipeline · CW"       metrics={POST_METRICS} totals={t} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineBlock({
  title,
  metrics,
  totals,
}: {
  title: string;
  metrics: BandwidthMetricKey[];
  totals: BandwidthTotals;
}) {
  return (
    <div className="mt-3">
      <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1.5">{title}</p>
      <div className="grid grid-cols-5 gap-2">
        {metrics.map((k) => {
          const meta = METRIC_META[k];
          const Icon = meta.icon;
          const v = totals[k] || 0;
          return (
            <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-2">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold" style={{ color: meta.color }}>
                <Icon className="w-3 h-3" />
                <span className="truncate">{meta.label}</span>
              </div>
              <p className="text-base font-black tabular-nums text-white mt-0.5">{v}</p>
            </div>
          );
        })}
      </div>
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
  const metricKeys = metricsForRole(person.role);
  const totalOutput = metricKeys.reduce((s, k) => s + (person.totals[k] || 0), 0);
  const roleColor = person.role
    ? ROLE_COLOR[person.role]
    : { text: "#a1a1aa", bg: "rgba(63,63,70,0.2)", border: "rgba(63,63,70,0.4)" };
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
        {metricKeys.map((k) => {
          const meta = METRIC_META[k];
          const Icon = meta.icon;
          const v = person.totals[k] || 0;
          return (
            <div key={k} className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-2 text-center">
              <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: meta.color }} />
              <p className="text-[8.5px] uppercase tracking-wider text-zinc-500 font-semibold truncate">{meta.label}</p>
              <p className={`text-base font-black tabular-nums ${v === 0 ? "text-zinc-600" : "text-white"}`}>{v}</p>
            </div>
          );
        })}
      </div>

      {/* daily sparkline */}
      <div className="px-3 pb-3">
        <DailyBars person={person} allDays={allDays} metricKeys={metricKeys} />
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

function DailyBars({
  person,
  allDays,
  metricKeys,
}: {
  person: JoinedPerson;
  allDays: string[];
  metricKeys: BandwidthMetricKey[];
}) {
  const daily: BandwidthDailyRow[] = person.daily.length
    ? person.daily
    : allDays.map((d) => zeroDaily(d));
  const dayTotal = (row: BandwidthDailyRow) => metricKeys.reduce((s, k) => s + (row[k] || 0), 0);
  const max = Math.max(1, ...daily.map(dayTotal));
  // Use local calendar date, not UTC. `toISOString().slice(0,10)` yields
  // yesterday for anyone east of UTC after local midnight.
  const _tNow = new Date();
  const today =
    `${_tNow.getFullYear()}-${String(_tNow.getMonth() + 1).padStart(2, "0")}-${String(_tNow.getDate()).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-end gap-0.5 h-12">
        {daily.map((d) => {
          const total = dayTotal(d);
          const isToday = d.date === today;
          // Dominant metric decides the bar color.
          let domK: BandwidthMetricKey = metricKeys[0];
          let domV = 0;
          for (const k of metricKeys) {
            const v = d[k] || 0;
            if (v > domV) { domV = v; domK = k; }
          }
          const color = METRIC_META[domK].color;
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
                  background: total === 0 ? undefined : `linear-gradient(to top, ${color}, ${color})`,
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
