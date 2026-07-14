import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FramerPage, PageHeader, DataTable } from "@/components/framer/Framer";
import { FilterDropdown } from "@/components/seeding/FilterDropdown";
import { DealsCardList } from "@/components/seeding/DealsCardList";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import { ADMIN_REVIEW_STATUSES, PAYMENT_STATUSES, formatDate } from "@/services/seeding/constants";
import { usePermissions } from "@/hooks/usePermissions";
import { canonicalRole } from "@/lib/accessModel";
import type { SeedingDeal } from "@/services/seeding/mockData";

const REVIEW_OPTS = [{ value: "", label: "All" }, ...ADMIN_REVIEW_STATUSES.map((s) => ({ value: s, label: s }))];
const PAY_OPTS = [{ value: "", label: "All" }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))];

export default function SeedingAllDeals() {
  const { role } = usePermissions();
  const isFulfillment = String(role || "").split(",").map((r) => r.trim()).some((r) => canonicalRole(r) === "fulfillment");

  const [rows, setRows] = useState<SeedingDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get<SeedingDeal[]>("/deals");
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    // Fulfillment only ever works with admin-approved deals.
    if (isFulfillment) list = list.filter((d) => d.admin_review_status === "Approved");
    if (reviewFilter) list = list.filter((d) => d.admin_review_status === reviewFilter);
    if (payFilter) list = list.filter((d) => (d.payment_status ?? "Not Raised") === payFilter);
    return list;
  }, [rows, reviewFilter, payFilter, isFulfillment]);

  const handleUpdate = (updated: SeedingDeal) => {
    setRows((prev) => prev.map((d) => (d.deal_id === updated.deal_id ? updated : d)));
  };

  return (
    <FramerPage>
      <PageHeader
        eyebrow={isFulfillment ? "SEEDING · FULFILMENT" : "SEEDING · DEALS"}
        title={isFulfillment ? "All Approved Deals" : "All Deals"}
        lead={isFulfillment ? "All admin-approved deals, ready to execute." : "Each deal is its own card — filter and edit status, payment, and price inline."}
      />

      {/* Fulfillment must not see payment/price — money is need-to-know, so no filters here. */}
      {!isFulfillment && (
        <div className="seeding-filters-bar seeding-surface">
          <FilterDropdown label="Review" options={REVIEW_OPTS} value={reviewFilter} onChange={setReviewFilter} />
          <FilterDropdown label="Payment" options={PAY_OPTS} value={payFilter} onChange={setPayFilter} />
          <span className="seeding-filters-count">{filtered.length} deal{filtered.length === 1 ? "" : "s"}</span>
        </div>
      )}

      {loading ? (
        <p className="seeding-muted" style={{ marginTop: 16 }}>Loading…</p>
      ) : isFulfillment ? (
        <div className="fglass-panel fglass-purple-shadow" style={{ padding: "16px 20px 8px", marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="f-eyebrow">APPROVED DEALS</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--f-dim)" }}>{filtered.length} deal{filtered.length === 1 ? "" : "s"}</span>
          </div>
          <DataTable
            rows={filtered}
            empty="No approved deals."
            columns={[
              {
                key: "brand", label: "BRAND",
                render: (r: any) => (
                  <Link to={`/seeding/deals/${r.deal_id}?from=fulfillment`}>
                    <span style={{ fontWeight: 600, color: "var(--f-ink)" }}>{r.brand_name}</span>
                    <div style={{ fontSize: 11, color: "var(--f-faint)" }}>{r.agency_or_client_name}</div>
                  </Link>
                ),
              },
              { key: "team", label: "TEAM", render: (r: any) => r.submitted_by_team?.team_name || "—" },
              {
                key: "status", label: "STATUS",
                render: (r: any) => (
                  <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                    <StatusBadge status={r.admin_review_status} />
                    {r.deal_status ? <StatusBadge status={r.deal_status} /> : null}
                  </span>
                ),
              },
              { key: "golive", label: "GO-LIVE", align: "right", render: (r: any) => formatDate(r.go_live_date_time) },
            ]}
          />
        </div>
      ) : (
        <DealsCardList rows={filtered} onUpdate={handleUpdate} empty="No deals match these filters." />
      )}
    </FramerPage>
  );
}
