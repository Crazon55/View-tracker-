import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SeedingSelect } from "@/components/seeding/SeedingSelect";
import { api } from "@/services/seeding/client";
import {
  ADMIN_REVIEW_STATUSES,
  DEAL_STATUSES,
  DELIVERABLE_TYPES,
  PAYMENT_STATUSES,
} from "@/services/seeding/constants";
import type { SeedingDeal } from "@/services/seeding/mockData";

const TEAMS = [
  { id: "team_21e60310db54", name: "Snoball" },
  { id: "team_56b4ab680ceb", name: "Hooc" },
  { id: "team_460502b4ecd2", name: "OWLED Core" },
  { id: "team_99c4b4a0d63d", name: "AY" },
];

type SeedingPage = { page_id: string; page_name: string; active?: boolean };

type DeliverableRow = {
  key: string;
  page_id: string;
  deliverable_type: string;
  quantity: number;
};

const inputCls = "seeding-submit-input";
const req = <span className="seeding-req">*</span>;

function newRow(pageId = ""): DeliverableRow {
  return {
    key: `row_${Math.random().toString(36).slice(2, 9)}`,
    page_id: pageId,
    deliverable_type: "Reel",
    quantity: 1,
  };
}

type Props = {
  onCreated: (deal: SeedingDeal) => void;
  onCancel: () => void;
};

export function AdminAddBriefForm({ onCreated, onCancel }: Props) {
  const [teamId, setTeamId] = useState(TEAMS[0].id);
  const [agency, setAgency] = useState("");
  const [briefLink, setBriefLink] = useState("");
  const [briefText, setBriefText] = useState("");
  const [rows, setRows] = useState<DeliverableRow[]>([newRow()]);
  const [pages, setPages] = useState<SeedingPage[]>([]);
  const [goLive, setGoLive] = useState("");
  const [price, setPrice] = useState("");
  const [paymentDue, setPaymentDue] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewStatus, setReviewStatus] = useState("Approved");
  const [dealStatus, setDealStatus] = useState("Completed"); // "" via "__none__" sentinel in select
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dealStatusSelect = dealStatus || "__none__";

  const eligiblePages = useMemo(() => pages.filter((p) => p.active !== false), [pages]);

  useEffect(() => {
    api.get<SeedingPage[]>("/pages", { params: { only_active: true } })
      .then(({ data }) => setPages(data || []))
      .catch(() => setPages([]));
  }, []);

  useEffect(() => {
    if (!eligiblePages.length) return;
    setRows((prev) => prev.map((r) => (r.page_id ? r : { ...r, page_id: eligiblePages[0].page_id })));
  }, [eligiblePages]);

  const updateRow = (key: string, patch: Partial<DeliverableRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agency.trim()) {
      setError("Agency / client name is required.");
      return;
    }
    if (!briefLink.trim() && !briefText.trim()) {
      setError("Add a brief link or brief text.");
      return;
    }
    if (!goLive || !price || !paymentDue) {
      setError("Go-live, price, and payment due date are required.");
      return;
    }
    if (!rows.some((r) => r.page_id)) {
      setError("Add at least one page / deliverable.");
      return;
    }

    const team = TEAMS.find((t) => t.id === teamId);
    setSubmitting(true);
    try {
      const agencyName = agency.trim();
      const { data } = await api.post<SeedingDeal>("/deals", {
        brand_name: agencyName,
        agency_or_client_name: agencyName,
        brief_link: briefLink.trim() || undefined,
        brief_text: briefText.trim() || undefined,
        notes: notes.trim() || undefined,
        price_closed_at: Number(price) || 0,
        go_live_date_time: new Date(goLive).toISOString(),
        payment_due_date: `${paymentDue}T00:00:00`,
        admin_review_status: reviewStatus,
        deal_status: dealStatus || null,
        payment_status: paymentStatus,
        submitted_by_team_id: teamId,
        submitted_by_team: team ? { team_id: team.id, team_name: team.name } : undefined,
        deliverable_drafts: rows
          .filter((r) => r.page_id)
          .map((r) => {
            const page = pages.find((p) => p.page_id === r.page_id);
            return {
              page_id: r.page_id,
              page_name: page?.page_name || r.page_id,
              deliverable_type: r.deliverable_type,
              quantity: r.quantity,
            };
          }),
      });
      toast.success(`Added brief for ${agencyName}`);
      onCreated(data);
    } catch {
      setError("Could not add brief. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="seeding-surface seeding-submit-form" onSubmit={handleSubmit} style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, gridColumn: "1 / -1" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Add brief</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--f-faint)" }}>
            For past deals missing from the board — defaults to Approved / Completed / Paid.
          </p>
        </div>
        <button type="button" className="seeding-submit-cancel" onClick={onCancel} style={{ background: "none", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <X size={14} /> Cancel
        </button>
      </div>

      <label className="seeding-submit-field seeding-submit-field--full">
        <span>Team {req}</span>
        <SeedingSelect value={teamId} onChange={setTeamId} options={TEAMS.map((t) => ({ value: t.id, label: t.name }))} />
      </label>

      <label className="seeding-submit-field seeding-submit-field--full">
        <span>Agency / Client name {req}</span>
        <input className={inputCls} placeholder="e.g. WisprFlow or Wavemaker" value={agency} onChange={(e) => setAgency(e.target.value)} required />
      </label>

      <label className="seeding-submit-field seeding-submit-field--full">
        <span>Brief link</span>
        <input className={inputCls} placeholder="https://…" value={briefLink} onChange={(e) => setBriefLink(e.target.value)} />
      </label>

      <label className="seeding-submit-field seeding-submit-field--full">
        <span>Brief text</span>
        <textarea className={inputCls} rows={3} placeholder="Paste the brief or notes…" value={briefText} onChange={(e) => setBriefText(e.target.value)} />
      </label>

      <div className="seeding-submit-field seeding-submit-field--full">
        <span>Pages &amp; deliverables {req}</span>
        <div className="seeding-deliverable-rows">
          {rows.map((row) => (
            <div key={row.key} className="seeding-deliverable-row">
              <SeedingSelect
                value={row.page_id}
                onChange={(v) => updateRow(row.key, { page_id: v })}
                options={eligiblePages.map((p) => ({ value: p.page_id, label: p.page_name }))}
              />
              <SeedingSelect
                value={row.deliverable_type}
                onChange={(v) => updateRow(row.key, { deliverable_type: v })}
                options={DELIVERABLE_TYPES.map((t) => ({ value: t, label: t }))}
                className="seeding-select-trigger--compact"
              />
              <input
                type="number"
                min={1}
                className={`${inputCls} seeding-qty-input`}
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
              />
              <button type="button" className="seeding-detail-icon-btn" onClick={() => removeRow(row.key)} aria-label="Remove row">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="seeding-submit-add-row" onClick={() => setRows((prev) => [...prev, newRow(eligiblePages[0]?.page_id || "")])}>
          + Add another page/deliverable
        </button>
      </div>

      <div className="seeding-submit-row seeding-submit-row--3">
        <label className="seeding-submit-field">
          <span>Go-live {req}</span>
          <input type="datetime-local" className={inputCls} value={goLive} onChange={(e) => setGoLive(e.target.value)} required />
        </label>
        <label className="seeding-submit-field">
          <span>Price (INR) {req}</span>
          <input className={inputCls} placeholder="95000" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label className="seeding-submit-field">
          <span>Payment due {req}</span>
          <input type="date" className={inputCls} value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} required />
        </label>
      </div>

      <div className="seeding-submit-row seeding-submit-row--3">
        <label className="seeding-submit-field">
          <span>Review</span>
          <SeedingSelect value={reviewStatus} onChange={setReviewStatus} options={ADMIN_REVIEW_STATUSES.map((s) => ({ value: s, label: s }))} />
        </label>
        <label className="seeding-submit-field">
          <span>Deal status</span>
          <SeedingSelect
            value={dealStatusSelect}
            onChange={(v) => setDealStatus(v === "__none__" ? "" : v)}
            options={[{ value: "__none__", label: "—" }, ...DEAL_STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </label>
        <label className="seeding-submit-field">
          <span>Payment</span>
          <SeedingSelect value={paymentStatus} onChange={setPaymentStatus} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        </label>
      </div>

      <label className="seeding-submit-field seeding-submit-field--full">
        <span>Notes (optional)</span>
        <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error ? <p className="seeding-submit-error">{error}</p> : null}

      <div className="seeding-submit-actions">
        <button type="submit" className="seeding-submit-btn" disabled={submitting}>
          <Check size={14} strokeWidth={2.5} />
          {submitting ? "Adding…" : "Add brief"}
        </button>
      </div>
    </form>
  );
}
