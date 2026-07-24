import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, Image, Link2, Paperclip, Send, Trash2 } from "lucide-react";
import { FramerPage } from "@/components/framer/Framer";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import {
  DEAL_STATUSES,
  DELIVERABLE_STATUSES,
  DELIVERABLE_TYPES,
  OUTPUT_TYPES,
  OUTPUT_STATUSES,
  PAYMENT_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  toDateInputValue,
} from "@/services/seeding/constants";
import type { SeedingDealDetail, SeedingDeliverable } from "@/services/seeding/mockData";

const inputCls = "fglass-input w-full rounded-lg px-3 py-2 text-sm";

/** Live GET /deals/:id returns { deal, deliverables, fulfillment_outputs, payment, … }.
 * Mock may still return a flat deal. Normalize both into one SeedingDealDetail. */
function normalizeDealDetail(raw: unknown): SeedingDealDetail {
  const body = (raw ?? {}) as Record<string, any>;
  const d = (body.deal ?? body) as Record<string, any>;
  const payment = (body.payment ?? null) as Record<string, any> | null;
  const assetsRaw = d.assets_or_reference_links ?? d.assets_links;
  const assets_links = Array.isArray(assetsRaw)
    ? assetsRaw.filter(Boolean).join("\n")
    : typeof assetsRaw === "string"
      ? assetsRaw
      : "";

  return {
    ...(d as SeedingDealDetail),
    assets_links,
    deliverables: body.deliverables ?? d.deliverables ?? [],
    outputs: body.fulfillment_outputs ?? body.outputs ?? d.outputs ?? [],
    general_comments: body.client_feedback ?? d.general_comments ?? [],
    internal_notes: body.internal_notes ?? d.internal_notes ?? [],
    payment_status: payment?.status ?? d.payment_status ?? "Not Raised",
    payment_due_date: payment?.payment_due_date ?? d.payment_due_date,
    amount_received: payment?.amount_received ?? d.amount_received ?? 0,
    payment_notes: payment?.payment_notes ?? d.payment_notes ?? "",
    payment_updated_by: payment?.updated_by ?? d.payment_updated_by,
    payment_updated_at: payment?.updated_at ?? d.payment_updated_at,
  };
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="seeding-surface seeding-detail-section">
      <div className="seeding-detail-section-head">
        <h2 className="seeding-detail-section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function SeedingDealDetail() {
  const { dealId } = useParams();
  const [search] = useSearchParams();
  const from = search.get("from");
  const backTo = from === "fulfillment" ? "/seeding/fulfillment" : "/seeding/deals";
  const backLabel = from === "fulfillment" ? "Back to fulfillment" : "Back to deals";

  const [deal, setDeal] = useState<SeedingDealDetail | null>(null);
  const [draft, setDraft] = useState<SeedingDealDetail | null>(null);
  const [comment, setComment] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [pages, setPages] = useState<any[]>([]);
  const [showAddDeliv, setShowAddDeliv] = useState(false);
  const [newDeliv, setNewDeliv] = useState({ page_id: "", deliverable_type: "Reel", quantity: 1 });
  const [showAddOutput, setShowAddOutput] = useState(false);
  const [newOutput, setNewOutput] = useState({ type: "Writeup", title: "", writeup_text: "", link: "", status: "Draft", visible_to_bd: false });

  const load = useCallback(async () => {
    if (!dealId) return;
    const { data } = await api.get<unknown>(`/deals/${dealId}`);
    const detail = normalizeDealDetail(data);
    setDeal(detail);
    setDraft(detail);
  }, [dealId]);

  useEffect(() => { load().catch(() => { setDeal(null); setDraft(null); }); }, [load]);
  useEffect(() => {
    api.get<any[]>("/pages", { params: { only_active: true } }).then(({ data }) => {
      setPages(data || []);
      setNewDeliv((d) => (d.page_id ? d : { ...d, page_id: (data || [])[0]?.page_id || "" }));
    }).catch(() => {});
  }, []);

  const addDeliverables = async () => {
    if (!dealId || !newDeliv.page_id) return;
    await api.post(`/deals/${dealId}/deliverables`, {
      page_id: newDeliv.page_id,
      deliverable_type: newDeliv.deliverable_type,
      quantity: Number(newDeliv.quantity) || 1,
    });
    setShowAddDeliv(false);
    setNewDeliv({ page_id: pages[0]?.page_id || "", deliverable_type: "Reel", quantity: 1 });
    load();
  };
  const removeDeliverable = async (id: string) => {
    if (!window.confirm("Remove this deliverable?")) return;
    await api.delete(`/deliverables/${id}`);
    load();
  };
  const addOutput = async () => {
    if (!dealId || !newOutput.title.trim()) return;
    await api.post("/outputs", {
      deal_id: dealId,
      output_type: newOutput.type,
      title: newOutput.title,
      writeup_text: newOutput.writeup_text,
      link: newOutput.link,
      status: newOutput.status,
      visible_to_bd: newOutput.visible_to_bd,
    });
    setNewOutput({ type: "Writeup", title: "", writeup_text: "", link: "", status: "Draft", visible_to_bd: false });
    setShowAddOutput(false);
    load();
  };

  const save = async (patch: Partial<SeedingDealDetail>) => {
    if (!dealId) return;
    setSaving(true);
    try {
      await api.patch(`/deals/${dealId}`, patch);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const saveBrief = () => {
    if (!draft) return;
    const agencyName = draft.agency_or_client_name;
    save({
      brand_name: agencyName,
      agency_or_client_name: agencyName,
      brief_link: draft.brief_link,
      brief_text: draft.brief_text,
      assets_links: draft.assets_links,
      notes: draft.notes,
    });
  };

  const updateDeliverable = (id: string, patch: Partial<SeedingDeliverable>) => {
    if (!draft?.deliverables) return;
    setDraft({
      ...draft,
      deliverables: draft.deliverables.map((d) => (d.deliverable_id === id ? { ...d, ...patch } : d)),
    });
  };

  if (!deal || !draft) {
    return (
      <FramerPage>
        <p className="seeding-muted" style={{ marginTop: 24 }}>Loading deal…</p>
      </FramerPage>
    );
  }

  const submittedLine = [
    deal.submitted_by_user?.name,
    deal.submitted_by_team?.team_name ? `(${deal.submitted_by_team.team_name})` : null,
  ].filter(Boolean).join(" ");

  return (
    <FramerPage>
      <div className="seeding-detail-wrap">
        <Link to={backTo} className="seeding-detail-back">
          <ArrowLeft size={14} /> {backLabel}
        </Link>

        <header className="seeding-detail-header">
          <h1 className="seeding-detail-title">{deal.agency_or_client_name || deal.brand_name}</h1>
          <div className="seeding-detail-badges">
            <StatusBadge status={deal.admin_review_status} />
            {deal.deal_status ? <StatusBadge status={deal.deal_status} /> : null}
          </div>
          <div className="seeding-detail-meta">
            {submittedLine ? <span>Submitted by {submittedLine}</span> : null}
            {deal.go_live_date_time ? (
              <span className="seeding-detail-meta-date">
                <Calendar size={12} /> {formatDateTime(deal.go_live_date_time)}
              </span>
            ) : null}
          </div>
        </header>

        {deal.admin_feedback ? (
          <div className="seeding-detail-alert">
            <strong>Admin asked:</strong> {deal.admin_feedback}
          </div>
        ) : null}

        <Section title="Original brief">
          <div className="seeding-detail-form">
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Agency / Client name</span>
              <input className={inputCls} value={draft.agency_or_client_name || ""} onChange={(e) => setDraft({ ...draft, agency_or_client_name: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Brief link</span>
              <input className={inputCls} placeholder="https://…" value={draft.brief_link || ""} onChange={(e) => setDraft({ ...draft, brief_link: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Brief text</span>
              <textarea className={inputCls} rows={4} value={draft.brief_text || ""} onChange={(e) => setDraft({ ...draft, brief_text: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Assets / reference links (one per line)</span>
              <textarea className={inputCls} rows={3} value={draft.assets_links || ""} onChange={(e) => setDraft({ ...draft, assets_links: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Notes</span>
              <textarea className={inputCls} rows={3} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>
          <button type="button" className="seeding-detail-save" disabled={saving} onClick={saveBrief}>
            {saving ? "Saving…" : "Save brief"}
          </button>
        </Section>

        <Section
          title={`Deliverables (${draft.deliverables?.length ?? 0})`}
          action={
            <div className="seeding-detail-section-actions">
              <button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddDeliv((v) => !v)}>+ Add</button>
              <select
                className="seeding-inline-select"
                value={draft.deal_status || ""}
                onChange={(e) => save({ deal_status: e.target.value || null })}
              >
                {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          }
        >
          {showAddDeliv && (
            <div className="seeding-surface-nested" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12, borderRadius: 12, marginBottom: 12 }}>
              <select className="seeding-inline-select" style={{ flex: "1 1 180px" }} value={newDeliv.page_id} onChange={(e) => setNewDeliv((d) => ({ ...d, page_id: e.target.value }))}>
                {!pages.length && <option value="">No pages</option>}
                {pages.map((p) => <option key={p.page_id} value={p.page_id}>{p.page_name}</option>)}
              </select>
              <select className="seeding-inline-select" style={{ flex: "1 1 140px" }} value={newDeliv.deliverable_type} onChange={(e) => setNewDeliv((d) => ({ ...d, deliverable_type: e.target.value }))}>
                {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className={`${inputCls} seeding-views-input`} type="number" min={1} value={newDeliv.quantity} onChange={(e) => setNewDeliv((d) => ({ ...d, quantity: Number(e.target.value) || 1 }))} style={{ width: 90 }} />
              <button type="button" className="seeding-detail-save seeding-detail-save--compact" disabled={!newDeliv.page_id} onClick={addDeliverables}>Add</button>
            </div>
          )}
          <div className="seeding-deliverables-stack">
            {(draft.deliverables || []).map((del) => (
              <article key={del.deliverable_id} className="seeding-surface-nested seeding-deliverable-card">
                <div className="seeding-deliverable-head">
                  <div>
                    <h3 className="seeding-deliverable-title">{del.page_name} · {del.deliverable_type}</h3>
                    <p className="seeding-deliverable-sub">Go live {formatDateTime(del.go_live_date_time)}</p>
                  </div>
                  <div className="seeding-deliverable-head-actions">
                    <button type="button" className="seeding-detail-icon-btn" aria-label="Remove deliverable" onClick={() => removeDeliverable(del.deliverable_id)}>
                      <Trash2 size={14} />
                    </button>
                    <select
                      className="seeding-inline-select"
                      value={del.status}
                      onChange={(e) => updateDeliverable(del.deliverable_id, { status: e.target.value })}
                    >
                      {DELIVERABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="seeding-deliverable-fields">
                  <label className="seeding-detail-field seeding-detail-field--full">
                    <span>Live link</span>
                    <div className="seeding-live-link-row">
                      <input
                        className={inputCls}
                        value={del.live_link || ""}
                        onChange={(e) => updateDeliverable(del.deliverable_id, { live_link: e.target.value })}
                      />
                      <input
                        className={`${inputCls} seeding-views-input`}
                        type="number"
                        value={del.views ?? 0}
                        onChange={(e) => updateDeliverable(del.deliverable_id, { views: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </label>
                  <label className="seeding-detail-field seeding-detail-field--full">
                    <span>Deliverable notes</span>
                    <input
                      className={inputCls}
                      value={del.notes || ""}
                      onChange={(e) => updateDeliverable(del.deliverable_id, { notes: e.target.value })}
                    />
                  </label>
                  <label className="seeding-detail-field">
                    <span>Assignment</span>
                    <select
                      className="seeding-inline-select"
                      value={del.assigned_to || ""}
                      onChange={(e) => updateDeliverable(del.deliverable_id, { assigned_to: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title={`Outputs & changes (${draft.outputs?.length ?? 0})`} action={<button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddOutput((v) => !v)}>+ Add output</button>}>
          {showAddOutput && (
            <div className="seeding-surface-nested" style={{ display: "grid", gap: 8, padding: 14, borderRadius: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select className="seeding-inline-select" style={{ flex: "1 1 160px" }} value={newOutput.type} onChange={(e) => setNewOutput((o) => ({ ...o, type: e.target.value }))}>
                  {OUTPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className={inputCls} style={{ flex: "2 1 220px" }} placeholder="Title (e.g. Carousel — design v1)" value={newOutput.title} onChange={(e) => setNewOutput((o) => ({ ...o, title: e.target.value }))} />
              </div>
              <input className={inputCls} placeholder="Link (Canva / Drive / GDoc / content URL)" value={newOutput.link} onChange={(e) => setNewOutput((o) => ({ ...o, link: e.target.value }))} />
              <textarea className={inputCls} rows={3} placeholder="Writeup text…" value={newOutput.writeup_text} onChange={(e) => setNewOutput((o) => ({ ...o, writeup_text: e.target.value }))} />
              <select className="seeding-inline-select" value={newOutput.status} onChange={(e) => setNewOutput((o) => ({ ...o, status: e.target.value }))}>
                {OUTPUT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--f-dim)" }}>
                  <input type="checkbox" checked={newOutput.visible_to_bd} onChange={(e) => setNewOutput((o) => ({ ...o, visible_to_bd: e.target.checked }))} /> Visible to BD
                </label>
                <button type="button" className="seeding-detail-save seeding-detail-save--compact" disabled={!newOutput.title.trim()} onClick={addOutput}>Save output</button>
                <button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddOutput(false)}>Cancel</button>
              </div>
            </div>
          )}
          {!draft.outputs?.length ? (
            <p className="seeding-muted">No outputs yet — add the first one above.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {(draft.outputs as any[]).map((o) => (
                <article key={o.output_id} className="seeding-surface-nested" style={{ padding: 14, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{o.title}</div>
                      <div style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>{o.output_type}{o.visible_to_bd ? " · visible to BD" : ""}</div>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.link ? <a href={o.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-2)", display: "inline-block", marginTop: 8, wordBreak: "break-all" }}>{o.link}</a> : null}
                  {o.writeup_text ? <p style={{ fontSize: 12, color: "var(--f-dim)", marginTop: 8, whiteSpace: "pre-wrap" }}>{o.writeup_text}</p> : null}
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="General deal comments">
          <p className="seeding-detail-hint">
            For comments that aren&apos;t about a specific output. Most client feedback should live on the output card above.
          </p>
          {!draft.general_comments?.length ? (
            <p className="seeding-muted">No general comments.</p>
          ) : null}
          <div className="seeding-comment-compose">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="Add a general comment about this deal…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="seeding-comment-toolbar">
              <span><Image size={14} /> Image</span>
              <span><Paperclip size={14} /> File</span>
              <span><Link2 size={14} /> Link</span>
              <button type="button" className="seeding-detail-post" disabled={!comment.trim()}>
                <Send size={13} /> Post
              </button>
            </div>
          </div>
        </Section>

        <Section title="Payment">
          <div className="seeding-detail-form seeding-detail-form--row">
            <label className="seeding-detail-field">
              <span>Status</span>
              <select
                className="seeding-inline-select"
                value={draft.payment_status || "Not Raised"}
                onChange={(e) => save({ payment_status: e.target.value })}
              >
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="seeding-detail-field">
              <span>Due date</span>
              <input
                type="date"
                className={inputCls}
                value={toDateInputValue(draft.payment_due_date)}
                onChange={(e) => save({ payment_due_date: e.target.value ? `${e.target.value}T00:00:00` : undefined })}
              />
            </label>
            <label className="seeding-detail-field">
              <span>Amount received</span>
              <input
                type="number"
                className={inputCls}
                value={draft.amount_received ?? 0}
                onChange={(e) => setDraft({ ...draft, amount_received: Number(e.target.value) || 0 })}
                onBlur={() => save({ amount_received: draft.amount_received ?? 0 })}
              />
            </label>
            {draft.payment_updated_by ? (
              <div className="seeding-detail-field">
                <span>Last updated by</span>
                <p className="seeding-detail-static">{draft.payment_updated_by}</p>
                <p className="seeding-detail-static-sub">{formatDateTime(draft.payment_updated_at)}</p>
              </div>
            ) : null}
          </div>
          <label className="seeding-detail-field seeding-detail-field--full" style={{ marginTop: 12 }}>
            <span>Payment notes</span>
            <textarea
              className={inputCls}
              rows={3}
              placeholder="Add payment notes…"
              value={draft.payment_notes || ""}
              onChange={(e) => setDraft({ ...draft, payment_notes: e.target.value })}
              onBlur={() => save({ payment_notes: draft.payment_notes })}
            />
          </label>
        </Section>

        <Section title="Revenue">
          <label className="seeding-detail-field">
            <span>Closed at</span>
            <input
              type="number"
              className={inputCls}
              value={draft.price_closed_at}
              onChange={(e) => setDraft({ ...draft, price_closed_at: Number(e.target.value) || 0 })}
              onBlur={() => save({ price_closed_at: draft.price_closed_at })}
            />
            <span className="seeding-price-hint">{formatCurrency(draft.price_closed_at)}</span>
          </label>
        </Section>

        <Section title="Internal notes (fulfillment + admin only)">
          {!draft.internal_notes?.length ? <p className="seeding-muted">No notes.</p> : null}
          <div className="seeding-internal-note-row">
            <input
              className={inputCls}
              placeholder="Add an internal note…"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
            />
            <button type="button" className="seeding-detail-save seeding-detail-save--compact">Add</button>
          </div>
        </Section>
      </div>
    </FramerPage>
  );
}
