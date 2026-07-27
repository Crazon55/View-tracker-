import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/seeding/client";
import {
  ADMIN_REVIEW_STATUSES,
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  formatCurrency,
  formatDate,
} from "@/services/seeding/constants";
import type { SeedingDeal } from "@/services/seeding/mockData";

type Props = {
  rows: SeedingDeal[];
  onUpdate: (deal: SeedingDeal) => void;
  onRemove?: (dealId: string) => void;
  canRemove?: boolean;
  showReview?: boolean;
  showDealStatus?: boolean;
  empty?: string;
};

/** Merge patch into the existing row so API responses that omit fields don't wipe local state. */
async function patchDeal(
  current: SeedingDeal,
  body: Record<string, unknown>,
  onUpdate: (d: SeedingDeal) => void,
) {
  const optimistic = { ...current, ...body } as SeedingDeal;
  onUpdate(optimistic);
  try {
    const { data } = await api.patch<SeedingDeal>(`/deals/${current.deal_id}`, body);
    // Body wins last so deal_status/payment_status always stick even if the API omits them.
    onUpdate({ ...current, ...(data || {}), ...body } as SeedingDeal);
  } catch (err) {
    onUpdate(current);
    toast.error("Couldn't save deal — check you're on the live API, then try again.");
    throw err;
  }
}

export function DealsCardList({ rows, onUpdate, onRemove, canRemove = false, showReview = true, showDealStatus = true, empty }: Props) {
  if (!rows.length) {
    return <p className="seeding-muted">{empty ?? "No deals."}</p>;
  }

  const removeDeal = async (d: SeedingDeal) => {
    const ok = window.confirm(`Delete “${d.brand_name}”? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/deals/${d.deal_id}`);
      onRemove?.(d.deal_id);
      toast.success(`Deleted ${d.brand_name}`);
    } catch {
      toast.error("Couldn't delete brief.");
    }
  };

  return (
    <div className="seeding-deals-stack">
      {rows.map((d) => (
        <article key={d.deal_id} className="seeding-card seeding-deal-card">
          <div className="seeding-deal-card-head">
            <div className="seeding-deal-card-brand">
              <Link to={`/seeding/deals/${d.deal_id}`} className="seeding-brand-link">
                <span className="seeding-brand-name">{d.brand_name}</span>
                <span className="seeding-brand-sub">{d.agency_or_client_name}</span>
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="seeding-deal-card-team">{d.submitted_by_team?.team_name ?? "—"}</div>
              {canRemove ? (
                <button
                  type="button"
                  title="Delete brief"
                  aria-label={`Delete ${d.brand_name}`}
                  onClick={() => removeDeal(d)}
                  style={{
                    padding: 6,
                    borderRadius: 7,
                    border: "1px solid var(--f-line)",
                    background: "transparent",
                    color: "var(--f-dim)",
                    cursor: "pointer",
                    display: "inline-flex",
                  }}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="seeding-deal-card-fields">
            {showReview ? (
              <label className="seeding-deal-field">
                <span className="seeding-deal-field-label">Review</span>
                <select
                  className="seeding-inline-select"
                  value={d.admin_review_status}
                  onChange={(e) => patchDeal(d, { admin_review_status: e.target.value }, onUpdate)}
                >
                  {ADMIN_REVIEW_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {showDealStatus ? (
              <label className="seeding-deal-field">
                <span className="seeding-deal-field-label">Deal status</span>
                <select
                  className="seeding-inline-select"
                  value={d.deal_status ?? ""}
                  onChange={(e) => patchDeal(d, { deal_status: e.target.value || null }, onUpdate)}
                >
                  <option value="">—</option>
                  {DEAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="seeding-deal-field">
              <span className="seeding-deal-field-label">Go-live</span>
              <span className="seeding-deal-field-static mono">{formatDate(d.go_live_date_time)}</span>
            </div>

            <label className="seeding-deal-field">
              <span className="seeding-deal-field-label">Payment</span>
              <select
                className="seeding-inline-select"
                value={d.payment_status ?? "Not Raised"}
                onChange={(e) => patchDeal(d, { payment_status: e.target.value }, onUpdate)}
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className="seeding-deal-field seeding-deal-field--price">
              <span className="seeding-deal-field-label">Price</span>
              <input
                type="number"
                className="seeding-inline-input"
                defaultValue={d.price_closed_at}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v === d.price_closed_at) return;
                  patchDeal(d, { price_closed_at: v }, onUpdate);
                }}
              />
              <span className="seeding-price-hint">{formatCurrency(d.price_closed_at)}</span>
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}
