import React, { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useWorkspace, useAccess } from "../domain/store";
import { PageHeader } from "../components/common/PageHeader";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { growthRows, fmtCompact, monthLabel } from "../domain/toolSelectors";
import { cn } from "../lib/utils";

const SERIES = {
  views: { label: "Total views", color: "#1C1917" },
  reels: { label: "Reels", color: "#7C3AED" },
  posts: { label: "Posts", color: "#059669" },
  followers: { label: "Followers gained", color: "#C2410C" },
};

const STAGES = [
  { stage: 3, label: "Stage 3 — Main IPs", dot: "bg-emerald-500", followers: true },
  { stage: 2, label: "Stage 2", dot: "bg-amber-500" },
  { stage: 1, label: "Stage 1", dot: "bg-blue-500" },
];

export default function Growth() {
  const { db } = useWorkspace();
  const [ipFilter, setIpFilter] = useState("all");
  const [drillMonth, setDrillMonth] = useState(null);

  const allRows = useMemo(() => growthRows(db), [db]);
  const rows = useMemo(() => (ipFilter === "all" ? allRows : allRows.filter((r) => r.ipId === ipFilter)), [allRows, ipFilter]);
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort(), [rows]);

  const chartData = months.map((m) => {
    const rs = rows.filter((r) => r.month === m);
    return {
      month: m,
      name: monthLabel(m, { month: "short", year: "2-digit" }),
      views: rs.reduce((s, r) => s + r.views, 0),
      reels: rs.reduce((s, r) => s + r.reelViews, 0),
      posts: rs.reduce((s, r) => s + r.postViews, 0),
      followers: rs.reduce((s, r) => s + r.followersGained, 0),
    };
  });
  const grandTotal = rows.reduce((s, r) => s + r.views, 0);

  return (
    <div className="p-6" data-testid="growth-page">
      <PageHeader title="Growth" icon={Icons.TrendingUp} subtitle="Monthly views by IP and stage. Views come straight from 6-Day Tracker cycle sums; reel/post split uses the logged Reel % and Post %.">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-mono">All-time total</p>
          <p className="font-serif text-2xl text-stone-900 tabular-nums" data-testid="growth-total">{fmtCompact(grandTotal)}</p>
        </div>
        <Select value={ipFilter} onValueChange={(v) => { setIpFilter(v); setDrillMonth(null); }}>
          <SelectTrigger className="w-52 bg-white" data-testid="growth-ip-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All IPs</SelectItem>
            {db.ips.map((ip) => <SelectItem key={ip.id} value={ip.id}>{ip.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {months.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white py-16 text-center">
          <p className="text-stone-600">No growth data yet.</p>
          <p className="mt-1 text-sm text-stone-400">Log cycle views in the 6-Day Tracker to see growth trends here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-[#E6E1D8] bg-white p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">Monthly views · reels · posts · followers gained</h2>
            <p className="mb-3 mt-0.5 text-xs text-stone-400">Click a month to see the IP-wise breakdown.</p>
            <div className="h-[360px]" data-testid="growth-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
                  onClick={(e) => {
                    const idx = e?.activeTooltipIndex ?? e?.activeIndex;
                    const m = e?.activePayload?.[0]?.payload?.month ?? chartData[Number(idx)]?.month;
                    if (m) setDrillMonth(m);
                  }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#78716C", fontSize: 12 }} axisLine={{ stroke: "#D6D3D1" }} tickLine={false} />
                  <YAxis yAxisId="views" tick={{ fill: "#78716C", fontSize: 12 }} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={52} />
                  <YAxis yAxisId="followers" orientation="right" tick={{ fill: SERIES.followers.color, fontSize: 12 }} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E7E5E4", fontSize: 12 }}
                    formatter={(v, k) => [Number(v).toLocaleString(), SERIES[k]?.label || k]} />
                  <Legend formatter={(k) => SERIES[k]?.label || k} wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="views" type="monotone" dataKey="views" stroke={SERIES.views.color} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, cursor: "pointer" }} />
                  <Line yAxisId="views" type="monotone" dataKey="reels" stroke={SERIES.reels.color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                  <Line yAxisId="views" type="monotone" dataKey="posts" stroke={SERIES.posts.color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                  <Line yAxisId="followers" type="monotone" dataKey="followers" stroke={SERIES.followers.color} strokeWidth={2} strokeDasharray="2 3" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {drillMonth && <DrillDown month={drillMonth} rows={rows} onClose={() => setDrillMonth(null)} />}

          {[...months].reverse().map((m) => (
            <MonthSection key={m} month={m} rows={rows.filter((r) => r.month === m)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DrillDown({ month, rows, onClose }) {
  const data = rows.filter((r) => r.month === month).sort((a, b) => b.views - a.views).map((r) => ({ name: r.ip.name, views: r.views, color: r.ip.hex }));
  return (
    <div className="rounded-lg border border-[#E6E1D8] bg-white p-5" data-testid="growth-drill">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">{monthLabel(month)} — IP breakdown</h2>
        <button onClick={onClose} className="text-xs text-stone-500 hover:text-stone-900">Close</button>
      </div>
      <div style={{ height: Math.max(220, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#78716C", fontSize: 11 }} tickFormatter={fmtCompact} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#44403C", fontSize: 12 }} width={150} />
            <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} views`, ""]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="views" fill="#44403C" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MonthSection({ month, rows }) {
  const [open, setOpen] = useState(true);
  const total = rows.reduce((s, r) => s + r.views, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-[#E6E1D8] bg-white" data-testid={`growth-month-${month}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 hover:bg-stone-50/70">
        <div className="flex items-center gap-3">
          {open ? <Icons.ChevronDown className="h-4 w-4 text-stone-400" /> : <Icons.ChevronRight className="h-4 w-4 text-stone-400" />}
          <h2 className="font-serif text-xl text-stone-900">{monthLabel(month)}</h2>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-xl text-stone-900 tabular-nums">{fmtCompact(total)}</span>
          <span className="text-xs text-stone-500">total views</span>
        </div>
      </button>
      {open && (
        <div className="space-y-6 border-t border-stone-100 px-5 py-5">
          {STAGES.map((s) => {
            const rs = rows.filter((r) => r.stage === s.stage).sort((a, b) => b.views - a.views);
            if (!rs.length) return null;
            return (
              <div key={s.stage}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                  <h3 className="text-sm font-semibold text-stone-900">{s.label}</h3>
                  <span className="text-xs text-stone-500">{fmtCompact(rs.reduce((a, r) => a + r.views, 0))} views</span>
                </div>
                <GrowthTable rows={rs} total={total} month={month} showFollowers={s.followers} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GrowthTable({ rows, total, month, showFollowers }) {
  const { actions } = useWorkspace();
  const { canEdit } = useAccess();
  const editable = canEdit("growth");
  const sum = rows.reduce((s, r) => s + r.views, 0);
  const pct = (v) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—");
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-[10px] uppercase tracking-wider text-stone-500 font-mono">
            <th className="w-64 px-3 py-2 text-left">IP</th>
            {showFollowers && <th className="px-3 py-2 text-right">Followers gained</th>}
            <th className="px-3 py-2 text-right">Reels</th>
            <th className="px-3 py-2 text-right">Posts</th>
            <th className="px-3 py-2 text-right">Views</th>
            <th className="w-24 px-3 py-2 text-right">% share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ipId} className="border-b border-stone-100 hover:bg-stone-50/60">
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.ip.hex }} /><span className="font-medium text-stone-900">@{r.handle}</span></span>
              </td>
              {showFollowers && (
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-600">
                  {editable ? (
                    <Input type="number" defaultValue={r.followersGained || ""} placeholder="—" data-testid={`followers-${r.ipId}-${month}`}
                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== r.followersGained) actions.setFollowersGained(month, r.ipId, v); }}
                      className="ml-auto h-7 w-28 text-right text-xs" />
                  ) : r.followersGained > 0 ? r.followersGained.toLocaleString() : "—"}
                </td>
              )}
              <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-500">{r.reelViews ? fmtCompact(r.reelViews) : "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-500">{r.postViews ? fmtCompact(r.postViews) : "—"}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-stone-900">{r.views.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-xs text-stone-500">{pct(r.views)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-stone-50 text-xs font-semibold text-stone-600">
            <td className="px-3 py-2">Total</td>
            {showFollowers && <td className="px-3 py-2 text-right font-mono tabular-nums">{rows.reduce((s, r) => s + r.followersGained, 0).toLocaleString()}</td>}
            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCompact(rows.reduce((s, r) => s + r.reelViews, 0))}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCompact(rows.reduce((s, r) => s + r.postViews, 0))}</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">{sum.toLocaleString()}</td>
            <td className="px-3 py-2 text-right">{pct(sum)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
