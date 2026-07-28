import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import { formatDate, formatDateTime } from "@/services/seeding/constants";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import type { SeedingDeal, SeedingDealDetail, SeedingDeliverable } from "@/services/seeding/mockData";

const CHART_COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#2dd4bf", "#fb7185", "#94a3b8"];

function normalizeDetail(raw: unknown): SeedingDealDetail {
  const body = (raw ?? {}) as Record<string, any>;
  const d = (body.deal ?? body) as SeedingDeal;
  const deliverables: SeedingDeliverable[] = body.deliverables ?? (d as SeedingDealDetail).deliverables ?? [];
  return { ...d, deliverables };
}

function formatViews(n: number) {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}

function formatViewsShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n || 0);
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
  const [openDelivIds, setOpenDelivIds] = useState<Set<string>>(new Set());

  const toggleDeliv = (id: string) => {
    setOpenDelivIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const pieData = useMemo(() => {
    const rows = pageRows.filter((p) => p.views > 0).map((p) => ({ name: p.page, value: p.views }));
    if (rows.length) return rows;
    // Empty state ring so the donut still renders with 0 in the center.
    return [{ name: "No views yet", value: 1 }];
  }, [pageRows]);

  const barData = useMemo(
    () => pageRows.map((p) => ({ page: p.page, views: p.views })),
    [pageRows],
  );

  const maxPageViews = useMemo(
    () => Math.max(0, ...barData.map((b) => b.views)),
    [barData],
  );

  /** Scale Y to real view counts (not a fake 0–4 axis when everything is empty). */
  const viewsAxisMax = maxPageViews > 0 ? Math.ceil(maxPageViews * 1.15) : 0;

  const pieHasRealData = pageRows.some((p) => p.views > 0);

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

      {/* Charts */}
      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "minmax(240px, 320px) 1fr",
          gap: 14,
        }}
        className="campaign-report-charts"
      >
        <section className="seeding-surface" style={{ padding: "16px 18px", borderRadius: 14 }}>
          <div style={{ fontSize: 11, color: "var(--f-faint)", letterSpacing: "0.04em" }}>TOTAL VIEWS</div>
          <div style={{ position: "relative", height: 200, marginTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={pieHasRealData ? 2 : 0}
                  stroke="transparent"
                >
                  {pieData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={pieHasRealData ? CHART_COLORS[i % CHART_COLORS.length] : "rgba(255,255,255,0.08)"}
                    />
                  ))}
                </Pie>
                {pieHasRealData ? (
                  <Tooltip
                    formatter={(v: number, name: string) => [formatViews(v), name]}
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                  />
                ) : null}
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 600 }}>{formatViewsShort(totalViews)}</div>
              <div style={{ fontSize: 10, color: "var(--f-faint)" }}>views</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", fontSize: 12, color: "var(--f-dim)" }}>
            <span>{deliverables.length} deliverables</span>
            <span>{pageRows.length} pages</span>
          </div>
        </section>

        <section className="seeding-surface" style={{ padding: "16px 18px", borderRadius: 14, minHeight: 280 }}>
          <div style={{ fontSize: 11, color: "var(--f-faint)", letterSpacing: "0.04em", marginBottom: 4 }}>VIEWS PER PAGE</div>
          <p style={{ fontSize: 11, color: "var(--f-faint)", margin: "0 0 8px" }}>
            Y-axis = view count. Tallest bar = best performing page.
          </p>
          {barData.length ? (
            <div style={{ height: 260, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 28, right: 12, bottom: 52, left: 8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="page"
                    interval={0}
                    tick={{ fill: "#a1a1aa", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    angle={-28}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    width={52}
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${formatViewsShort(v)}`}
                    allowDecimals={false}
                    domain={viewsAxisMax > 0 ? [0, viewsAxisMax] : [0, 1]}
                    ticks={viewsAxisMax > 0 ? undefined : [0]}
                    label={{ value: "Views", angle: -90, position: "insideLeft", fill: "#71717a", fontSize: 10, offset: 4 }}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${formatViews(v)} views`, "Views"]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="views" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="views"
                      position="top"
                      formatter={(v: number) => (v > 0 ? formatViewsShort(v) : "")}
                      style={{ fill: "#e4e4e7", fontSize: 10, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {maxPageViews === 0 ? (
                <div
                  style={{
                    position: "absolute",
                    inset: "40px 20px 70px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    fontSize: 12,
                    color: "var(--f-faint)",
                    textAlign: "center",
                  }}
                >
                  All pages at 0 views — expand deliverables below and enter real view counts
                </div>
              ) : null}
            </div>
          ) : (
            <p className="seeding-muted">No pages yet.</p>
          )}
        </section>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .campaign-report-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>

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

      {/* Deliverables accordion — same pattern as brief detail */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>
          Deliverables ({deliverables.length})
        </h2>
        <p style={{ fontSize: 12, color: "var(--f-faint)", margin: "0 0 12px" }}>
          Expand a row to edit live link + views. Charts update from these numbers.
        </p>

        <div className="seeding-deliverables-stack">
          {deliverables.map((d) => {
            const open = openDelivIds.has(d.deliverable_id);
            return (
              <article
                key={d.deliverable_id}
                className={`seeding-surface-nested seeding-deliverable-card${open ? " is-open" : " is-collapsed"}`}
              >
                <div className="seeding-deliverable-head">
                  <button
                    type="button"
                    className="seeding-deliverable-toggle"
                    aria-expanded={open}
                    onClick={() => toggleDeliv(d.deliverable_id)}
                  >
                    <ChevronDown
                      size={16}
                      className={`seeding-deliverable-chevron${open ? " is-open" : ""}`}
                      aria-hidden
                    />
                    <span className="seeding-deliverable-title-block">
                      <span className="seeding-deliverable-title">
                        {d.page_name} · {d.deliverable_type}
                      </span>
                      <span className="seeding-deliverable-sub">
                        Go live {formatDateTime(d.go_live_date_time)} · {formatViews(Number(d.views) || 0)} views
                      </span>
                    </span>
                  </button>
                </div>
                {open ? (
                  <div className="seeding-deliverable-fields">
                    <label className="seeding-detail-field seeding-detail-field--full">
                      <span>Live link</span>
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
                    <label className="seeding-detail-field" style={{ maxWidth: 280 }}>
                      <span>Views</span>
                      <input
                        className={`${inputCls} seeding-views-input`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        defaultValue={d.views ?? 0}
                        disabled={!canEditReport || savingId === d.deliverable_id}
                        placeholder="0"
                        onBlur={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          if (v === (Number(d.views) || 0)) return;
                          void patchDeliverable(d.deliverable_id, { views: v });
                        }}
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

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
