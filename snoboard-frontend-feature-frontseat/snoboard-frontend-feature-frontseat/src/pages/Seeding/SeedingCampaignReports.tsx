import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileText, ExternalLink, Layers, TrendingUp, TrendingDown } from "lucide-react";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { api } from "@/services/seeding/client";
import { formatDate } from "@/services/seeding/constants";
import type { SeedingDeal, SeedingDeliverable } from "@/services/seeding/mockData";

type GalleryCard = SeedingDeal & {
  deliverable_count: number;
  total_views: number;
  pages: string[];
};

function formatViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  to,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  to?: string;
}) {
  const inner = (
    <>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "rgba(255,255,255,.04)",
          border: "1px solid var(--f-line)",
          display: "grid",
          placeItems: "center",
          marginBottom: 12,
        }}
      >
        <Icon size={16} strokeWidth={1.75} className={accent} style={!accent ? { color: "var(--f-dim)" } : undefined} />
      </div>
      <div className="f-num" style={{ fontSize: 24, lineHeight: 1.15, wordBreak: "break-word" }}>
        {value}
      </div>
      {sub ? (
        <div
          className="f-num"
          style={{
            fontSize: 13,
            marginTop: 4,
            color: accent?.includes("emerald")
              ? "rgb(52 211 153)"
              : accent?.includes("rose")
                ? "rgb(251 113 133)"
                : "var(--accent-2)",
          }}
        >
          {sub}
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 4 }}>{label}</div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="fglass-panel fglass-purple-shadow f-stat" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return <div className="fglass-panel fglass-purple-shadow f-stat">{inner}</div>;
}

export default function SeedingCampaignReports() {
  const [rows, setRows] = useState<GalleryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: deals }, { data: delivs }] = await Promise.all([
        api.get<SeedingDeal[]>("/deals", { params: { admin_review_status: "Approved" } }),
        api.get<(SeedingDeliverable & { deal_id?: string })[]>("/deliverables"),
      ]);
      const byDeal = new Map<string, SeedingDeliverable[]>();
      for (const d of delivs || []) {
        const id = (d as { deal_id?: string }).deal_id;
        if (!id) continue;
        const list = byDeal.get(id) || [];
        list.push(d);
        byDeal.set(id, list);
      }
      const cards: GalleryCard[] = (deals || []).map((deal) => {
        const list = byDeal.get(deal.deal_id) || [];
        const pages = [...new Set(list.map((x) => x.page_name).filter(Boolean))];
        return {
          ...deal,
          deliverable_count: list.length,
          total_views: list.reduce((s, x) => s + (Number(x.views) || 0), 0),
          pages,
        };
      });
      setRows(cards);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter((d) =>
        [d.brand_name, d.agency_or_client_name, d.submitted_by_team?.team_name, ...d.pages]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(needle)),
      );
    }
    // Newest go-live first; missing dates sink to the bottom.
    return [...list].sort((a, b) => {
      const ta = a.go_live_date_time ? Date.parse(a.go_live_date_time) : Number.NEGATIVE_INFINITY;
      const tb = b.go_live_date_time ? Date.parse(b.go_live_date_time) : Number.NEGATIVE_INFINITY;
      const na = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
      const nb = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
      return nb - na;
    });
  }, [rows, q]);

  const stats = useMemo(() => {
    const totalViews = rows.reduce((s, d) => s + (d.total_views || 0), 0);
    const totalCampaigns = rows.length;
    // Rank only campaigns that actually have views. Need ≥2 to name a
    // distinct best + least — otherwise least is N/A (never the same card twice).
    const withViews = [...rows]
      .filter((d) => (d.total_views || 0) > 0)
      .sort((a, b) => b.total_views - a.total_views);
    const best = withViews[0] || null;
    const least = withViews.length >= 2 ? withViews[withViews.length - 1] : null;
    return { totalViews, totalCampaigns, best, least };
  }, [rows]);

  return (
    <FramerPage>
      <PageHeader
        eyebrow="SEEDING · REPORTS"
        title="Campaign Reports"
        lead="One card per campaign — open for brief link, page performance, live links, and content rationale."
      />

      <section
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 26 }}
        className="seeding-stats"
      >
        <StatCard
          icon={Eye}
          label="Total views"
          value={loading ? "…" : formatViews(stats.totalViews)}
          accent="text-emerald-400"
        />
        <StatCard
          icon={Layers}
          label="Total campaigns"
          value={loading ? "…" : String(stats.totalCampaigns)}
        />
        <StatCard
          icon={TrendingUp}
          label="Best performing"
          value={loading ? "…" : (stats.best?.brand_name || "N/A")}
          sub={stats.best ? `${formatViews(stats.best.total_views)} views` : "No view data yet"}
          accent="text-emerald-400"
          to={stats.best ? `/seeding/campaign-reports/${stats.best.deal_id}` : undefined}
        />
        <StatCard
          icon={TrendingDown}
          label="Least performing"
          value={loading ? "…" : (stats.least?.brand_name || "N/A")}
          sub={
            stats.least
              ? `${formatViews(stats.least.total_views)} views`
              : stats.best
                ? "Need 2+ campaigns with views"
                : "No view data yet"
          }
          accent="text-rose-400"
          to={stats.least ? `/seeding/campaign-reports/${stats.least.deal_id}` : undefined}
        />
      </section>

      <div className="seeding-filters-bar seeding-surface" style={{ marginTop: 20 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand, team, page…"
          className="seeding-submit-input"
          style={{ maxWidth: 280, padding: "8px 12px" }}
        />
        <span className="seeding-filters-count">{filtered.length} campaign{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? (
        <p className="seeding-muted" style={{ marginTop: 16 }}>Loading…</p>
      ) : !filtered.length ? (
        <p className="seeding-muted" style={{ marginTop: 16 }}>No approved campaigns yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {filtered.map((d) => (
            <Link
              key={d.deal_id}
              to={`/seeding/campaign-reports/${d.deal_id}`}
              className="seeding-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "18px 18px 16px",
                borderRadius: 14,
                textDecoration: "none",
                color: "inherit",
                minHeight: 160,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--f-ink)" }}>{d.brand_name}</div>
                  <div style={{ fontSize: 12, color: "var(--f-faint)", marginTop: 3 }}>
                    {d.submitted_by_team?.team_name || "—"} · Go-live {formatDate(d.go_live_date_time)}
                  </div>
                </div>
                {d.deal_status ? <StatusBadge status={d.deal_status} /> : <StatusBadge status={d.admin_review_status} />}
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: "auto", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--f-dim)" }}>
                  <Eye size={14} /> {formatViews(d.total_views)}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--f-dim)" }}>
                  <FileText size={14} /> {d.deliverable_count} deliverable{d.deliverable_count === 1 ? "" : "s"}
                </span>
                {d.brief_link ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--f-faint)", marginLeft: "auto" }}>
                    <ExternalLink size={12} /> Brief
                  </span>
                ) : null}
              </div>

              {d.pages.length ? (
                <div style={{ fontSize: 11, color: "var(--f-faint)", lineHeight: 1.4 }}>
                  {d.pages.slice(0, 4).join(" · ")}
                  {d.pages.length > 4 ? ` +${d.pages.length - 4}` : ""}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </FramerPage>
  );
}
