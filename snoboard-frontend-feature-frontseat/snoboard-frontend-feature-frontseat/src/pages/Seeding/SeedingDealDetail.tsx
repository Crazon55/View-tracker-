import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, ChevronDown, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  formatDateTime,
  toDateInputValue,
} from "@/services/seeding/constants";
import type {
  SeedingDealDetail,
  SeedingDeliverable,
  SeedingFeedback,
  SeedingFeedbackType,
  SeedingOutput,
} from "@/services/seeding/mockData";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { BD_TEAM_ROLE_TO_NAME, canonicalRole } from "@/lib/accessModel";

const inputCls = "fglass-input w-full rounded-lg px-3 py-2 text-sm";

const BD_EDITABLE_REVIEW = new Set(["Submitted", "Needs More Info"]);

function isOwnSubmittedBrief(
  deal: { submitted_by_user?: { email?: string }; submitted_by_user_id?: string },
  email?: string | null,
): boolean {
  const mine = (email || "").trim().toLowerCase();
  const submitterEmail = (deal.submitted_by_user?.email || "").trim().toLowerCase();
  return !!mine && !!submitterEmail && mine === submitterEmail;
}

const FEEDBACK_TYPES: SeedingFeedbackType[] = ["blocker", "comment", "change"];
const FEEDBACK_TYPE_META: Record<SeedingFeedbackType, { label: string; color: string; bg: string }> = {
  blocker: { label: "Blocker", color: "#FF7070", bg: "rgba(201,59,59,0.15)" },
  comment: { label: "Comment", color: "#a1a1aa", bg: "rgba(161,161,170,0.12)" },
  change: { label: "Changes", color: "#F0C060", bg: "rgba(212,149,42,0.15)" },
};

function normalizeFeedbackType(raw: unknown): SeedingFeedbackType {
  const t = String(raw || "comment").toLowerCase();
  if (t === "blocker" || t === "change" || t === "comment") return t;
  if (t === "changes" || t === "update") return "change";
  return "comment";
}

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

  const allFeedback: SeedingFeedback[] = body.client_feedback ?? d.general_comments ?? [];
  const rawOutputs: SeedingOutput[] = body.fulfillment_outputs ?? body.outputs ?? d.outputs ?? [];
  const rawDelivs: SeedingDeliverable[] = body.deliverables ?? d.deliverables ?? [];
  const outputs = rawOutputs.map((o) => ({
    ...o,
    comments: allFeedback.filter((f) => f.output_id && f.output_id === o.output_id),
  }));
  const deliverables = rawDelivs.map((del) => ({
    ...del,
    comments: allFeedback.filter(
      (f) => f.deliverable_id && f.deliverable_id === del.deliverable_id && !f.output_id,
    ),
  }));
  // Deal-level only — not tied to a deliverable or output.
  const general_comments = allFeedback.filter((f) => !f.output_id && !f.deliverable_id);

  return {
    ...(d as SeedingDealDetail),
    assets_links,
    deliverables,
    outputs,
    general_comments,
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

function CommentThread({
  comments,
  draft,
  onDraftChange,
  draftType,
  onDraftTypeChange,
  onPost,
  posting,
  placeholder,
  scopeLabel = "On this item",
  showTypes = false,
}: {
  comments: SeedingFeedback[];
  draft: string;
  onDraftChange: (v: string) => void;
  draftType?: SeedingFeedbackType;
  onDraftTypeChange?: (t: SeedingFeedbackType) => void;
  onPost: () => void;
  posting?: boolean;
  placeholder: string;
  scopeLabel?: string;
  showTypes?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<SeedingFeedbackType | "all">("all");
  const typeCounts = useMemo(() => {
    const counts: Record<SeedingFeedbackType, number> = { blocker: 0, comment: 0, change: 0 };
    for (const c of comments) counts[normalizeFeedbackType(c.feedback_type)] += 1;
    return counts;
  }, [comments]);
  const visible = typeFilter === "all"
    ? comments
    : comments.filter((c) => normalizeFeedbackType(c.feedback_type) === typeFilter);
  const activeType = draftType || "comment";

  return (
    <div
      style={{
        marginTop: 14,
        borderTop: "1px solid var(--f-line)",
        paddingTop: 12,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 10,
        padding: "12px 12px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--f-faint)" }}>
          Discussion · {comments.length}
        </div>
        {showTypes && comments.length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${typeFilter === "all" ? "#71717a" : "var(--f-line)"}`,
                background: typeFilter === "all" ? "rgba(255,255,255,0.06)" : "transparent",
                color: typeFilter === "all" ? "var(--f-ink)" : "var(--f-faint)",
              }}
            >
              All
            </button>
            {FEEDBACK_TYPES.map((t) => {
              const m = FEEDBACK_TYPE_META[t];
              const count = typeCounts[t];
              if (!count) return null;
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(active ? "all" : t)}
                  style={{
                    padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${active ? m.color : "var(--f-line)"}`,
                    background: active ? m.bg : "transparent",
                    color: active ? m.color : "var(--f-faint)",
                  }}
                >
                  {m.label} · {count}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {visible.length ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {visible.map((c) => {
            const kind = normalizeFeedbackType(c.feedback_type);
            const meta = FEEDBACK_TYPE_META[kind];
            return (
              <div key={c.feedback_id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.28)", border: `1px solid ${showTypes ? meta.color + "44" : "var(--f-line)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--f-ink)", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {c.added_by_name || "Someone"}
                    {c.added_by_role ? (
                      <span style={{ color: "var(--f-faint)", fontWeight: 500 }}> · {c.added_by_role}</span>
                    ) : null}
                    {showTypes ? (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: meta.bg, color: meta.color, fontWeight: 600 }}>
                        {meta.label}
                      </span>
                    ) : null}
                  </span>
                  {c.created_at ? (
                    <span style={{ fontSize: 10, color: "var(--f-faint)", flexShrink: 0 }}>{formatDateTime(c.created_at)}</span>
                  ) : null}
                </div>
                <p style={{ fontSize: 13, color: "var(--f-dim)", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.45 }}>{c.feedback_text}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="seeding-muted" style={{ marginBottom: 10, fontSize: 12 }}>
          {comments.length === 0
            ? (showTypes ? "No messages yet — add a blocker, comment, or change request." : "No comments yet.")
            : `No ${FEEDBACK_TYPE_META[typeFilter as SeedingFeedbackType]?.label.toLowerCase() ?? ""} messages.`}
        </p>
      )}
      <div className="seeding-comment-compose">
        <textarea
          className={inputCls}
          rows={3}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim() && !posting) onPost();
          }}
        />
        {showTypes && onDraftTypeChange ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
            {FEEDBACK_TYPES.map((t) => {
              const m = FEEDBACK_TYPE_META[t];
              const sel = activeType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onDraftTypeChange(t)}
                  style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${sel ? m.color : "var(--f-line)"}`,
                    background: sel ? m.bg : "transparent",
                    color: sel ? m.color : "var(--f-dim)",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="seeding-comment-toolbar">
          <span style={{ fontSize: 11, color: "var(--f-faint)" }}>{scopeLabel} · ⌘/Ctrl+Enter</span>
          <button type="button" className="seeding-detail-post" disabled={!draft.trim() || posting} onClick={onPost}>
            <Send size={13} /> {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SeedingDealDetail() {
  const { dealId } = useParams();
  const [search] = useSearchParams();
  const { role } = usePermissions();
  const { user } = useAuth();
  const from = search.get("from");

  const roleParts = useMemo(
    () => String(role || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean),
    [role],
  );
  const isFulfillment = roleParts.some((r) => canonicalRole(r) === "fulfillment");
  const isBD = roleParts.some((r) => canonicalRole(r) === "bd" || r in BD_TEAM_ROLE_TO_NAME);
  const isAdmin = roleParts.some((r) => canonicalRole(r) === "admin");
  const backTo = from === "fulfillment" ? "/seeding/fulfillment" : isBD && !isAdmin ? "/seeding" : "/seeding/deals";
  const backLabel = from === "fulfillment" ? "Back to fulfillment" : isBD && !isAdmin ? "Back to dashboard" : "Back to deals";
  // Money is BD/admin only — fulfillment must never see Payment / Revenue.
  const canSeeMoney = !isFulfillment || isAdmin;
  const canManageOutputs = isFulfillment || isAdmin;
  // Anyone reviewing the deal can comment on shared outputs (Frame.io-style).
  const canComment = isBD || isFulfillment || isAdmin;

  const [deal, setDeal] = useState<SeedingDealDetail | null>(null);
  const [draft, setDraft] = useState<SeedingDealDetail | null>(null);
  const [comment, setComment] = useState("");
  const [outputComments, setOutputComments] = useState<Record<string, string>>({});
  const [delivComments, setDelivComments] = useState<Record<string, string>>({});
  const [delivCommentTypes, setDelivCommentTypes] = useState<Record<string, SeedingFeedbackType>>({});
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const [pages, setPages] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ user_id: string; name: string; email?: string }[]>([]);
  const [showAddDeliv, setShowAddDeliv] = useState(false);
  const [openDelivIds, setOpenDelivIds] = useState<Record<string, boolean>>({});
  const [newDeliv, setNewDeliv] = useState({ page_id: "", deliverable_type: "Reel", quantity: 1 });
  const [showAddOutput, setShowAddOutput] = useState(false);
  const [newOutput, setNewOutput] = useState({
    type: "Writeup",
    title: "",
    writeup_text: "",
    link: "",
    status: "Shared with BD",
    visible_to_bd: true,
  });

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
    api.get<{ user_id: string; name: string; email?: string }[]>("/users/fulfillment")
      .then(({ data }) => setAssignees(data || []))
      .catch(() => setAssignees([]));
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
    const visible = newOutput.visible_to_bd;
    const status = visible && newOutput.status === "Draft" ? "Shared with BD" : newOutput.status;
    await api.post("/outputs", {
      deal_id: dealId,
      output_type: newOutput.type,
      title: newOutput.title,
      writeup_text: newOutput.writeup_text,
      link: newOutput.link,
      status,
      visible_to_bd: visible,
    });
    setNewOutput({ type: "Writeup", title: "", writeup_text: "", link: "", status: "Shared with BD", visible_to_bd: true });
    setShowAddOutput(false);
    load();
  };

  const postFeedback = async (
    target: { outputId?: string | null; deliverableId?: string | null; feedbackType?: SeedingFeedbackType },
    text: string,
    clear: () => void,
  ) => {
    if (!dealId || !text.trim()) return;
    setPosting(true);
    try {
      await api.post("/feedback", {
        deal_id: dealId,
        output_id: target.outputId ?? null,
        deliverable_id: target.deliverableId ?? null,
        feedback_type: target.feedbackType || "comment",
        feedback_text: text.trim(),
      });
      clear();
      await load();
    } catch (err: any) {
      window.alert(err?.message || "Couldn't post comment");
    } finally {
      setPosting(false);
    }
  };

  const save = async (patch: Partial<SeedingDealDetail>) => {
    if (!dealId) return;
    setSaving(true);
    try {
      await api.patch(`/deals/${dealId}`, patch);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const saveDealStatus = async (status: string) => {
    if (!dealId || !status) return;
    setSaving(true);
    try {
      // Dedicated endpoint — admin + fulfillment. Generic PATCH /deals was admin/bd only.
      await api.put(`/deals/${dealId}/status`, { deal_status: status });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Couldn't update status.");
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

  const saveDeliverable = async (id: string, patch: Record<string, unknown>) => {
    try {
      await api.put(`/deliverables/${id}`, patch);
      await load();
    } catch (err: any) {
      window.alert(err?.message || "Couldn't save deliverable");
      await load();
    }
  };

  const assigneeId = (del: SeedingDeliverable) =>
    del.assigned_fulfillment_user_id || del.assigned_to || "";

  const isDelivOpen = (id: string) => openDelivIds[id] === true;
  const toggleDeliv = (id: string) =>
    setOpenDelivIds((prev) => ({ ...prev, [id]: !prev[id] }));

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

  const isOwnBrief = isOwnSubmittedBrief(deal, user?.email);
  const canEditBrief =
    isAdmin ||
    (isBD && isOwnBrief && BD_EDITABLE_REVIEW.has(deal.admin_review_status));
  const canEditMoney = isAdmin || (isBD && isOwnBrief && BD_EDITABLE_REVIEW.has(deal.admin_review_status));
  const canEditDeliverables = canManageOutputs || canEditBrief;

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

        {isBD && !isAdmin && !canEditBrief ? (
          <div className="seeding-detail-alert" style={{ borderColor: "var(--f-line)", color: "var(--f-dim)" }}>
            {isOwnBrief
              ? "This brief is approved — you can view it and comment, but edits are locked."
              : "View only — you can only edit briefs you submitted."}
          </div>
        ) : null}

        <Section title="Original brief">
          <div className="seeding-detail-form">
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Agency / Client name</span>
              <input className={inputCls} readOnly={!canEditBrief} value={draft.agency_or_client_name || ""} onChange={(e) => setDraft({ ...draft, agency_or_client_name: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Brief link</span>
              <input className={inputCls} readOnly={!canEditBrief} placeholder="https://…" value={draft.brief_link || ""} onChange={(e) => setDraft({ ...draft, brief_link: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Brief text</span>
              <textarea className={inputCls} readOnly={!canEditBrief} rows={4} value={draft.brief_text || ""} onChange={(e) => setDraft({ ...draft, brief_text: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Assets / reference links (one per line)</span>
              <textarea className={inputCls} readOnly={!canEditBrief} rows={3} value={draft.assets_links || ""} onChange={(e) => setDraft({ ...draft, assets_links: e.target.value })} />
            </label>
            <label className="seeding-detail-field seeding-detail-field--full">
              <span>Notes</span>
              <textarea className={inputCls} readOnly={!canEditBrief} rows={3} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>
          {canEditBrief ? (
            <button type="button" className="seeding-detail-save" disabled={saving} onClick={saveBrief}>
              {saving ? "Saving…" : "Save brief"}
            </button>
          ) : null}
        </Section>

        <Section
          title={`Deliverables (${draft.deliverables?.length ?? 0})`}
          action={
            <div className="seeding-detail-section-actions">
              {canEditDeliverables ? (
                <button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddDeliv((v) => !v)}>+ Add</button>
              ) : null}
              <select
                className="seeding-inline-select"
                value={draft.deal_status || ""}
                disabled={!canManageOutputs || saving}
                onChange={(e) => {
                  const status = e.target.value;
                  if (!status) return;
                  setDraft((d) => (d ? { ...d, deal_status: status } : d));
                  void saveDealStatus(status);
                }}
              >
                {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          }
        >
          {showAddDeliv && canEditDeliverables && (
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
            {(draft.deliverables || []).map((del) => {
              const open = isDelivOpen(del.deliverable_id);
              const comments = del.comments || [];
              const blockerCount = comments.filter((c) => normalizeFeedbackType(c.feedback_type) === "blocker").length;
              const changeCount = comments.filter((c) => normalizeFeedbackType(c.feedback_type) === "change").length;
              const commentCount = comments.filter((c) => normalizeFeedbackType(c.feedback_type) === "comment").length;
              return (
              <article
                key={del.deliverable_id}
                className={`seeding-surface-nested seeding-deliverable-card${open ? " is-open" : " is-collapsed"}`}
              >
                <div className="seeding-deliverable-head">
                  <button
                    type="button"
                    className="seeding-deliverable-toggle"
                    aria-expanded={open}
                    onClick={() => toggleDeliv(del.deliverable_id)}
                  >
                    <ChevronDown
                      size={16}
                      className={`seeding-deliverable-chevron${open ? " is-open" : ""}`}
                      aria-hidden
                    />
                    <span className="seeding-deliverable-title-block">
                      <span className="seeding-deliverable-title">
                        {del.page_name} · {del.deliverable_type}
                        {blockerCount > 0 ? (
                          <span className="seeding-deliverable-kind-count is-blocker"> · {blockerCount} blocker{blockerCount === 1 ? "" : "s"}</span>
                        ) : null}
                        {changeCount > 0 ? (
                          <span className="seeding-deliverable-kind-count is-change"> · {changeCount} change{changeCount === 1 ? "" : "s"}</span>
                        ) : null}
                        {commentCount > 0 ? (
                          <span className="seeding-deliverable-comment-count"> · {commentCount} comment{commentCount === 1 ? "" : "s"}</span>
                        ) : null}
                      </span>
                      <span className="seeding-deliverable-sub">Go live {formatDateTime(del.go_live_date_time)}</span>
                    </span>
                  </button>
                  <div className="seeding-deliverable-head-actions" onClick={(e) => e.stopPropagation()}>
                    {canEditDeliverables ? (
                      <button type="button" className="seeding-detail-icon-btn" aria-label="Remove deliverable" onClick={() => removeDeliverable(del.deliverable_id)}>
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                    <select
                      className="seeding-inline-select"
                      value={del.status}
                      disabled={!canManageOutputs}
                      onChange={(e) => {
                        const status = e.target.value;
                        updateDeliverable(del.deliverable_id, { status });
                        saveDeliverable(del.deliverable_id, { status });
                      }}
                    >
                      {DELIVERABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {open ? (
                <div className="seeding-deliverable-fields">
                  <label className="seeding-detail-field seeding-detail-field--full">
                    <span>Live link</span>
                    <div className="seeding-live-link-row">
                      <input
                        className={inputCls}
                        readOnly={!canManageOutputs}
                        value={del.live_link || ""}
                        onChange={(e) => updateDeliverable(del.deliverable_id, { live_link: e.target.value })}
                        onBlur={(e) => saveDeliverable(del.deliverable_id, { live_link: e.target.value })}
                      />
                      <input
                        className={`${inputCls} seeding-views-input`}
                        type="number"
                        readOnly={!canManageOutputs}
                        value={del.views ?? 0}
                        onChange={(e) => updateDeliverable(del.deliverable_id, { views: Number(e.target.value) || 0 })}
                        onBlur={(e) => saveDeliverable(del.deliverable_id, { views: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </label>
                  <label className="seeding-detail-field seeding-detail-field--full">
                    <span>Deliverable notes</span>
                    <input
                      className={inputCls}
                      readOnly={!canManageOutputs}
                      value={del.notes || ""}
                      onChange={(e) => updateDeliverable(del.deliverable_id, { notes: e.target.value })}
                      onBlur={(e) => saveDeliverable(del.deliverable_id, { notes: e.target.value })}
                    />
                  </label>
                  <label className="seeding-detail-field">
                    <span>Assignment</span>
                    <select
                      className="seeding-inline-select"
                      disabled={!canManageOutputs}
                      value={assigneeId(del)}
                      onChange={(e) => {
                        const assigned_fulfillment_user_id = e.target.value || null;
                        updateDeliverable(del.deliverable_id, {
                          assigned_fulfillment_user_id: assigned_fulfillment_user_id || "",
                          assigned_to: assigned_fulfillment_user_id || "",
                        });
                        saveDeliverable(del.deliverable_id, { assigned_fulfillment_user_id });
                      }}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.name || u.email || u.user_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canComment ? (
                    <CommentThread
                      showTypes
                      comments={comments}
                      draft={delivComments[del.deliverable_id] || ""}
                      onDraftChange={(v) => setDelivComments((prev) => ({ ...prev, [del.deliverable_id]: v }))}
                      draftType={delivCommentTypes[del.deliverable_id] || "comment"}
                      onDraftTypeChange={(t) => setDelivCommentTypes((prev) => ({ ...prev, [del.deliverable_id]: t }))}
                      posting={posting}
                      scopeLabel="On this deliverable"
                      placeholder={
                        (delivCommentTypes[del.deliverable_id] || "comment") === "blocker"
                          ? "What’s blocking this deliverable?"
                          : (delivCommentTypes[del.deliverable_id] || "comment") === "change"
                            ? "What needs to change on this deliverable?"
                            : "Add a comment on this deliverable…"
                      }
                      onPost={() =>
                        postFeedback(
                          {
                            deliverableId: del.deliverable_id,
                            feedbackType: delivCommentTypes[del.deliverable_id] || "comment",
                          },
                          delivComments[del.deliverable_id] || "",
                          () => setDelivComments((prev) => ({ ...prev, [del.deliverable_id]: "" })),
                        )
                      }
                    />
                  ) : null}
                </div>
                ) : null}
              </article>
              );
            })}
          </div>
        </Section>

        <Section
          title={`Outputs & changes (${draft.outputs?.length ?? 0})`}
          action={canManageOutputs ? (
            <button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddOutput((v) => !v)}>+ Add output</button>
          ) : undefined}
        >
          {isBD && !isAdmin ? (
            <p className="seeding-detail-hint" style={{ marginBottom: 10 }}>
              Comment on each output below (like Frame.io). Fulfillment shares items when they mark them visible to BD.
            </p>
          ) : null}
          {showAddOutput && canManageOutputs && (
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
                  <input
                    type="checkbox"
                    checked={newOutput.visible_to_bd}
                    onChange={(e) => {
                      const visible_to_bd = e.target.checked;
                      setNewOutput((o) => ({
                        ...o,
                        visible_to_bd,
                        status: visible_to_bd && o.status === "Draft" ? "Shared with BD" : o.status,
                      }));
                    }}
                  /> Visible to BD
                </label>
                <button type="button" className="seeding-detail-save seeding-detail-save--compact" disabled={!newOutput.title.trim()} onClick={addOutput}>Save output</button>
                <button type="button" className="seeding-detail-ghost-btn" onClick={() => setShowAddOutput(false)}>Cancel</button>
              </div>
              <p className="seeding-detail-hint" style={{ margin: 0 }}>
                When visible, BD can open this deal and comment on this output (Frame.io-style).
              </p>
            </div>
          )}
          {!draft.outputs?.length ? (
            <p className="seeding-muted">
              {isBD && !isAdmin
                ? "No outputs shared with you yet — fulfillment will mark items Visible to BD."
                : "No outputs yet — add the first one above."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {(draft.outputs as SeedingOutput[]).map((o) => (
                <article key={o.output_id} className="seeding-surface-nested" style={{ padding: 14, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{o.title || o.label}</div>
                      <div style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>
                        {o.output_type}{o.visible_to_bd ? " · visible to BD" : ""}
                        {(o.comments?.length ?? 0) > 0 ? ` · ${o.comments!.length} comment${o.comments!.length === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.link ? <a href={o.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-2)", display: "inline-block", marginTop: 8, wordBreak: "break-all" }}>{o.link}</a> : null}
                  {o.writeup_text ? <p style={{ fontSize: 12, color: "var(--f-dim)", marginTop: 8, whiteSpace: "pre-wrap" }}>{o.writeup_text}</p> : null}
                  {canComment ? (
                    <CommentThread
                      comments={o.comments || []}
                      draft={outputComments[o.output_id] || ""}
                      onDraftChange={(v) => setOutputComments((prev) => ({ ...prev, [o.output_id]: v }))}
                      posting={posting}
                      scopeLabel="On this output"
                      placeholder={isBD ? "Add client feedback on this output…" : "Reply to BD / note a change…"}
                      onPost={() => postFeedback(
                        { outputId: o.output_id },
                        outputComments[o.output_id] || "",
                        () => setOutputComments((prev) => ({ ...prev, [o.output_id]: "" })),
                      )}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="General deal comments">
          <p className="seeding-detail-hint">
            For comments that aren&apos;t about a specific deliverable or output. Prefer commenting on the deliverable card above for blockers.
          </p>
          {(draft.general_comments || []).length ? (
            <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
              {(draft.general_comments || []).map((c) => (
                <div key={c.feedback_id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                    {c.added_by_name || "Someone"}
                    {c.added_by_role ? <span style={{ color: "var(--f-faint)", fontWeight: 500 }}> · {c.added_by_role}</span> : null}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--f-dim)", whiteSpace: "pre-wrap", margin: 0 }}>{c.feedback_text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="seeding-muted">No general comments.</p>
          )}
          {canComment ? (
            <div className="seeding-comment-compose">
              <textarea
                className={inputCls}
                rows={3}
                placeholder="Add a general comment about this deal…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="seeding-comment-toolbar">
                <span style={{ fontSize: 11, color: "var(--f-faint)" }}>Deal-level only</span>
                <button
                  type="button"
                  className="seeding-detail-post"
                  disabled={!comment.trim() || posting}
                  onClick={() => postFeedback({}, comment, () => setComment(""))}
                >
                  <Send size={13} /> {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          ) : null}
        </Section>

        {canSeeMoney ? (
          <>
            <Section title="Payment">
              <div className="seeding-detail-form seeding-detail-form--row">
                <label className="seeding-detail-field">
                  <span>Status</span>
                  <select
                    className="seeding-inline-select"
                    disabled={!canEditMoney}
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
                    readOnly={!canEditMoney}
                    value={toDateInputValue(draft.payment_due_date)}
                    onChange={(e) => save({ payment_due_date: e.target.value ? `${e.target.value}T00:00:00` : undefined })}
                  />
                </label>
                <label className="seeding-detail-field">
                  <span>Amount received</span>
                  <input
                    type="number"
                    className={inputCls}
                    readOnly={!isAdmin}
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
                  readOnly={!isAdmin}
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
                  readOnly={!canEditMoney}
                  value={draft.price_closed_at}
                  onChange={(e) => setDraft({ ...draft, price_closed_at: Number(e.target.value) || 0 })}
                  onBlur={() => save({ price_closed_at: draft.price_closed_at })}
                />
                <span className="seeding-price-hint">{formatCurrency(draft.price_closed_at)}</span>
              </label>
            </Section>
          </>
        ) : null}

        {(isFulfillment || isAdmin) ? (
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
        ) : null}
      </div>
    </FramerPage>
  );
}
