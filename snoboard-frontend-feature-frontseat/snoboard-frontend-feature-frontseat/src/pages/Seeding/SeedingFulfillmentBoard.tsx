import { useCallback, useEffect, useMemo, useState } from "react";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { FulfillmentDealCard } from "@/components/seeding/FulfillmentDealCard";
import { api } from "@/services/seeding/client";
import type { SeedingDealDetail } from "@/services/seeding/mockData";

export default function SeedingFulfillmentBoard() {
  const [rows, setRows] = useState<SeedingDealDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.get<SeedingDealDetail[]>("/deals");
    setRows(
      (data || []).filter(
        (d) =>
          d.admin_review_status === "Approved" &&
          d.deal_status &&
          !["Completed", "Cancelled"].includes(d.deal_status),
      ) as SeedingDealDetail[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.brand_name || "").localeCompare(b.brand_name || "")),
    [rows],
  );

  return (
    <FramerPage>
      <PageHeader
        eyebrow="SEEDING · FULFILLMENT"
        title="Fulfillment Board"
        lead="All approved deals, ready to execute — click a card to open the full brief."
      />

      {loading ? (
        <p className="seeding-muted" style={{ marginTop: 24 }}>Loading…</p>
      ) : !sorted.length ? (
        <p className="seeding-muted" style={{ marginTop: 24 }}>No deals in fulfillment right now.</p>
      ) : (
        <div className="seeding-fulfillment-grid">
          {sorted.map((d) => (
            <FulfillmentDealCard key={d.deal_id} deal={d} />
          ))}
        </div>
      )}
    </FramerPage>
  );
}
