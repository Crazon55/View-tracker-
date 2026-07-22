import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Trash2, User } from "lucide-react";
import { FramerPage } from "@/components/framer/Framer";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/seeding/client";
import { DELIVERABLE_TYPES } from "@/services/seeding/constants";
import { SeedingSelect } from "@/components/seeding/SeedingSelect";

type SeedingPage = { page_id: string; page_name: string; active?: boolean };

const TEAMS = [
  { id: "team_21e60310db54", name: "Snoball" },
  { id: "team_56b4ab680ceb", name: "Hooc" },
  { id: "team_460502b4ecd2", name: "OWLED Core" },
  { id: "team_99c4b4a0d63d", name: "AY" },
];

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

export default function SeedingSubmitBrief() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const defaultTeam = TEAMS[0].id;

  const [teamId, setTeamId] = useState(defaultTeam);
  const [agency, setAgency] = useState("");
  const [briefLink, setBriefLink] = useState("");
  const [briefText, setBriefText] = useState("");
  const [assetsLinks, setAssetsLinks] = useState("");
  const [rows, setRows] = useState<DeliverableRow[]>([newRow()]);
  const [pages, setPages] = useState<SeedingPage[]>([]);
  const [goLive, setGoLive] = useState("");
  const [price, setPrice] = useState("");
  const [paymentDue, setPaymentDue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const teamName = useMemo(() => TEAMS.find((t) => t.id === teamId)?.name ?? "Snoball", [teamId]);

  // Deal-eligible pages (active) from the live backend — works in mock and real mode.
  const eligiblePages = useMemo(() => pages.filter((p) => p.active !== false), [pages]);

  useEffect(() => {
    api.get<SeedingPage[]>("/pages").then(({ data }) => setPages(data || [])).catch(() => setPages([]));
  }, []);

  // Once pages load, default any empty page selection to the first eligible page.
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

    const team = TEAMS.find((t) => t.id === teamId);
    setSubmitting(true);
    try {
      const agencyName = agency.trim();
      await api.post("/deals", {
        brand_name: agencyName,
        agency_or_client_name: agencyName,
        brief_link: briefLink.trim() || undefined,
        brief_text: briefText.trim() || undefined,
        assets_links: assetsLinks.trim() || undefined,
        notes: notes.trim() || undefined,
        price_closed_at: Number(price) || 0,
        go_live_date_time: new Date(goLive).toISOString(),
        payment_due_date: `${paymentDue}T00:00:00`,
        admin_review_status: "Submitted",
        deal_status: null,
        payment_status: "Not Raised",
        submitted_by_team: team ? { team_id: team.id, team_name: team.name } : undefined,
        submitted_by_user: { user_id: user?.id || "user_local", name: displayName, email: user?.email },
        deliverable_drafts: rows.map((r) => {
          const page = pages.find((p) => p.page_id === r.page_id);
          return {
            page_id: r.page_id,
            page_name: page?.page_name || r.page_id,
            deliverable_type: r.deliverable_type,
            quantity: r.quantity,
          };
        }),
      });
      navigate("/seeding/approvals");
    } catch {
      setError("Could not submit brief. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FramerPage>
      <div className="seeding-submit-wrap">
        <header className="seeding-submit-header">
          <h1 className="seeding-submit-title">Submit Brief</h1>
          <p className="seeding-submit-lead">Fast. If your brief link is ready, this should take under 60 seconds.</p>
          <p className="seeding-submit-as">
            <User size={14} />
            Submitting as <strong>{displayName}</strong> · {teamName}
          </p>
          <p className="seeding-submit-note">This goes to Admin for approval — it does not count as revenue until approved.</p>
        </header>

        <form className="seeding-surface seeding-submit-form" onSubmit={handleSubmit}>
          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Submit for team {req}</span>
            <SeedingSelect
              value={teamId}
              onChange={setTeamId}
              options={TEAMS.map((t) => ({ value: t.id, label: t.name }))}
            />
            <span className="seeding-submit-hint">Revenue and deal visibility will count under this BD team.</span>
          </label>

          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Agency / Client name {req}</span>
            <input className={inputCls} placeholder="e.g. Wavemaker or Direct" value={agency} onChange={(e) => setAgency(e.target.value)} required />
          </label>

          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Brief link (one of brief link / text required)</span>
            <input className={inputCls} placeholder="https://…" value={briefLink} onChange={(e) => setBriefLink(e.target.value)} />
          </label>

          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Brief text</span>
            <textarea className={inputCls} rows={4} placeholder="Paste the brief or notes…" value={briefText} onChange={(e) => setBriefText(e.target.value)} />
          </label>

          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Assets / reference links (one per line)</span>
            <textarea className={inputCls} rows={3} placeholder="https://drive.google.com/…" value={assetsLinks} onChange={(e) => setAssetsLinks(e.target.value)} />
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
              <span>Go-live date / time {req}</span>
              <input type="datetime-local" className={inputCls} value={goLive} onChange={(e) => setGoLive(e.target.value)} required />
            </label>
            <label className="seeding-submit-field">
              <span>Price closed at (INR) {req}</span>
              <input className={inputCls} placeholder="e.g. 250000" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </label>
            <label className="seeding-submit-field">
              <span>Payment due date {req}</span>
              <input type="date" className={inputCls} value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} required />
            </label>
          </div>

          <label className="seeding-submit-field seeding-submit-field--full">
            <span>Notes (optional)</span>
            <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error ? <p className="seeding-submit-error">{error}</p> : null}

          <div className="seeding-submit-actions">
            <button type="submit" className="seeding-submit-btn" disabled={submitting}>
              <Check size={14} strokeWidth={2.5} />
              {submitting ? "Submitting…" : "Submit brief"}
            </button>
            <Link to="/seeding" className="seeding-submit-cancel">Cancel</Link>
          </div>
        </form>
      </div>
    </FramerPage>
  );
}
