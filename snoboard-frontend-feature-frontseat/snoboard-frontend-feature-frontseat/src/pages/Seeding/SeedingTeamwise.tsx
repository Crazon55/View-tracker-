import { useCallback, useEffect, useMemo, useState } from "react";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { FilterDropdown } from "@/components/seeding/FilterDropdown";
import { DealsCardList } from "@/components/seeding/DealsCardList";
import { api } from "@/services/seeding/client";
import { PAYMENT_STATUSES, formatCurrency } from "@/services/seeding/constants";
import type { SeedingDeal } from "@/services/seeding/mockData";

const PAY_OPTS = [{ value: "", label: "All" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))];

export default function SeedingTeamwise() {
  const [rows, setRows] = useState<SeedingDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get<SeedingDeal[]>("/deals");
    setRows((data || []).filter((d) => d.admin_review_status === "Approved"));
    setLoading(false);
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const d of rows) set.add(d.submitted_by_team?.team_name || "Unassigned");
    return [...set].sort();
  }, [rows]);

  const teamOpts = useMemo(
    () => [{ value: "", label: "All teams" }, ...teams.map((t) => ({ value: t, label: t }))],
    [teams],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (teamFilter) list = list.filter((d) => (d.submitted_by_team?.team_name || "Unassigned") === teamFilter);
    if (payFilter) list = list.filter((d) => (d.payment_status ?? "Not Raised") === payFilter);
    return list;
  }, [rows, teamFilter, payFilter]);

  const stats = useMemo(() => {
    // Cancelled deals stay visible for history, but must not count toward revenue.
    const active = filtered.filter((d) => d.deal_status !== "Cancelled");
    const revenue = active.reduce((s, d) => s + (d.price_closed_at || 0), 0);
    const paid = active.filter((d) => d.payment_status === "Paid").reduce((s, d) => s + (d.price_closed_at || 0), 0);
    const pending = active.filter((d) => d.payment_status && d.payment_status !== "Paid").length;
    return { deals: active.length, revenue, paid, pending };
  }, [filtered]);

  const handleUpdate = (updated: SeedingDeal) => {
    setRows((prev) => prev.map((d) => (d.deal_id === updated.deal_id ? updated : d)));
  };

  return (
    <FramerPage>
      <PageHeader
        eyebrow="SEEDING · TEAMS"
        title="Teamwise Deals"
        lead="Approved deals by BD team — filter, track payments, edit inline."
      />

      <div className="seeding-filters-bar seeding-surface" style={{ marginTop: 24 }}>
        <FilterDropdown label="Team" options={teamOpts} value={teamFilter} onChange={setTeamFilter} />
        <FilterDropdown label="Payment" options={PAY_OPTS} value={payFilter} onChange={setPayFilter} />
      </div>

      <div className="seeding-team-stats" style={{ marginTop: 24, padding: "0 4px" }}>
        <div className="seeding-team-stat">
          <div className="f-num">{stats.deals}</div>
          <div className="seeding-muted">Deals</div>
        </div>
        <div className="seeding-team-stat">
          <div className="f-num">{formatCurrency(stats.revenue)}</div>
          <div className="seeding-muted">Revenue</div>
        </div>
        <div className="seeding-team-stat">
          <div className="f-num">{formatCurrency(stats.paid)}</div>
          <div className="seeding-muted">Collected</div>
        </div>
        <div className="seeding-team-stat">
          <div className="f-num">{stats.pending}</div>
          <div className="seeding-muted">Payments open</div>
        </div>
      </div>

      {loading ? (
        <p className="seeding-muted" style={{ marginTop: 16 }}>Loading…</p>
      ) : (
        <DealsCardList
          rows={filtered}
          onUpdate={handleUpdate}
          showReview={false}
          empty="No approved deals for this team."
        />
      )}
    </FramerPage>
  );
}
