import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import { toast } from "sonner";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import { formatDate, formatDateTime } from "@/services/seeding/constants";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import type { SeedingDeal, SeedingDealDetail, SeedingDeliverable } from "@/services/seeding/mockData";

function normalizeDetail(raw: unknown): SeedingDealDetail {
  const body = (raw ?? {}) as Record<string, any>;
  const d = (body.deal ?? body) as SeedingDeal;
  const deliverables: SeedingDeliverable[] = body.deliverables ?? (d as SeedingDealDetail).deliverables ?? [];
  return { ...d, deliverables };
}

function formatViews(n: number) {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}

export default function SeedingCampaignReportDetail() {
  const { dealId } = useParams<{ dealId: string }>();
  const { canEditArea } = useAreaAccess();
  const canEditReport = canEditArea("seeding_campaign_reports");

  const [deal, setDeal] = useState<SeedingDealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rationale, setRationale] = useState("");
  const [savingRationale, setSavingRationale] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const { data } = await api.get<unknown>(`/deals/${dealId}`);
      const detail = normalizeDetail(data);
      setDeal(detail);
      setRationale(detail.content_rationale || "");
    } catch {
      setDeal(null);
      toast.error("Couldn't load campaign report.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  const deliverables = deal?.deliverables || [];
  const totalViews = useMemo(
    () => deliverables.reduce((s, d) => s + (Number(d.views) || 0), 0),
    [deliverables],
  );

  const pageRows = useMemo(() => {
    const map = new Map<string, { page: string; items: SeedingDeliverable[]; views: number }>();
    for (const d of deliverables) {
      const key = d.page_name || "Unknown page";
      const row = map.get(key) || { page: key, items: [], views: 0 };
      row.items.push(d);
      row.views += Number(d.views) || 0;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.views - a.views);
  }, [deliverables]);

  const patchDeliverable = async (id: string, body: { live_link?: string; views?: number }) => {
    setSavingId(id);
    try {
      const { data } = await api.put<SeedingDeliverable>(`/deliverables/${id}`, body);
      setDeal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          deliverables: (prev.deliverables || []).map((d) =>
            d.deliverable_id === id ? { ...d, ...data, ...body } : d,
          ),
        };
      });
    } catch {
      toast.error("Couldn't save deliverable.");
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const saveRationale = async () => {
    if (!dealId || !canEditReport) return;
    setSavingRationale(true);
    try {
      const { data } = await api.patch<SeedingDeal>(`/deals/${dealId}/campaign-report`, {
        content_rationale: rationale,
      });
      setDeal((prev) => (prev ? { ...prev, content_rationale: data.content_rationale ?? rationale } : prev));
      toast.success("Rationale saved");
    } catch {
      toast.error("Couldn't save rationale.");
    } finally {
      setSavingRationale(false);
    }
  };

  if (loading) {
    return (
      <FramerPage>
        <p className="seeding-muted">Loading…</p>
      </FramerPage>
    );
  }

  if (!deal) {
    return (
      <FramerPage>
        <p className="seeding-muted">Campaign not found.</p>
        <Link to="/seeding/campaign-reports" style={{ fontSize: 13, color: "var(--f-dim)" }}>← Back to gallery</Link>
      </FramerPage>
    );
  }

  const inputCls = "seeding-submit-input";

  return (
    <FramerPage>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Link
            to="/seeding/campaign-reports"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--f-dim)", textDecoration: "none", marginBottom: 10 }}
          >
            <ArrowLeft size={13} /> Campaign Reports
          </Link>
          <PageHeader
            eyebrow="SEEDING · CAMPAIGN REPORT"
            title={deal.brand_name}
            lead={`${deal.submitted_by_team?.team_name || "—"} · Go-live ${formatDate(deal.go_live_date_time)}`}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {deal.deal_status ? <StatusBadge status={deal.deal_status} /> : null}
          <StatusBadge status={deal.admin_review_status} />
        </div>
      </div>

      {/* KPI strip */}
      <div
        className="seeding-surface"
        style={{
          marginTop: 22,
          padding: "18px 20px",
          borderRadius: 14,
          display: "flex",
          gap: 28,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--f-faint)", letterSpacing: "0.04em" }}>TOTAL VIEWS</div>
          <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Eye size={20} style={{ color: "var(--f-dim)" }} />
            {formatViews(totalViews)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--f-faint)", letterSpacing: "0.04em" }}>DELIVERABLES</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{deliverables.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--f-faint)", letterSpacing: "0.04em" }}>PAGES</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{pageRows.length}</div>
        </div>
      </div>

      {/* Original brief */}
      <section className="seeding-surface" style={{ marginTop: 16, padding: "16px 18px", borderRadius: 14 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Original brief</h2>
        {deal.brief_link ? (
          <a
            href={deal.brief_link}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 14, color: "#86efac", wordBreak: "break-all" }}
          >
            <ExternalLink size={14} />
            {deal.brief_link}
          </a>
        ) : (
          <p className="seeding-muted" style={{ marginTop: 8 }}>No brief link on this deal.</p>
        )}
        {deal.brief_text ? (
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--f-dim)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {deal.brief_text}
          </p>
        ) : null}
      </section>

      {/* Page-wise performance */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Page-wise performance</h2>
        <p style={{ fontSize: 12, color: "var(--f-faint)", margin: "0 0 12px" }}>
          Live links and views per deliverable. Total views above is the sum of these.
        </p>

        {pageRows.map((group) => (
          <div key={group.page} className="seeding-surface" style={{ padding: "14px 16px", borderRadius: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, alignItems: "baseline" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{group.page}</div>
              <div style={{ fontSize: 12, color: "var(--f-dim)" }}>{formatViews(group.views)} views</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {group.items.map((d) => (
                <div
                  key={d.deliverable_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(90px, 120px) 1fr minmax(100px, 120px)",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "var(--f-faint)", marginBottom: 6 }}>{d.deliverable_type}</div>
                    <div style={{ fontSize: 11, color: "var(--f-dim)" }}>{formatDateTime(d.go_live_date_time)}</div>
                  </div>
                  <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--f-faint)" }}>Live link</span>
                    <input
                      className={inputCls}
                      defaultValue={d.live_link || ""}
                      disabled={!canEditReport || savingId === d.deliverable_id}
                      placeholder="https://…"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === (d.live_link || "")) return;
                        void patchDeliverable(d.deliverable_id, { live_link: v });
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--f-faint)" }}>Views</span>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      defaultValue={d.views ?? 0}
                      disabled={!canEditReport || savingId === d.deliverable_id}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        if (v === (Number(d.views) || 0)) return;
                        void patchDeliverable(d.deliverable_id, { views: v });
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!deliverables.length ? (
          <p className="seeding-muted">No deliverables on this campaign yet.</p>
        ) : null}
      </section>

      {/* Content rationale */}
      <section className="seeding-surface" style={{ marginTop: 8, padding: "16px 18px", borderRadius: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Why this content</h2>
        <p style={{ fontSize: 12, color: "var(--f-faint)", margin: "4px 0 12px" }}>
          Fulfillment notes on creative direction and why these formats / angles were chosen.
        </p>
        <textarea
          className={inputCls}
          rows={5}
          value={rationale}
          disabled={!canEditReport}
          placeholder="e.g. Chose Reels on FoundersInIndia to hit founder FOMO; Static on Bizz for carousel save rate…"
          onChange={(e) => setRationale(e.target.value)}
        />
        {canEditReport ? (
          <button
            type="button"
            disabled={savingRationale}
            onClick={() => void saveRationale()}
            style={{
              marginTop: 12,
              background: "#fff",
              color: "#000",
              border: 0,
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: savingRationale ? "wait" : "pointer",
              opacity: savingRationale ? 0.6 : 1,
            }}
          >
            {savingRationale ? "Saving…" : "Save rationale"}
          </button>
        ) : null}
      </section>
    </FramerPage>
  );
}
