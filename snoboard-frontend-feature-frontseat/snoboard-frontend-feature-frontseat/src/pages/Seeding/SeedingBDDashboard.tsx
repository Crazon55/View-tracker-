// BD dashboard — a BD sees only THEIR team's briefs & deals (backend scopes
// /reports/overview + /deals to the caller's team). Revenue totals stay admin-only.
// Submit Brief + the deal list live here, so there's no separate "All Deals" page
// for BD. Framer-styled port of the original FS-Seeding BDDashboard.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, CheckCircle2, AlertCircle, Eye, Wallet, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { bdTeamNameForRole } from "@/lib/accessModel";
import { api } from "@/services/seeding/client";
import { formatCurrency, formatDate, overviewRangeParams, toStoredCalendarDate } from "@/services/seeding/constants";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { FramerPage } from "@/components/framer/Framer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const Stat = ({ icon: Icon, label, value, accent }: any) => (
  <div className="fglass-panel fglass-purple-shadow f-stat">
    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid var(--f-line)", display: "grid", placeItems: "center", marginBottom: 12 }}>
      <Icon size={16} strokeWidth={1.75} className={accent} style={!accent ? { color: "var(--f-dim)" } : undefined} />
    </div>
    <div className="f-num" style={{ fontSize: 24 }}>{value}</div>
    <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>{label}</div>
  </div>
);

const FILTERS: [string, string][] = [
  ["all", "All"], ["submitted", "Submitted"], ["needs_info", "Needs Info"],
  ["approved", "Active"], ["completed", "Completed"],
];

export default function SeedingBDDashboard() {
  const { role, user } = useAuth();
  const lockedTeamName = bdTeamNameForRole(role);
  const myEmail = user?.email?.trim().toLowerCase() || "";
  const [data, setData] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const { from_date, to_date } = overviewRangeParams();
    Promise.all([
      api.get<any>("/reports/overview", {
        params: {
          from_date,
          to_date,
          ...(lockedTeamName ? { team_name: lockedTeamName } : {}),
        },
      }),
      api.get<any[]>("/deals", { params: lockedTeamName ? { team_name: lockedTeamName } : {} }),
    ]).then(([{ data: rep }, { data: dlist }]) => {
      setData(rep);
      const rows = dlist || [];
      const teamScoped = lockedTeamName
        ? rows.filter((d) => (d.submitted_by_team?.team_name || "") === lockedTeamName)
        : rows;
      // BDs edit only briefs they submitted — list those on the dashboard.
      setDeals(myEmail
        ? teamScoped.filter((d) => (d.submitted_by_user?.email || "").trim().toLowerCase() === myEmail)
        : teamScoped);
    }).catch(() => { /* backend scopes to the caller's team */ });
  }, [lockedTeamName, myEmail]);

  const teamName = useMemo(
    () => lockedTeamName || deals[0]?.submitted_by_team?.team_name || "Your team",
    [lockedTeamName, deals],
  );

  const filtered = deals.filter((d) => {
    if (filter === "all") return true;
    if (filter === "submitted") return d.admin_review_status === "Submitted";
    if (filter === "approved") return d.admin_review_status === "Approved" && d.deal_status !== "Completed";
    if (filter === "completed") return d.deal_status === "Completed";
    if (filter === "needs_info") return d.admin_review_status === "Needs More Info";
    return true;
  });

  const submitted = data ? (data.deals_approved + data.deals_submitted_pending + data.deals_needs_info) : 0;

  return (
    <FramerPage>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="f-h1">{teamName}</h1>
          <p className="f-lead">Your submitted briefs and deals — this month.</p>
        </div>
        <Link to="/seeding/submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#000", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          <Plus size={15} strokeWidth={2.25} /> Submit New Brief
        </Link>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginTop: 26 }} className="seeding-stats">
        <Stat icon={FileText} label="Briefs submitted" value={submitted} />
        <Stat icon={CheckCircle2} label="Briefs approved" value={data?.deals_approved ?? 0} accent="text-emerald-400" />
        <Stat icon={CheckCircle2} label="Deals completed" value={data?.deals_completed ?? 0} />
        <Stat icon={AlertCircle} label="Needing more info" value={data?.deals_needs_info ?? 0} accent="text-amber-400" />
        <Stat icon={Wallet} label="Payments pending" value={data?.payment_pending_count ?? 0} accent="text-amber-400" />
        <Stat icon={Eye} label="Total views" value={Number(data?.total_views ?? 0).toLocaleString("en-IN")} />
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 26, marginBottom: 16 }}>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
              border: "1px solid " + (filter === key ? "#fff" : "var(--f-line)"),
              background: filter === key ? "#fff" : "transparent",
              color: filter === key ? "#000" : "var(--f-dim)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {filtered.map((d) => (
          <Link key={d.deal_id} to={`/seeding/deals/${d.deal_id}`} className="fglass-card fglass-purple-shadow" style={{ display: "block", borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 4 }}>{d.agency_or_client_name}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{d.brand_name}</div>
              </div>
              <StatusBadge status={d.admin_review_status === "Approved" ? (d.deal_status || "Accepted") : d.admin_review_status} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: "var(--f-faint)" }}>Price</div>
                <div className="f-num" style={{ fontSize: 14 }}>{formatCurrency(d.price_closed_at)}</div>
              </div>
              <div>
                <div style={{ color: "var(--f-faint)" }}>Go-live</div>
                <div style={{ color: "var(--f-dim)" }}>{formatDate(d.go_live_date_time)}</div>
              </div>
            </div>
            {d.needs_more_info_comment && (
              <div style={{ marginTop: 12, fontSize: 11, color: "#ecc06a", border: "1px solid rgba(224,165,58,.3)", borderRadius: 8, padding: "6px 8px" }}>
                <b>Admin:</b> {d.needs_more_info_comment}
              </div>
            )}
          </Link>
        ))}
        {!filtered.length && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "56px 0", border: "1px dashed var(--f-line)", borderRadius: 14 }}>
            <div style={{ fontSize: 14, color: "var(--f-ink)", marginBottom: 4 }}>No briefs in this view yet.</div>
            <div style={{ fontSize: 12, color: "var(--f-faint)", marginBottom: 18 }}>Briefs you submit land here and route to admin for approval.</div>
            <Link to="/seeding/submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#000", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 }}>
              <Plus size={14} strokeWidth={2.25} /> Submit your first brief
            </Link>
          </div>
        )}
      </div>
    </FramerPage>
  );
}
