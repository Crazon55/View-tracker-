import { Link } from "react-router-dom";
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
  showReview?: boolean;
  showDealStatus?: boolean;
  empty?: string;
};

const selectCls = "seeding-inline-select";
const inputCls = "seeding-inline-input";

async function patchDeal(
  current: SeedingDeal,
  body: Record<string, unknown>,
  onUpdate: (d: SeedingDeal) => void,
) {
  const optimistic = { ...current, ...body } as SeedingDeal;
  onUpdate(optimistic);
  try {
    const { data } = await api.patch<SeedingDeal>(`/deals/${current.deal_id}`, body);
    onUpdate({ ...current, ...(data || {}), ...body } as SeedingDeal);
  } catch (err) {
    onUpdate(current);
    throw err;
  }
}

export function DealsInlineTable({ rows, onUpdate, showReview = true, showDealStatus = true, empty }: Props) {
  return (
    <div className="seeding-table-wrap">
      <table className="seeding-table">
        <thead>
          <tr>
            <th>BRAND</th>
            <th>TEAM</th>
            {showReview ? <th>REVIEW</th> : null}
            {showDealStatus ? <th>DEAL STATUS</th> : null}
            <th>GO-LIVE</th>
            <th>PAYMENT</th>
            <th>PRICE</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={7} className="seeding-table-empty">{empty ?? "No deals."}</td>
            </tr>
          ) : (
            rows.map((d) => (
              <tr key={d.deal_id}>
                <td>
                  <Link to={`/seeding/deals/${d.deal_id}`} className="seeding-brand-link">
                    <span className="seeding-brand-name">{d.brand_name}</span>
                    <span className="seeding-brand-sub">{d.agency_or_client_name}</span>
                  </Link>
                </td>
                <td className="seeding-table-muted">{d.submitted_by_team?.team_name ?? "—"}</td>
                {showReview ? (
                  <td>
                    <select
                      className={selectCls}
                      value={d.admin_review_status}
                      onChange={(e) => patchDeal(d, { admin_review_status: e.target.value }, onUpdate)}
                    >
                      {ADMIN_REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                ) : null}
                {showDealStatus ? (
                  <td>
                    <select
                      className={selectCls}
                      value={d.deal_status ?? ""}
                      onChange={(e) => patchDeal(d, { deal_status: e.target.value || null }, onUpdate)}
                    >
                      <option value="">—</option>
                      {DEAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                ) : null}
                <td className="seeding-table-muted mono">{formatDate(d.go_live_date_time)}</td>
                <td>
                  <select
                    className={selectCls}
                    value={d.payment_status ?? "Not Raised"}
                    onChange={(e) => patchDeal(d, { payment_status: e.target.value }, onUpdate)}
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className={inputCls}
                    defaultValue={d.price_closed_at}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v === d.price_closed_at) return;
                      patchDeal(d, { price_closed_at: v }, onUpdate);
                    }}
                  />
                  <span className="seeding-price-hint">{formatCurrency(d.price_closed_at)}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
