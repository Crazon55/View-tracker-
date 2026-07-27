// FramerHome — bento slide deck. Slides transition; scroll shows all pages.
//   1: Views this month (donut + reels/posts + top 3)  2: Growth  3: Seeding money
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, TrendingUp, Search } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { getDashboard, getSixDayMonth } from "@/services/api";
import { TEAM_ROSTERS, normTeamHandle } from "@/lib/teamRosters";
import { getOverview, fmtINR } from "@/services/seedingApi";
import { usePermissions } from "@/hooks/usePermissions";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { gates } from "@/config/appNav";
import { RingStat, RankList } from "@/components/framer/Framer";

/* eslint-disable @typescript-eslint/no-explicit-any */
const compact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(Math.round(n ?? 0));
const handleKey = (h: unknown) => String(h || "").trim().toLowerCase().replace(/^@/, "");

function Donut({ reels, posts }: { reels: number; posts: number }) {
  const total = reels + posts, size = 210, stroke = 22, r = (size - stroke) / 2;
  const C = 2 * Math.PI * r, gap = 0.02;
  const reelLen = (total ? reels / total : 0) * C * (1 - gap);
  const postLen = (total ? posts / total : 0) * C * (1 - gap);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        {total > 0 && <>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#a855f7" strokeWidth={stroke} strokeDasharray={`${reelLen} ${C}`} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22c55e" strokeWidth={stroke} strokeDasharray={`${postLen} ${C}`} strokeDashoffset={-(reelLen + C * gap)} strokeLinecap="round" />
        </>}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center" }}>
        <div className="b-lab">THIS MONTH</div>
        <div className="b-big" style={{ fontSize: 42 }}>{compact(total)}</div>
        <div style={{ fontSize: 11, color: "var(--f-dim)" }}>views</div>
      </div>
    </div>
  );
}

// Sample data — DEV-only fallback when the backend is unreachable (design preview).
// Never used while live queries are loading (that caused a flash of fake totals).
// week-wise (6-day cycle) view numbers — W1…W5
type ViewPeriod = "all" | "tracker";

type PageRow = {
  name: string;
  handle: string;
  views: number;
  reelViews: number;
  postViews: number;
  viewsLabel: string;
  monthNote?: string;
};

type TeamFilter = { id: string; label: string; handles: Set<string> };

function sixDayViews(summary: any): number {
  if (!summary) return 0;
  const cvs = Number(summary.cycle_views_sum);
  return Number.isNaN(cvs) ? 0 : cvs;
}

function PeriodFilter({
  period,
  onPeriodChange,
  trackerMonth,
  onTrackerMonthChange,
}: {
  period: ViewPeriod;
  onPeriodChange: (p: ViewPeriod) => void;
  trackerMonth: string;
  onTrackerMonthChange: (m: string) => void;
}) {
  return (
    <div className="home-ips-head-controls">
      <div className="six-day-seg home-ip-period" role="tablist" aria-label="View period">
        {([
          ["all", "All Time"],
          ["tracker", "6-day tracker"],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={period === val}
            className={period === val ? "is-on" : ""}
            onClick={() => onPeriodChange(val)}
          >
            {label}
          </button>
        ))}
      </div>
      {period === "tracker" && (
        <label className="home-ip-month">
          <span className="home-ip-month-lab">Month</span>
          <input
            type="month"
            className="fglass-input home-ip-month-input"
            value={trackerMonth}
            onChange={(e) => onTrackerMonthChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function PageIpGrid({
  pages,
  period,
  teams,
}: {
  pages: PageRow[];
  period: ViewPeriod;
  teams: TeamFilter[];
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const q = query.trim().toLowerCase();

  const activeHandles = team === "all" ? null : teams.find((t) => t.id === team)?.handles ?? null;
  const byTeam = activeHandles ? pages.filter((p) => activeHandles.has(handleKey(p.handle))) : pages;
  const filtered = q
    ? byTeam.filter((p) => p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q))
    : byTeam;

  return (
    <div className="home-ip">
      {pages.length > 0 && (
        <div className="home-ip-search-wrap">
          <Search className="home-ip-search-icon" size={16} aria-hidden />
          <input
            className="fglass-input home-ip-search"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pages"
          />
        </div>
      )}

      {teams.length > 0 && (
        <div className="six-day-seg home-ip-period home-ip-teams" role="tablist" aria-label="Filter by team">
          <button
            type="button"
            role="tab"
            aria-selected={team === "all"}
            className={team === "all" ? "is-on" : ""}
            onClick={() => setTeam("all")}
          >
            All teams
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={team === t.id}
              className={team === t.id ? "is-on" : ""}
              onClick={() => setTeam(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!pages.length ? (
        <div className="home-ip-empty">No pages yet.</div>
      ) : !filtered.length ? (
        <div className="home-ip-empty">
          {team !== "all" ? "No pages for this team." : "No pages match your search."}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={team}
            className="home-ip-grid"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {filtered.map((p) => (
              <article key={`${p.handle}-${p.name}`} className="fglass-card fglass-purple-shadow home-ip-card">
                <div className="home-ip-card-head">
                  <h3 className="home-ip-card-title">{p.name}</h3>
                </div>
                {p.handle ? (
                  <a
                    href={`https://www.instagram.com/${p.handle}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="home-ip-handle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{p.handle}
                  </a>
                ) : (
                  <span className="home-ip-handle">—</span>
                )}
                {p.monthNote ? <div className="home-ip-month-note">{p.monthNote}</div> : null}
                <div className="home-ip-label">{p.viewsLabel}</div>
                <div className="home-ip-views">{compact(p.views)}</div>
                {period === "all" ? (
                  <div className="home-ip-foot">
                    <span>{p.reelViews.toLocaleString()} reels</span>
                    <span>{p.postViews.toLocaleString()} posts</span>
                  </div>
                ) : null}
              </article>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// each page: total_views = monthly; all_time_views = all-time; cycles = week-wise 6-day views
const mkPage = (name: string, handle: string, allTime: number, monthly: number, cycles: number[]) => ({
  id: handle, name, handle, all_time_views: allTime, total_views: monthly, reel_views: Math.round(monthly * 0.62), post_views: Math.round(monthly * 0.38),
  reels_count: Math.round(monthly * 0.02), posts_count: Math.round(monthly * 0.015),
  all_time_reels_count: Math.round(allTime * 0.0002), all_time_posts_count: Math.round(allTime * 0.00015),
  cycles, six: cycles.reduce((a, b) => a + b, 0),
});
const SAMPLE = {
  reels: 116_000_000, posts: 67_900_000, // THIS MONTH (donut) ≈ 183.9M
  pages: [
    mkPage("Founders Index", "foundersindex", 92_400_000, 18_300_000, [3_100_000, 3_600_000, 3_900_000, 3_800_000, 3_800_000]),
    mkPage("Elitefoundrs", "elitefoundrs", 61_300_000, 12_600_000, [2_100_000, 2_400_000, 2_600_000, 2_700_000, 2_800_000]),
    mkPage("India Founder Brief", "indiafounderbrief", 44_100_000, 9_800_000, [1_600_000, 1_800_000, 2_000_000, 2_100_000, 2_300_000]),
    mkPage("101x Founders", "101xfounders", 38_700_000, 8_500_000, [1_400_000, 1_600_000, 1_700_000, 1_800_000, 1_900_000]),
    mkPage("Indian Founders Co", "indianfoundersco", 31_200_000, 7_000_000, [1_100_000, 1_300_000, 1_400_000, 1_500_000, 1_600_000]),
    mkPage("Biz India", "bizindia", 27_500_000, 5_100_000, [900_000, 1_000_000, 1_050_000, 1_050_000, 1_100_000]),
    mkPage("India Startup Story", "indiastartupstory", 22_800_000, 4_200_000, [720_000, 820_000, 880_000, 900_000, 980_000]),
    mkPage("Startupcoded", "startupcoded", 19_400_000, 3_600_000, [600_000, 680_000, 720_000, 780_000, 820_000]),
    mkPage("Startup by Dog", "startupbydog", 14_100_000, 2_700_000, [440_000, 500_000, 540_000, 600_000, 620_000]),
    mkPage("Founders in India", "foundersinindia", 9_600_000, 1_900_000, [300_000, 340_000, 380_000, 420_000, 460_000]),
  ],
  growth: [ // monthly total views — ALL TIME sums to ~828.9M
    { name: "Jan 26", views: 55_000_000 }, { name: "Feb 26", views: 68_000_000 }, { name: "Mar 26", views: 52_000_000 },
    { name: "Apr 26", views: 95_000_000 }, { name: "May 26", views: 155_000_000 }, { name: "Jun 26", views: 220_000_000 }, { name: "Jul 26", views: 183_900_000 },
  ],
};

export default function FramerHome() {
  const { role } = usePermissions();
  const { canSeeSeeding } = useAreaAccess();
  const roles = String(role || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Respect Users & Roles matrix (not just bd/fulfillment role names).
  const canSeeding = canSeeSeeding() || gates(roles).seeding;
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("all");
  const localYm = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const [trackerMonth, setTrackerMonth] = useState(localYm);

  const { data: stats, isPending: statsPending } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
  const { data: growth = [], isPending: growthPending } = useQuery({
    queryKey: ["growth-data"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/v1/growth`, { headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" } });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json?.data ?? []); // backend wraps as { success, data }
    },
  });
  const { data: sixDay } = useQuery({
    queryKey: ["six-day", trackerMonth],
    queryFn: () => getSixDayMonth(trackerMonth),
    enabled: viewPeriod === "tracker",
    staleTime: 5 * 60_000,
  });
  // Current-month 6-day data — the dashboard "This month" donut sources from the SAME
  // data the 6-Day Tracker renders, so the two never disagree.
  const currentYm = useMemo(() => localYm(), []);
  const { data: monthSix, isPending: monthPending } = useQuery({
    queryKey: ["six-day-current", currentYm],
    queryFn: () => getSixDayMonth(currentYm),
    staleTime: 5 * 60_000,
  });
  const monthAgg = useMemo(() => {
    let views = 0, reel = 0, post = 0;
    for (const c of ((monthSix as any)?.cycles ?? [])) {
      for (const e of (c.entries ?? [])) {
        const v = Number(e.views) || 0;
        views += v;
        const rp = e.reel_pct != null && e.reel_pct !== "" ? Number(e.reel_pct) : null;
        const pp = e.post_pct != null && e.post_pct !== "" ? Number(e.post_pct) : null;
        if (rp != null && !Number.isNaN(rp)) reel += (v * rp) / 100;
        if (pp != null && !Number.isNaN(pp)) post += (v * pp) / 100;
      }
    }
    // Split any views with no reel/post % entered, so Reels+Posts == total (matches backend rule).
    const attributed = reel + post;
    const unattr = Math.max(0, views - attributed);
    if (attributed > 0 && unattr > 0) {
      reel += unattr * (reel / attributed);
      post = views - reel;
    } else if (attributed === 0 && views > 0) {
      reel = views / 2;
      post = views - reel;
    }
    return { views, reel: Math.round(reel), post: Math.round(post) };
  }, [monthSix]);
  const { data: seeding } = useQuery({ queryKey: ["seeding-overview"], queryFn: getOverview, enabled: canSeeding });

  const viewsLoading = monthPending;
  const pagesLoading = statsPending || (viewPeriod === "all" && growthPending);
  // DEV-only: show SAMPLE when queries finished but returned nothing (offline design preview).
  const useSample = import.meta.env.DEV && !viewsLoading && !statsPending && !monthSix && !stats;

  const growthAllTimeByHandle = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of Array.isArray(growth) ? (growth as any[]) : []) {
      const h = handleKey((row as any).handle);
      if (!h || h === "total") continue;
      m.set(h, (m.get(h) ?? 0) + (Number((row as any).views) || 0));
    }
    return m;
  }, [growth]);

  const sixDayByPageId = useMemo(() => {
    const m = new Map<string, any>();
    ((sixDay as any)?.page_summaries ?? []).forEach((p: any) => {
      if (p.page_id != null) m.set(String(p.page_id), p);
    });
    return m;
  }, [sixDay]);

  const sixDayByHandle = useMemo(() => {
    const m = new Map<string, any>();
    ((sixDay as any)?.page_summaries ?? []).forEach((p: any) => m.set(handleKey(p.handle), p));
    return m;
  }, [sixDay]);

  // Prefer the 6-day tracker month total (source of truth); never paint SAMPLE while loading.
  const reels = viewsLoading
    ? 0
    : monthAgg.views > 0
      ? monthAgg.reel
      : (stats?.total_reel_views ?? (useSample ? SAMPLE.reels : 0));
  const posts = viewsLoading
    ? 0
    : monthAgg.views > 0
      ? monthAgg.post
      : (stats?.total_post_views ?? (useSample ? SAMPLE.posts : 0));
  const rawPages: any[] = stats?.pages?.length
    ? stats.pages
    : useSample
      ? SAMPLE.pages
      : [];

  const viewsLabel = viewPeriod === "tracker" ? "Month total (6-day tracker)" : "Total Views";
  const monthNote = viewPeriod === "tracker" && trackerMonth
    ? new Date(trackerMonth + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : undefined;

  const allPages = useMemo(() => {
    return [...rawPages]
      .map((p) => {
        const handle = String(p.handle || "").replace(/^@/, "");
        const h = handleKey(handle);
        let views = 0;
        let reelViews = 0;
        let postViews = 0;

        if (viewPeriod === "all") {
          if (growthAllTimeByHandle.has(h)) {
            views = growthAllTimeByHandle.get(h)!;
          } else {
            views = p.all_time_views ?? 0;
          }
          reelViews = p.all_time_reels_count ?? p.reels_count ?? p.reel_views ?? 0;
          postViews = p.all_time_posts_count ?? p.posts_count ?? p.post_views ?? 0;
        } else {
          const sd = (p.id != null ? sixDayByPageId.get(String(p.id)) : undefined) ?? sixDayByHandle.get(h);
          if (sd) {
            views = sixDayViews(sd);
          } else if (trackerMonth === currentYm && p.total_views != null) {
            views = p.total_views;
          } else {
            views = p.six ?? 0;
          }
        }

        return {
          name: p.name || handle || "—",
          handle,
          views,
          reelViews,
          postViews,
          viewsLabel,
          monthNote,
        };
      })
      .sort((a, b) => b.views - a.views);
  }, [rawPages, viewPeriod, trackerMonth, currentYm, growthAllTimeByHandle, sixDayByPageId, sixDayByHandle, viewsLabel, monthNote]);

  const topPages = allPages.slice(0, 3);

  // Team filter pills for the IP grid — from the curated rosters (src/lib/teamRosters.ts),
  // the same source the SixDay tracker trusts. Only teams that own ≥1 loaded page show.
  const teams = useMemo<TeamFilter[]>(() => {
    const known = new Set(allPages.map((p) => handleKey(p.handle)));
    return TEAM_ROSTERS
      .map((t) => ({
        id: t.id,
        label: t.label,
        handles: new Set<string>(t.handles.map((h) => normTeamHandle(h)).filter((h) => known.has(h))),
      }))
      .filter((t) => t.handles.size > 0);
  }, [allPages]);

  const allGrowth = (Array.isArray(growth) ? (growth as any[]) : []).filter((v) => v.handle !== "total");
  const months = [...new Set(allGrowth.map((v) => v.month?.slice(0, 7)))].sort() as string[];
  const realChart = months.map((m) => {
    const e = allGrowth.filter((v) => v.month?.slice(0, 7) === m);
    return { name: new Date(m + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), views: e.reduce((s, v) => s + (v.views ?? 0), 0) };
  });
  const chart = realChart.length ? realChart : (useSample ? SAMPLE.growth : []);
  const allTime = chart.reduce((s, d) => s + d.views, 0);
  const peak = chart.reduce((a, b) => (b.views > a.views ? b : a), { name: "—", views: 0 });

  const viewsSlideBody = viewsLoading ? (
    <div>
      <div className="f-eyebrow" style={{ marginBottom: 10 }}>ECOSYSTEM · THIS MONTH</div>
      <h1 className="f-h1" style={{ marginBottom: 24 }}>Views this month.</h1>
      <div className="bento">
        <div className="b b-pur b-glow col-2 row-2" style={{ display: "grid", placeContent: "center", minHeight: 220 }}>
          <div style={{ color: "var(--f-dim)", fontSize: 13 }}>Loading views…</div>
        </div>
        <div className="b b-mag"><div className="b-lab">● REELS</div><div className="b-big" style={{ fontSize: 34, marginTop: "auto", opacity: 0.35 }}>—</div></div>
        <div className="b b-grn"><div className="b-lab">● POSTS</div><div className="b-big" style={{ fontSize: 34, marginTop: "auto", opacity: 0.35 }}>—</div></div>
        <div className="b b-dark col-2" style={{ display: "grid", placeContent: "center" }}>
          <div style={{ color: "var(--f-faint)", fontSize: 13 }}>Loading top pages…</div>
        </div>
      </div>
    </div>
  ) : (
      <div>
        <div className="f-eyebrow" style={{ marginBottom: 10 }}>ECOSYSTEM · THIS MONTH</div>
        <h1 className="f-h1" style={{ marginBottom: 24 }}>Views this month.</h1>
        <div className="bento">
          <div className="b b-pur b-glow col-2 row-2" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="b-lab">ALL TIME</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--accent-2)" }}>
                {growthPending && !useSample ? "…" : compact(allTime)}
              </span>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Donut reels={reels} posts={posts} />
            </div>
          </div>
          <div className="b b-mag">
            <div className="b-lab">● REELS</div>
            <div className="b-big" style={{ fontSize: 34, marginTop: "auto" }}>{compact(reels)}</div>
          </div>
          <div className="b b-grn">
            <div className="b-lab">● POSTS</div>
            <div className="b-big" style={{ fontSize: 34, marginTop: "auto" }}>{compact(posts)}</div>
          </div>
          <div className="b b-dark col-2">
            <div className="b-lab" style={{ marginBottom: 16 }}>🏆 TOP 3 PAGES</div>
            {pagesLoading ? (
              <div style={{ color: "var(--f-faint)", fontSize: 13, margin: "auto" }}>Loading…</div>
            ) : topPages.length && topPages[0].views > 0 ? (
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18, marginTop: "auto" }}>
                {[topPages[1], topPages[0], topPages[2]].filter(Boolean).map((p) => {
                  const rank = p === topPages[0] ? 1 : p === topPages[1] ? 2 : 3;
                  const h = rank === 1 ? 74 : rank === 2 ? 50 : 36;
                  return (
                    <div key={p.name} style={{ width: 110, textAlign: "center" }}>
                      <div style={{ fontSize: 20 }}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</div>
                      <div style={{ height: h, borderRadius: "8px 8px 0 0", background: "linear-gradient(180deg,rgba(168,85,247,.5),rgba(168,85,247,.08))", marginTop: 6 }} />
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{p.name}</div>
                      <div className="b-big" style={{ fontSize: 12, color: "var(--accent-2)" }}>{compact(p.views)}</div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ color: "var(--f-faint)", fontSize: 13, margin: "auto" }}>No page views yet.</div>}
          </div>
        </div>
      </div>
  );

  const slides: { key: string; el: JSX.Element }[] = [
    { key: "views", el: viewsSlideBody },
    { key: "growth", el: (
      <div>
        <div className="f-eyebrow" style={{ marginBottom: 10 }}>COMPLETE GROWTH</div>
        <h1 className="f-h1" style={{ marginBottom: 24 }}>Overall growth.</h1>
        <div className="bento">
          <div className="b b-dark col-3 row-2" style={{ minHeight: 300 }}>
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 10, bottom: 5, left: 0 }}>
                  <defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 9 }} tickFormatter={(v: number) => compact(v)} />
                  <Tooltip contentStyle={{ background: "#0a0a0d", border: "1px solid var(--f-line)", borderRadius: 8 }} formatter={(v: number) => [compact(v) + " views", "Views"]} />
                  <Line type="monotone" dataKey="views" stroke="url(#gl)" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ margin: "auto", textAlign: "center" }}>
                <TrendingUp size={30} style={{ color: "var(--accent)", opacity: .6 }} />
                <div style={{ color: "var(--f-dim)", fontSize: 13, marginTop: 10 }}>Growth loads from your live backend.</div>
              </div>
            )}
          </div>
          <div className="b b-blu"><div className="b-lab">ALL TIME</div><div className="b-big" style={{ fontSize: 30, marginTop: "auto", color: "var(--accent-2)" }}>{compact(allTime)}</div></div>
          <div className="b b-pur"><div className="b-lab">PEAK MONTH</div><div className="b-big" style={{ fontSize: 24, marginTop: "auto" }}>{peak.name}</div><div style={{ fontSize: 12, color: "var(--f-dim)" }}>{compact(peak.views)} views</div></div>
        </div>
      </div>
    )},
    ...(canSeeding ? [{ key: "seeding", el: (
      <div>
        <div className="f-eyebrow" style={{ marginBottom: 10 }}>SEEDING · BRAND-DEAL OPS</div>
        <h1 className="f-h1" style={{ marginBottom: 24 }}>Money this month.</h1>
        <div className="bento">
          <div className="b b-pur b-glow col-2" style={{ justifyContent: "center" }}>
            <RingStat label="REVENUE CLOSED" value={fmtINR(seeding?.revenue_closed ?? 0)} sub={`${fmtINR(seeding?.collected ?? 0)} collected`} pct={seeding?.collection_pct ?? 0} />
          </div>
          <div className="b b-grn"><div className="b-lab">COLLECTED</div><div className="b-big" style={{ fontSize: 28, marginTop: "auto" }}>{fmtINR(seeding?.collected ?? 0)}</div></div>
          <div className="b b-mag"><div className="b-lab">OUTSTANDING</div><div className="b-big" style={{ fontSize: 28, marginTop: "auto" }}>{fmtINR(seeding?.outstanding ?? 0)}</div></div>
          <div className="b b-dark col-4">
            <div className="b-lab" style={{ marginBottom: 12 }}>REVENUE BY TEAM</div>
            <RankList rows={(seeding?.revenue_by_team ?? []).map((t) => ({ label: t.team, value: fmtINR(t.value) }))} />
          </div>
        </div>
      </div>
    )}] : []),
  ];

  const [i, setI] = useState(0);
  const idx = Math.min(i, slides.length - 1);
  const go = useCallback((d: number) => setI((p) => (p + d + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (i >= slides.length) setI(0);
  }, [i, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => go(1), 15000);
    return () => clearInterval(timer);
  }, [go, slides.length]);

  return (
    <div className="framer">
      <div className="f-page">
        <div className="home-deck">
          <AnimatePresence mode="wait">
            <motion.div key={slides[idx].key} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.3 }}>
              {slides[idx].el}
            </motion.div>
          </AnimatePresence>
          <div className="home-deck-nav">
            <button className="f-ghost" onClick={() => go(-1)} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid var(--f-line)", display: "grid", placeItems: "center" }}><ChevronLeft size={16} /></button>
            <div style={{ display: "flex", gap: 7 }}>
              {slides.map((s, k) => (
                <button key={s.key} onClick={() => setI(k)} aria-label={s.key} style={{ width: k === idx ? 22 : 8, height: 8, borderRadius: 999, border: "none", cursor: "pointer", background: k === idx ? "var(--accent)" : "#33333e", transition: ".2s" }} />
              ))}
            </div>
            <button className="f-ghost" onClick={() => go(1)} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid var(--f-line)", display: "grid", placeItems: "center" }}><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="home-ips-section">
          <div className="home-ips-head">
            <div>
              <div className="f-eyebrow" style={{ marginBottom: 6 }}>ALL PAGES · {allPages.length}</div>
              <h2 className="home-ips-title">ALL THE IP&apos;s</h2>
            </div>
            <PeriodFilter
              period={viewPeriod}
              onPeriodChange={setViewPeriod}
              trackerMonth={trackerMonth}
              onTrackerMonthChange={setTrackerMonth}
            />
          </div>
          <PageIpGrid pages={allPages} period={viewPeriod} teams={teams} />
        </div>
      </div>
    </div>
  );
}
