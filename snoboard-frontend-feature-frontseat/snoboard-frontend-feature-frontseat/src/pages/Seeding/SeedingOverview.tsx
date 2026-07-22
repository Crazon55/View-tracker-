// Seeding · Overview — faithful port of FS-Seeding AdminOverview.jsx, reskinned to Framer.
// Same data (api /reports/overview + /deals), same sections. Links retargeted to /seeding/*.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Eye, Ban, Wallet, Plus, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/services/seeding/client";
import { formatCurrency, formatDate } from "@/services/seeding/constants";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { FramerPage, PageHeader, DataTable } from "@/components/framer/Framer";
import { Reveal } from "@/components/framer/Reveal";
import { useAreaAccess } from "@/hooks/useAreaAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */
const formatChartDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

function RevenueChart({ data }: { data: any[] }) {
  if (!data?.length || !data.some((d) => d.revenue > 0))
    return <div style={{ fontSize: 12, color: "var(--f-faint)", padding: "48px 0", textAlign: "center" }}>No approved revenue in this range.</div>;
  return (
    <div style={{ height: 224, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip contentStyle={{ background: "#0a0a0d", border: "1px solid var(--f-line)", borderRadius: 8, fontSize: 12 }} labelFormatter={formatChartDate} formatter={(value: any, name: any) => [name === "revenue" ? formatCurrency(value) : value, name === "revenue" ? "Revenue" : "Deals"]} />
          <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "var(--accent-2)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, accent }: any) => (
  <div className="fglass-panel fglass-purple-shadow f-stat">
    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid var(--f-line)", display: "grid", placeItems: "center", marginBottom: 12 }}>
      <Icon size={16} strokeWidth={1.75} className={accent} style={!accent ? { color: "var(--f-dim)" } : undefined} />
    </div>
    <div className="f-num" style={{ fontSize: 24 }}>{value}</div>
    <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>{label}</div>
  </div>
);

const Panel = ({ children }: any) => (
  <div className="fglass-panel fglass-purple-shadow" style={{ padding: "20px 22px" }}>{children}</div>
);
const PanelHead = ({ title, link, linkLabel }: any) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
    <h2 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h2>
    {link && <Link to={link} style={{ fontSize: 12, color: "var(--f-dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>{linkLabel} <ArrowUpRight size={12} /></Link>}
  </div>
);

export default function SeedingOverview() {
  const { canViewArea } = useAreaAccess();
  const canSeeApprovals = canViewArea("seeding_approvals");
  const [data, setData] = useState<any>(null);
  const [pendingBriefs, setPendingBriefs] = useState<any[]>([]);
  const [activeDeals, setActiveDeals] = useState<any[]>([]);
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    };
  });

  const load = async () => {
    const params = { from_date: range.from, to_date: range.to + "T23:59:59" };
    const [{ data: rep }, { data: pend }, { data: active }] = await Promise.all([
      api.get<any>("/reports/overview", { params }),
      api.get<any[]>("/deals", { params: { admin_review_status: "Submitted" } }),
      api.get<any[]>("/deals", { params: { admin_review_status: "Approved" } }),
    ]);
    setData(rep);
    setPendingBriefs((pend || []).slice(0, 5));
    setActiveDeals((active || []).filter((d) => d.deal_status !== "Completed").slice(0, 6));
  };

  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line */ }, [range.from, range.to]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) load().catch(() => {}); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
    /* eslint-disable-next-line */
  }, [range.from, range.to]);

  if (!data) return <FramerPage><PageHeader eyebrow="SEEDING · BRAND-DEAL OPS" title="Overview" lead="Loading…" /></FramerPage>;

  const inputCls = "seeding-date";
  return (
    <FramerPage>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <PageHeader eyebrow="SEEDING · BRAND-DEAL OPS" title="Overview" lead="Revenue, approvals, fulfilment and payments — at a glance." />
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={inputCls}
            style={{ background: "#0e0e14", border: "1px solid var(--f-line)", borderRadius: 8, padding: "8px 10px", color: "var(--f-ink)", colorScheme: "dark" }} />
          <span style={{ color: "var(--f-faint)" }}>→</span>
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={inputCls}
            style={{ background: "#0e0e14", border: "1px solid var(--f-line)", borderRadius: 8, padding: "8px 10px", color: "var(--f-ink)", colorScheme: "dark" }} />
          <Link to="/seeding/submit" style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#000", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600 }}>
            <Plus size={13} strokeWidth={2.25} /> Create Brief
          </Link>
        </div>
      </div>

      {/* 8 stat cards — staggered render-in */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 26 }} className="seeding-stats">
        {[
          <StatCard key="rc" icon={TrendingUp} label="Revenue closed" value={formatCurrency(data.revenue_closed)} accent="text-emerald-400" />,
          <StatCard key="da" icon={CheckCircle2} label="Deals approved" value={data.deals_approved} />,
          <StatCard key="bp" icon={Clock} label="Briefs pending approval" value={data.deals_submitted_pending} accent="text-amber-400" />,
          <StatCard key="pp" icon={Wallet} label="Payments pending" value={data.payment_pending_count} accent="text-amber-400" />,
          <StatCard key="dc" icon={CheckCircle2} label="Deals completed" value={data.deals_completed} />,
          <StatCard key="tv" icon={Eye} label="Total views" value={Number(data.total_views).toLocaleString("en-IN")} />,
          <StatCard key="bd" icon={Ban} label="Blocked deliverables" value={data.blocked_deliverables} accent="text-rose-400" />,
          <StatCard key="ni" icon={AlertCircle} label="Needs more info" value={data.deals_needs_info} accent="text-amber-400" />,
        ].map((card, i) => (
          <Reveal key={i} delay={i * 0.05} y={20}>{card}</Reveal>
        ))}
      </section>

      <Reveal style={{ marginTop: 16 }}><Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div><h2 style={{ fontSize: 14, fontWeight: 600 }}>Revenue over time</h2><p style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>Approved deal revenue by approval date</p></div>
          <span className="mono" style={{ fontSize: 11, color: "var(--f-dim)" }}>{formatCurrency((data.revenue_over_time || []).reduce((s: number, d: any) => s + (d.revenue || 0), 0))} in range</span>
        </div>
        <RevenueChart data={data.revenue_over_time || []} />
      </Panel></Reveal>

      <Reveal><section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16, alignItems: "stretch" }} className="seeding-teams">
        <Panel>
          <PanelHead title="Revenue by team" />
          <div style={{ display: "grid", gap: 12 }}>
            {(data.team_revenue || []).map((t: any) => {
              const max = Math.max(...data.team_revenue.map((x: any) => x.revenue), 1);
              return (
                <div key={t.team_id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "var(--f-dim)" }}>{t.team_name}</span>
                    <span className="mono" style={{ color: "var(--f-dim)" }}>{formatCurrency(t.revenue)} · {t.deals} deals</span>
                  </div>
                  <div style={{ height: 6, background: "#1c1c22", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(t.revenue / max) * 100}%`, background: "var(--accent)", borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
            {!(data.team_revenue || []).length && <div style={{ fontSize: 12, color: "var(--f-faint)" }}>No approved deals yet.</div>}
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Views by team" />
          <div style={{ display: "grid", gap: 12 }}>
            {(data.team_views || []).map((t: any) => (
              <div key={t.team_name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--f-dim)" }}>{t.team_name}</span>
                <span className="mono" style={{ color: "var(--f-dim)" }}>{Number(t.views).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section></Reveal>

      <Reveal style={{ marginTop: 16 }}>
        <Panel>
          <PanelHead title="Payments by team" link="/seeding/teamwise" linkLabel="Teamwise deals" />
          <DataTable
            rows={data.team_payments || []}
            empty="No payment data yet."
            columns={[
              { key: "team_name", label: "TEAM", render: (r: any) => <span style={{ fontWeight: 500 }}>{r.team_name}</span> },
              { key: "not_raised", label: "NOT RAISED", align: "right", render: (r: any) => formatCurrency(r.not_raised) },
              { key: "raised", label: "RAISED", align: "right", render: (r: any) => formatCurrency(r.raised) },
              { key: "pending", label: "PENDING", align: "right", render: (r: any) => formatCurrency(r.pending) },
              { key: "paid", label: "PAID", align: "right", render: (r: any) => formatCurrency(r.paid) },
              { key: "total", label: "TOTAL", align: "right", render: (r: any) => <span className="f-num">{formatCurrency(r.total)}</span> },
            ]}
          />
        </Panel>
      </Reveal>

      <Reveal><section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "stretch" }} className="seeding-lists">
        <Panel>
          <PanelHead
            title="Briefs waiting for approval"
            link={canSeeApprovals ? "/seeding/approvals" : undefined}
            linkLabel={canSeeApprovals ? "Approval queue" : undefined}
          />
          <div style={{ display: "grid", gap: 8 }}>
            {pendingBriefs.map((d) => (
              <Link key={d.deal_id} to={`/seeding/deals/${d.deal_id}`} className="fglass-card fglass-purple-shadow" style={{ display: "block", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.brand_name}</div>
                    <div style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>{d.submitted_by_team?.team_name} · {d.submitted_by_user?.name}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--f-dim)" }}>{formatCurrency(d.price_closed_at)}</div>
                </div>
              </Link>
            ))}
            {!pendingBriefs.length && <div style={{ fontSize: 12, color: "var(--f-faint)" }}>Nothing pending.</div>}
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Active deals" link="/seeding/deals" linkLabel="All deals" />
          <div style={{ display: "grid", gap: 8 }}>
            {activeDeals.map((d) => (
              <Link key={d.deal_id} to={`/seeding/deals/${d.deal_id}`} className="fglass-card fglass-purple-shadow" style={{ display: "block", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{d.brand_name}</div>
                    <div style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>{d.submitted_by_team?.team_name} · live {formatDate(d.go_live_date_time)}</div>
                  </div>
                  <StatusBadge status={d.deal_status || "Accepted"} />
                </div>
              </Link>
            ))}
            {!activeDeals.length && <div style={{ fontSize: 12, color: "var(--f-faint)" }}>No active deals.</div>}
          </div>
        </Panel>
      </section></Reveal>
    </FramerPage>
  );
}
