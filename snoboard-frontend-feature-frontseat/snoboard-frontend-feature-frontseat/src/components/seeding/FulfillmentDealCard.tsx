import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { formatDate } from "@/services/seeding/constants";
import type { SeedingDealDetail } from "@/services/seeding/mockData";

type Props = {
  deal: SeedingDealDetail;
  to?: string;
};

export function FulfillmentDealCard({ deal, to }: Props) {
  const href = to ?? `/seeding/deals/${deal.deal_id}?from=fulfillment`;
  const tags = deal.deliverables?.map((d) => `${d.page_name} · ${d.deliverable_type}`) ?? [];
  const count = deal.deliverables?.length ?? 0;

  return (
    <Link to={href} className="seeding-card seeding-fulfillment-card">
      <div className="seeding-fulfillment-card-top">
        <span className="seeding-fulfillment-agency">{deal.agency_or_client_name.toUpperCase()}</span>
        <StatusBadge status={deal.deal_status || "Accepted"} />
      </div>
      <h2 className="seeding-fulfillment-brand">{deal.brand_name}</h2>
      <p className="seeding-fulfillment-meta">
        {count} deliverable{count === 1 ? "" : "s"} · live {formatDate(deal.go_live_date_time)}
      </p>
      {tags.length ? (
        <div className="seeding-fulfillment-tags">
          {tags.map((tag, i) => (
            <span key={i} className="seeding-fulfillment-tag">{tag}</span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
