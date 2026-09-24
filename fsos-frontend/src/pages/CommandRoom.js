import React from "react";
import * as Icons from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useWorkspace } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader, StatCard } from "../components/common/PageHeader";
import { IPBadge, PerfBadge, StreamBadge } from "../components/common/badges";
import { networkStatus, yesterdayCohort, sixDayCycles, bankSummary, bankStockDays, productionIssues, ipById } from "../domain/selectors";
import { fmtDate, addDays } from "../domain/dates";
import { cn } from "../lib/utils";

export default function CommandRoom() {
  const { db, today } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const net = networkStatus(db, today, streamFilter);
  const cohort = yesterdayCohort(db, streamFilter);
  const cycles = sixDayCycles(db, 6, streamFilter);
  const bank = bankSummary(db, streamFilter);
  const stockDays = bankStockDays(db, streamFilter);
  const issues = productionIssues(db, streamFilter);
  const streamLabel = streamFilter === "All" ? "BO and HPN" : streamFilter;

  const netTotals = net.reduce((a, n) => ({ reqP: a.reqP + n.req.posts, reqR: a.reqR + n.req.reels, planP: a.planP + n.plannedPosts, planR: a.planR + n.plannedReels, confP: a.confP + n.confPosts, confR: a.confR + n.confReels }), { reqP: 0, reqR: 0, planP: 0, planR: 0, confP: 0, confR: 0 });

  const chartData = cycles.map((c) => ({ name: fmtDate(c.start), mean: c.mean, inProgress: c.inProgress }));

  return (
    <div className="p-6">
      <PageHeader title="Command Room" icon={Icons.LayoutDashboard}
        subtitle={`The whole network at a glance — are we stocked, are we planned, and how did yesterday perform. Showing ${streamLabel}.`} />

      {/* top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard testid="stat-floor" label="Network daily floor" value="23P · 27R" sub="50 page-level publications" />
        <StatCard testid="stat-today-planned" label="Today planned" value={`${netTotals.planP}P · ${netTotals.planR}R`} sub={`${netTotals.confP}P · ${netTotals.confR}R confirmed · ${streamLabel}`} tone={netTotals.planP >= netTotals.reqP && netTotals.planR >= netTotals.reqR ? "good" : "warn"} />
        <StatCard testid="stat-bank" label={streamFilter === "HPN" ? "HPN bank ready" : streamFilter === "BO" ? "BO bank ready" : "Bank ready"} value={bank.readyCount} sub={`${bank.ideaCount} ideas · ${bank.unallocatedCount} unallocated`} />
        <StatCard testid="stat-inprod" label={streamFilter === "HPN" ? "In production (HPN)" : streamFilter === "BO" ? "In production (BO)" : "In production"} value={bank.inProdCount} sub="not yet ready stock" tone="warn" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* 1. Network posting status */}
        <Panel title="Today's posting status" subtitle={`IST ${today} · per format floors`} className="xl:col-span-2" icon={Icons.Radio}>
          <div className="overflow-x-auto fsos-scroll">
            <table className="w-full text-xs" data-testid="network-status-table">
              <thead>
                <tr className="text-stone-400 border-b border-stone-200">
                  <th className="text-left font-medium py-2 sticky left-0 bg-white">IP</th>
                  <th className="text-center font-medium">Req P/R</th>
                  <th className="text-center font-medium">Planned</th>
                  <th className="text-center font-medium">Confirmed</th>
                  <th className="text-center font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {net.map((n) => {
                  const remP = Math.max(0, n.req.posts - n.confPosts);
                  const remR = Math.max(0, n.req.reels - n.confReels);
                  const shortPlanned = n.plannedPosts < n.req.posts || n.plannedReels < n.req.reels;
                  return (
                    <tr key={n.ip.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="py-2 sticky left-0 bg-white"><IPBadge ip={n.ip} /></td>
                      <td className="text-center text-stone-500">{n.req.posts}P · {n.req.reels}R</td>
                      <td className={cn("text-center font-medium", shortPlanned ? "text-amber-700" : "text-stone-800")}>{n.plannedPosts}P · {n.plannedReels}R</td>
                      <td className="text-center text-stone-800">{n.confPosts}P · {n.confReels}R</td>
                      <td className="text-center">{remP + remR === 0 ? <span className="text-emerald-600">met</span> : <span className="text-stone-500">{remP}P · {remR}R</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-stone-400">Surplus reels never satisfy a Posts shortfall. Untimed future slots are not marked overdue by the clock.</p>
        </Panel>

        {/* 4. Bank health & horizon */}
        <Panel title={streamFilter === "HPN" ? "HPN bank health" : streamFilter === "BO" ? "BO bank health & horizon" : "Bank health & horizon"} icon={Icons.Package} data-testid="bank-health-panel">
          <div className="space-y-2 max-h-72 overflow-auto fsos-scroll">
            {stockDays.map((s) => (
              <div key={s.ip.id} className="flex items-center justify-between text-xs border-b border-stone-100 pb-1.5">
                <IPBadge ip={s.ip} />
                <div className="flex items-center gap-3">
                  <span className="text-stone-500">{s.readyPost}P · {s.readyReel}R ready</span>
                  <span className={cn("font-mono", s.daysReel === "not_configured" ? "text-stone-400" : "text-stone-800")}>
                    {s.daysReel === "not_configured" ? "not configured" : s.daysReel === "na" ? "N/A" : `${(s.daysReel).toFixed(1)}d R`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-stone-50 border border-stone-200 p-2 text-[11px] text-stone-600">
            <div className="flex items-center gap-1 font-medium text-stone-700"><Icons.CalendarRange className="h-3.5 w-3.5" /> Calendar horizon</div>
            <p className="mt-1">Plan prepared through <b>{fmtDate(addDays(today, 9))}</b>. BO assignments ready in the bank; HPN slots intentionally await same-day stories — not production failures.</p>
            <p className="mt-1 text-stone-400">BO quotas unset → "days of stock" shown as Not configured. Configure in Settings.</p>
          </div>
        </Panel>

        {/* 2. Yesterday performance */}
        <Panel title="Yesterday's performance by page" subtitle={`Publication cohort — ${fmtDate(addDays(today, -1))}`} className="xl:col-span-2" icon={Icons.TrendingUp} data-testid="yesterday-panel">
          {!cohort.length && <p className="text-xs text-stone-400 py-6 text-center">No publications in yesterday's cohort.</p>}
          <div className="space-y-1.5 max-h-72 overflow-auto fsos-scroll">
            {cohort.map((c) => (
              <button key={c.pub.id} onClick={() => c.idea && openIdea(c.idea.id)} className="w-full flex items-center gap-3 text-left rounded-md border border-stone-100 p-2 hover:border-stone-300 transition-colors">
                <IPBadge ip={c.ip} />
                {c.idea && <StreamBadge stream={c.idea.stream} />}
                <span className="flex-1 truncate text-xs text-stone-700">{c.idea?.title}</span>
                {c.notDue ? <span className="text-[10px] text-stone-400">not yet due</span> : <span className="text-sm font-semibold text-stone-900">{c.views == null ? "—" : c.views.toLocaleString()}</span>}
                {c.ageHours > 0 && c.ageHours !== 24 && <span className="text-[10px] text-amber-600">{c.ageHours}h</span>}
                <PerfBadge tier={c.tier} />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-stone-400">Absent views are flagged, never treated as bad content. Collaborations count per participating IP.</p>
        </Panel>

        {/* 3. Six-day cycles */}
        <Panel title="Published through FSOS · six-day cohorts" subtitle="Mean captured ~24h views — not the 6-Day Tracker" icon={Icons.BarChart3} data-testid="cycles-panel">
          {!chartData.some((d) => d.mean > 0) ? (
            <div className="rounded-md border border-dashed border-stone-200 px-4 py-6 text-center">
              <p className="text-[11px] text-stone-500">Nothing published through FSOS yet.</p>
              <p className="mt-1 text-[10px] text-stone-400">
                This fills in once ideas are placed on the calendar, confirmed live, and their
                24-hour views captured. It counts FSOS publications only — the imported history
                lives in the 6-Day Tracker.
              </p>
            </div>
          ) : (
          <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8C857B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8C857B" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [v.toLocaleString(), "mean views"]} />
                <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.inProgress ? "#D1CBBF" : "#1D4ED8"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-[11px]">
            {cycles.map((c) => (
              <div key={c.start} className="flex items-center justify-between border-b border-stone-100 pb-1">
                <span className="text-stone-600">{fmtDate(c.start)}–{fmtDate(c.end)} {c.inProgress && <span className="text-amber-600">(in progress)</span>}</span>
                <span className="text-stone-500">{c.measured}/{c.pubs} measured · μ {c.mean.toLocaleString()}</span>
              </div>
            ))}
          </div>
          </>
          )}
        </Panel>
      </div>

      {/* secondary production visibility */}
      <div className="mt-4">
        <Panel title="Production visibility (secondary)" icon={Icons.Clapperboard} subtitle="Factual work awaiting assignment / review or past deadline — not speculative bottlenecks">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <IssueBox label="Approved & unassigned" items={issues.unassigned} openIdea={openIdea} icon={Icons.UserPlus} />
            <IssueBox label="Overdue deadlines" items={issues.overdue} openIdea={openIdea} icon={Icons.AlarmClock} />
            <div className="rounded-md border border-stone-200 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1.5"><Icons.Eye className="h-3.5 w-3.5" /> Submitted, awaiting review</div>
              <div className="font-serif text-2xl text-stone-900">{issues.awaitingReview.length}</div>
              <div className="text-[11px] text-stone-400">versions</div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function IssueBox({ label, items, openIdea, icon: Icon }) {
  return (
    <div className="rounded-md border border-stone-200 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1.5"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="font-serif text-2xl text-stone-900">{items.length}</div>
      <div className="mt-1 space-y-0.5 max-h-24 overflow-auto fsos-scroll">
        {items.slice(0, 4).map((i) => <button key={i.id} onClick={() => openIdea(i.id)} className="block text-left text-[11px] text-stone-500 hover:text-stone-900 truncate w-full">· {i.title}</button>)}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children, className, ...rest }) {
  return (
    <section className={cn("rounded-lg border border-[#E6E1D8] bg-white p-4", className)} {...rest}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-stone-500" />}
        <div>
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-stone-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
