// Admin Approval Queue — full brief cards with editable Price / Go-live / Payment-due,
// brief text + link, and Approve / Needs Info / Reject / Cancel. Framer-styled port of
// the original FS-Seeding AdminApprovalQueue.
import { useCallback, useEffect, useState } from "react";
import { Check, X, MessageCircleWarning, Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import { formatDateTime, toDatetimeLocalValue, toDateInputValue } from "@/services/seeding/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */

const inputCls = "fglass-input w-full rounded-lg px-2 py-1.5 text-sm";
const fieldLabel: React.CSSProperties = { fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 5 };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer" };

function ActionBar({ deal, onAction }: { deal: any; onAction: () => void }) {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const fire = async (action: string) => {
    if (action === "Needs More Info" && !comment.trim()) { setShowComment(true); return; }
    setBusy(true);
    try {
      await api.post(`/deals/${deal.deal_id}/review`, { action, comment: comment.trim() });
      setComment("");
      setShowComment(false);
      onAction();
    } catch (err: any) {
      const status = err?.response?.status;
      toast.error(status === 403 ? "Admin access required to review deals." : `Couldn't ${action.toLowerCase()} — please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => fire("Approve")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
          <Check size={13} strokeWidth={2} /> Approve
        </button>
        <button type="button" disabled={busy} onClick={() => setShowComment(true)} style={ghostBtn}>
          <MessageCircleWarning size={13} strokeWidth={1.5} /> Needs Info
        </button>
        <button type="button" disabled={busy} onClick={() => fire("Reject")} style={ghostBtn}>
          <X size={13} strokeWidth={1.5} /> Reject
        </button>
        <button type="button" disabled={busy} onClick={() => fire("Cancel")} style={ghostBtn}>
          <Ban size={13} strokeWidth={1.5} /> Cancel
        </button>
      </div>
      {showComment && (
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What information is missing?"
            rows={2}
            className={inputCls}
            style={{ resize: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => fire("Needs More Info")} disabled={busy || !comment.trim()} style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", background: "#fff", color: "#000", cursor: "pointer", opacity: !comment.trim() ? 0.5 : 1 }}>Send</button>
            <button type="button" onClick={() => { setShowComment(false); setComment(""); }} style={{ ...ghostBtn, border: "none" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SeedingApprovalQueue() {
  const [briefs, setBriefs] = useState<any[]>([]);
  const [delivByDeal, setDelivByDeal] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: deals }, delivRes] = await Promise.all([
        api.get<any[]>("/deals", { params: { admin_review_status: "Submitted" } }),
        api.get<any[]>("/deliverables").catch(() => ({ data: [] as any[] })),
      ]);
      setBriefs(deals || []);
      const map: Record<string, any[]> = {};
      for (const dv of (delivRes.data || [])) (map[dv.deal_id] ??= []).push(dv);
      setDelivByDeal(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveField = async (dealId: string, field: string, value: any, current: any) => {
    if (value === current) return;
    await api.put(`/deals/${dealId}`, { [field]: value });
    load();
  };

  return (
    <FramerPage>
      <PageHeader eyebrow="SEEDING · APPROVALS" title="Approval Queue" lead="All briefs submitted by BD teams, awaiting your review." />

      {loading ? (
        <p className="seeding-muted" style={{ marginTop: 24 }}>Loading…</p>
      ) : !briefs.length ? (
        <div style={{ marginTop: 24, textAlign: "center", padding: "56px 0", border: "1px dashed var(--f-line)", borderRadius: 14 }}>
          <div style={{ fontSize: 14, color: "var(--f-ink)" }}>No briefs waiting.</div>
          <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>All caught up.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16, marginTop: 24 }}>
          {briefs.map((d) => (
            <div key={d.deal_id} className="fglass-panel fglass-purple-shadow" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 4 }}>{d.submitted_by_team?.team_name || "Team"}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>{d.brand_name}</h3>
                  <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 2 }}>via {d.agency_or_client_name} · {d.submitted_by_user?.name}</div>
                </div>
                <StatusBadge status={d.admin_review_status} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={fieldLabel}>Price</div>
                  <input type="number" min={0} defaultValue={d.price_closed_at ?? ""} className={inputCls}
                    onBlur={(e) => saveField(d.deal_id, "price_closed_at", e.target.value === "" ? 0 : Number(e.target.value), d.price_closed_at)} />
                </div>
                <div>
                  <div style={fieldLabel}>Go-live</div>
                  <input type="datetime-local" defaultValue={toDatetimeLocalValue(d.go_live_date_time)} className={inputCls} style={{ colorScheme: "dark" }}
                    onBlur={(e) => e.target.value && saveField(d.deal_id, "go_live_date_time", new Date(e.target.value).toISOString(), d.go_live_date_time)} />
                </div>
                <div>
                  <div style={fieldLabel}>Payment due</div>
                  <input type="date" defaultValue={toDateInputValue(d.payment_due_date)} className={inputCls} style={{ colorScheme: "dark" }}
                    onBlur={(e) => e.target.value && saveField(d.deal_id, "payment_due_date", new Date(e.target.value).toISOString(), d.payment_due_date)} />
                </div>
                <div>
                  <div style={fieldLabel}>Submitted</div>
                  <div style={{ fontSize: 13, color: "var(--f-dim)", paddingTop: 6 }}>{formatDateTime(d.created_at)}</div>
                </div>
              </div>

              {delivByDeal[d.deal_id]?.length ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={fieldLabel}>Deliverables ({delivByDeal[d.deal_id].length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {delivByDeal[d.deal_id].map((dv) => (
                      <span key={dv.deliverable_id} className="seeding-surface-nested" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, color: "var(--f-dim)" }}>
                        {dv.page_name} · {dv.deliverable_type}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {d.brief_text ? (
                <div className="seeding-surface-nested" style={{ padding: "10px 12px", borderRadius: 10, fontSize: 13, color: "var(--f-dim)", lineHeight: 1.5, marginBottom: 12 }}>
                  {d.brief_text}
                </div>
              ) : null}
              {d.brief_link ? (
                <a href={d.brief_link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--f-dim)", marginBottom: 14 }}>
                  <ExternalLink size={12} strokeWidth={1.5} /> Brief link
                </a>
              ) : null}

              <ActionBar deal={d} onAction={load} />
            </div>
          ))}
        </div>
      )}
    </FramerPage>
  );
}
