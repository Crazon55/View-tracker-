import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import {
  ADMIN_REVIEW_STATUSES,
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  formatCurrency,
} from "@/services/seeding/constants";
import { api } from "@/services/seeding/client";
import type { SeedingDeal } from "@/services/seeding/mockData";

type Props = {
  rows: SeedingDeal[];
  empty: string;
  onUpdated?: (deal: SeedingDeal) => void;
  showApprovalActions?: boolean;
  initialEditingId?: string | null;
};

const inputCls = "fglass-input w-full rounded-lg px-3 py-2 text-sm";

function DealEditPanel({
  deal,
  onClose,
  onSaved,
  showApprovalActions,
  connected = false,
}: {
  deal: SeedingDeal;
  onClose: () => void;
  onSaved: (deal: SeedingDeal) => void;
  showApprovalActions?: boolean;
  connected?: boolean;
}) {
  const [draft, setDraft] = useState(deal);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(deal), [deal]);

  const save = async (patch: Partial<SeedingDeal>) => {
    setSaving(true);
    try {
      const { data } = await api.patch<SeedingDeal>(`/deals/${deal.deal_id}`, patch);
      if (data) {
        setDraft(data);
        onSaved(data);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveAll = () => save({
    brand_name: draft.brand_name,
    agency_or_client_name: draft.agency_or_client_name,
    price_closed_at: Number(draft.price_closed_at) || 0,
    admin_review_status: draft.admin_review_status,
    deal_status: draft.deal_status,
    payment_status: draft.payment_status,
    brief_text: draft.brief_text,
  });

  return (
    <div
      className="seeding-surface is-selected"
      style={{
        padding: "20px 22px",
        marginTop: connected ? 0 : 8,
        borderRadius: connected ? "0 0 14px 14px" : 14,
        borderTop: connected ? "1px solid rgba(255,255,255,.06)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div className="f-eyebrow">EDIT DEAL</div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{deal.brand_name}</h3>
        </div>
        <button type="button" onClick={onClose} className="f-ghost" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--f-line)", display: "grid", placeItems: "center" }} aria-label="Close editor">
          <X size={14} />
        </button>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Brand</span>
          <input className={inputCls} value={draft.brand_name} onChange={(e) => setDraft((d) => ({ ...d, brand_name: e.target.value }))} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Client / agency</span>
          <input className={inputCls} value={draft.agency_or_client_name} onChange={(e) => setDraft((d) => ({ ...d, agency_or_client_name: e.target.value }))} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Value (INR)</span>
          <input className={inputCls} type="number" value={draft.price_closed_at} onChange={(e) => setDraft((d) => ({ ...d, price_closed_at: Number(e.target.value) || 0 }))} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Review status</span>
          <select className={inputCls} value={draft.admin_review_status} onChange={(e) => setDraft((d) => ({ ...d, admin_review_status: e.target.value }))}>
            {ADMIN_REVIEW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Deal status</span>
          <select className={inputCls} value={draft.deal_status || ""} onChange={(e) => setDraft((d) => ({ ...d, deal_status: e.target.value || null }))}>
            <option value="">—</option>
            {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="f-eyebrow">Payment status</span>
          <select className={inputCls} value={draft.payment_status || "Not Raised"} onChange={(e) => setDraft((d) => ({ ...d, payment_status: e.target.value }))}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
        <span className="f-eyebrow">Brief</span>
        <textarea className={inputCls} rows={4} value={draft.brief_text || ""} onChange={(e) => setDraft((d) => ({ ...d, brief_text: e.target.value }))} />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, alignItems: "center" }}>
        <button type="button" className="f-primary" style={{ padding: "8px 14px", fontSize: 12 }} disabled={saving} onClick={saveAll}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {showApprovalActions ? (
          <>
            <button type="button" className="f-ghost" style={{ padding: "8px 12px", fontSize: 12, border: "1px solid rgba(34,197,94,.35)", color: "#7ee2a8" }} disabled={saving} onClick={() => save({ admin_review_status: "Approved" })}>
              Approve
            </button>
            <button type="button" className="f-ghost" style={{ padding: "8px 12px", fontSize: 12, border: "1px solid rgba(224,165,58,.35)", color: "#ecc06a" }} disabled={saving} onClick={() => save({ admin_review_status: "Needs More Info" })}>
              Needs info
            </button>
            <button type="button" className="f-ghost" style={{ padding: "8px 12px", fontSize: 12, border: "1px solid rgba(242,85,90,.35)", color: "#f2777c" }} disabled={saving} onClick={() => save({ admin_review_status: "Rejected" })}>
              Reject
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DealCardList({ rows, empty, onUpdated, showApprovalActions, initialEditingId = null }: Props) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(initialEditingId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [editingId]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaved = (deal: SeedingDeal) => {
    onUpdated?.(deal);
  };

  const runBulkAction = async (status: string) => {
    const ids = [...checked];
    if (!ids.length) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const { data } = await api.patch<SeedingDeal>(`/deals/${id}`, { admin_review_status: status });
        if (data) handleSaved(data);
      }
      setChecked(new Set());
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  if (!rows.length) {
    return <p style={{ fontSize: 13, color: "var(--f-faint)", padding: "8px 0" }}>{empty}</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {checked.size > 0 ? (
        <div className="seeding-approval-bar seeding-surface">
          <span className="seeding-approval-count">{checked.size} selected</span>
          {showApprovalActions ? (
            <div className="seeding-approval-actions">
              <button
                type="button"
                className="seeding-approval-btn seeding-approval-btn--ok"
                disabled={saving}
                onClick={() => runBulkAction("Approved")}
              >
                Approve
              </button>
              <button
                type="button"
                className="seeding-approval-btn seeding-approval-btn--wait"
                disabled={saving}
                onClick={() => runBulkAction("Needs More Info")}
              >
                Needs info
              </button>
              <button
                type="button"
                className="seeding-approval-btn seeding-approval-btn--no"
                disabled={saving}
                onClick={() => runBulkAction("Rejected")}
              >
                Reject
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="seeding-approval-edit"
            disabled={checked.size !== 1 || saving}
            onClick={() => {
              const id = [...checked][0];
              if (id) {
                setSelectedId(id);
                setEditingId(id);
              }
            }}
          >
            <Pencil size={12} /> Edit
          </button>
        </div>
      ) : null}

      {rows.map((d) => {
        const isSelected = selectedId === d.deal_id;
        const isChecked = checked.has(d.deal_id);
        const isEditing = editingId === d.deal_id;
        return (
          <div key={d.deal_id} style={{ display: "grid", gap: 0 }}>
            <div
              className={`seeding-card${isSelected || isEditing ? " is-selected" : ""}`}
              style={{ borderRadius: isEditing ? "14px 14px 0 0" : 14, padding: "14px 16px", cursor: "pointer" }}
              title="Open brief"
              onClick={() => navigate(`/seeding/deals/${d.deal_id}`)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(d.deal_id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 4, accentColor: "var(--accent)" }}
                  aria-label={`Select ${d.brand_name}`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{d.brand_name}</div>
                      <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>
                        {d.agency_or_client_name} · {d.submitted_by_team?.team_name || "—"}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--f-dim)", flexShrink: 0 }}>
                      {formatCurrency(d.price_closed_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
                    <StatusBadge status={d.admin_review_status} />
                    <StatusBadge status={d.deal_status || "—"} />
                    <StatusBadge status={d.payment_status || "Not Raised"} />
                    <button
                      type="button"
                      className="f-ghost"
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", fontSize: 11, borderRadius: 8, border: "1px solid var(--f-line)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(d.deal_id);
                        setEditingId(d.deal_id);
                      }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {isEditing ? (
              <div ref={editRef}>
                <DealEditPanel
                  deal={d}
                  connected
                  showApprovalActions={showApprovalActions}
                  onClose={() => setEditingId(null)}
                  onSaved={(deal) => {
                    handleSaved(deal);
                    setEditingId(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
