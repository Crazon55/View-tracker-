import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileText, ExternalLink } from "lucide-react";
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
    if (!needle) return rows;
    return rows.filter((d) =>
      [d.brand_name, d.agency_or_client_name, d.submitted_by_team?.team_name, ...d.pages]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  return (
    <FramerPage>
      <PageHeader
        eyebrow="SEEDING · REPORTS"
        title="Campaign Reports"
        lead="One card per campaign — open for brief link, page performance, live links, and content rationale."
      />

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
