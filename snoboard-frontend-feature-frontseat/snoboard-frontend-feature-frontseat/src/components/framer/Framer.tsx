// ─────────────────────────────────────────────────────────────────────────────
// Framer component kit — the reusable building blocks for every migrated page.
// Uses styles/framer.css. Wrap a page in <FramerPage> … </FramerPage>.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";

/* page shell */
export function FramerPage({ children }: { children: ReactNode }) {
  return <div className="framer"><div className="f-page">{children}</div></div>;
}

export function PageHeader({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div>
      {eyebrow && <div className="f-eyebrow">{eyebrow}</div>}
      <h1 className="f-h1" style={{ marginTop: eyebrow ? 12 : 0 }}>{title}</h1>
      {lead && <p className="f-lead">{lead}</p>}
    </div>
  );
}

/* hairline feature grid */
export const Board = ({ children }: { children: ReactNode }) => <div className="f-board">{children}</div>;
export const Cell = ({ children }: { children: ReactNode }) => <div className="f-cell">{children}</div>;
export function CellFoot({ title, arrow, children }: { title: string; arrow?: boolean; children?: ReactNode }) {
  return (
    <>
      <h3 className="f-cell-h">{title}{arrow && <span className="ar">→</span>}</h3>
      {children && <p className="f-cell-p">{children}</p>}
    </>
  );
}

/* mono badge */
export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "good" | "risk" }) {
  return <span className={`f-badge${tone !== "accent" ? " " + tone : ""}`}>{children}</span>;
}

/* status pill — maps common deal/deliverable states to a tone */
const PILL_TONE: Record<string, string> = {
  Paid: "ok", Completed: "ok", Approved: "ok", Resolved: "ok",
  "In Progress": "work", Accepted: "work", Designing: "work", Writing: "work", Open: "work",
  Raised: "wait", "Payment Pending": "wait", Awaiting: "wait", "Needs More Info": "wait", "Client Review": "wait",
  Rejected: "no", Blocked: "no", Cancelled: "no",
};
export function StatusPill({ status }: { status: string }) {
  const tone = PILL_TONE[status] ?? "mute";
  return <span className={`f-pill ${tone}`}>{status}</span>;
}

/* ring stat — big mono number + a thin accent ring */
export function RingStat({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct: number }) {
  const r = 25, C = 2 * Math.PI * r, dash = Math.max(0, Math.min(1, pct / 100)) * C;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--f-faint)" }}>{label}</div>
        <div className="f-num" style={{ fontSize: 30, marginTop: 4 }}>{value}</div>
        {sub && <div className="mono" style={{ fontSize: 11, color: "var(--f-dim)", marginTop: 6 }}>{sub}</div>}
      </div>
      <div style={{ position: "relative", width: 64, height: 64, flex: "none" }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#20202c" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`} transform="rotate(-90 32 32)" />
        </svg>
        <b className="mono" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", fontSize: 12, color: "var(--accent-2)" }}>
          {Math.round(pct)}%
        </b>
      </div>
    </div>
  );
}

/* progress-bar card (Core-Web-Vitals style) */
export function ProgressCard({ title, badge, rows }: {
  title?: string; badge?: { label: string; tone: "good" | "risk" | "accent" };
  rows: { label: string; value: string; pct: number; color?: string }[];
}) {
  return (
    <div className="f-stat">
      {(title || badge) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          {title && <span style={{ fontSize: 13, color: "var(--f-dim)" }}>{title}</span>}
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--f-dim)", marginBottom: 6 }}>
              <span>{r.label}</span><b className="f-num" style={{ fontSize: 12 }}>{r.value}</b>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "#1c1c22", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(100, r.pct)}%`, background: r.color ?? "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* status dot grid */
export function DotGrid({ dots }: { dots: { color: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {dots.map((d, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />)}
    </div>
  );
}

/* leaderboard / ranked list */
export function RankList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none", fontSize: 13.5 }}>
          <span className="mono" style={{ color: "var(--accent-2)", width: 18 }}>{i + 1}</span>
          <span style={{ flex: 1, color: "var(--f-ink)" }}>{r.label}</span>
          <span className="f-num" style={{ fontSize: 13 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* generic data table (deals, deliverables, payments) */
export function DataTable<T>({ columns, rows, empty }: {
  columns: { key: keyof T | string; label: string; align?: "right"; width?: string | number; render?: (row: T) => ReactNode }[];
  rows: T[]; empty?: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
        <thead>
          <tr>{columns.map((c, i) => (
            <th
              key={i}
              style={{
                textAlign: c.align ?? "left",
                fontFamily: "'Geist Mono',monospace",
                fontSize: 9.5,
                letterSpacing: ".12em",
                color: "var(--f-faint)",
                padding: "0 24px 10px 0",
                borderBottom: "1px solid var(--f-line)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                width: c.width,
              }}
            >
              {c.label}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: "24px 0", textAlign: "center", color: "var(--f-faint)" }}>{empty ?? "Nothing here yet."}</td></tr>
          ) : rows.map((row, ri) => (
            <tr key={ri}>{columns.map((c, ci) => (
              <td
                key={ci}
                style={{
                  textAlign: c.align ?? "left",
                  padding: "12px 24px 12px 0",
                  borderBottom: "1px solid rgba(255,255,255,.05)",
                  color: "var(--f-ink)",
                  whiteSpace: c.align === "right" ? "nowrap" : undefined,
                  verticalAlign: "middle",
                }}
              >
                {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? "")}
              </td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
