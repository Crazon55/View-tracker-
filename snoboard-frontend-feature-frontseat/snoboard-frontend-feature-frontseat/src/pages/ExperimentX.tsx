import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  canEditExperimentX,
  getPlaybookAccess,
} from "@/lib/permissions";
import { buildPlaybookContext, PLAYBOOK_CONFIGS, type PlaybookId } from "@/lib/playbookExperimentConfig";
import { PlaybookExperimentContext, usePlaybook } from "@/lib/playbookExperimentContext";
import { deployExpIdeaToPlaybook } from "@/services/api";

/** React Query keys scoped per playbook — prevents stale data when switching playbooks. */
function expQk(playbookId: string, ...parts: unknown[]) {
  return ["exp", playbookId, ...parts];
}

const EXP_STALE_MS = 30_000;

/** Patch one idea in all cached exp queries for this playbook — avoids refetching the full bank on every save. */
function mergeExpIdeaInCaches(qc: QueryClient, playbookId: string, ideaId: string, patch: Record<string, unknown>) {
  qc.setQueriesData<any[]>({ queryKey: ["exp", playbookId] }, (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((i) => (i.id === ideaId ? { ...i, ...patch } : i));
  });
}

function expIdeaUpdateMutationOpts(
  qc: QueryClient,
  playbookId: string,
  api: { updateIdea: (id: string, data: Record<string, unknown>) => Promise<any> },
  hooks?: { onDetail?: (id: string, patch: Record<string, unknown>) => void },
) {
  return {
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.updateIdea(id, data),
    onMutate: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await qc.cancelQueries({ queryKey: ["exp", playbookId] });
      const snapshots = qc.getQueriesData<any[]>({ queryKey: ["exp", playbookId] });
      mergeExpIdeaInCaches(qc, playbookId, id, data);
      hooks?.onDetail?.(id, data);
      return { snapshots };
    },
    onError: (e: unknown, _v: unknown, ctx: { snapshots?: [unknown, unknown][] } | undefined) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key as any, data));
      toast.error(e instanceof Error ? e.message : "Failed to update");
    },
    onSuccess: (updated: any, { id, data }: { id: string; data: Record<string, unknown> }) => {
      const patch = updated?.id ? updated : data;
      mergeExpIdeaInCaches(qc, playbookId, id, patch);
      hooks?.onDetail?.(id, patch);
      if ("views" in data || "page_views" in data || "page_test_results" in data || "status" in data) {
        qc.invalidateQueries({ queryKey: expQk(playbookId, "working-ideas") });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Constants (shared across playbooks)
// ---------------------------------------------------------------------------
const STAGES = ["new","approved","base_edit","testing","proven_ideas","scheduled","posted","kill"] as const;
type IdeaStage = (typeof STAGES)[number];

const STAGE_LABEL: Record<IdeaStage, string> = {
  new:          "New",
  approved:     "Approved",
  base_edit:    "Base edit",
  testing:      "Testing",
  proven_ideas: "Proven",
  scheduled:    "Scheduled",
  posted:       "Posted",
  kill:         "Killed",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  new:          { bg: "rgba(74,127,212,0.15)",   text: "#7BB0FF" },
  approved:     { bg: "rgba(45,158,95,0.15)",    text: "#5AE0A0" },
  base_edit:    { bg: "rgba(123,97,196,0.15)",   text: "#B49EFF" },
  testing:      { bg: "rgba(212,149,42,0.15)",   text: "#F0C060" },
  proven_ideas: { bg: "rgba(29,158,117,0.15)",   text: "#50E0B0" },
  scheduled:    { bg: "rgba(83,74,183,0.15)",    text: "#9B8FFF" },
  posted:       { bg: "rgba(45,158,95,0.15)",    text: "#5AE0A0" },
  kill:         { bg: "rgba(201,59,59,0.15)",    text: "#FF7070" },
  // legacy fallbacks
  draft:        { bg: "rgba(74,127,212,0.15)",   text: "#7BB0FF" },
  killed:       { bg: "rgba(201,59,59,0.15)",    text: "#FF7070" },
};

type TabMode = "idea-bank" | "content-bank" | "working-ideas" | "frontseat" | "calendar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDay(s: string) {
  if (!s || s === "unknown") return "Unknown";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonthLabel(year: number, month: number) {
  return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupByDay<T extends { day_date?: string }>(items: T[]): [string, T[]][] {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const key = (item.day_date || "").slice(0, 10) || "unknown";
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

function computeCurrentWeek(startDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const today = new Date();
  const delta = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(delta / 7) + 1);
}

function getMonday(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return toLocalISO(x);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

function fmtShortDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTimeLabel(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (h == null || m == null) return t;
  const hr = parseInt(h, 10);
  if (isNaN(hr)) return t;
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 || 12;
  return `${h12}:${m.padStart(2, "0")} ${ampm}`;
}

function ideaPages(idea: any): string[] {
  return (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
}

type CalEntry = { idea: any; page: string; date: string; time: string; caption: string; status: string };

const CALENDAR_STATUSES = new Set(["testing", "proven_ideas"]);

/** Pages that have a posting date set (from page_handle + page_posting_dates keys). */
function calendarPagesForIdea(idea: any): string[] {
  const dates = (idea.page_posting_dates || {}) as Record<string, string>;
  const fromHandle = ideaPages(idea);
  const keys = new Set([...fromHandle, ...Object.keys(dates)]);
  return [...keys].filter(pg => (dates[pg] || "").slice(0, 10));
}

function buildCalendarEntries(
  ideas: any[], weekStart: string, weekEnd: string, pageFilter: string, search: string,
): CalEntry[] {
  const q = search.toLowerCase().trim();
  const out: CalEntry[] = [];
  for (const idea of ideas) {
    if (idea.frontseat_pool) continue;
    const status = idea.status || "";
    if (!CALENDAR_STATUSES.has(status)) continue;

    const dates = (idea.page_posting_dates || {}) as Record<string, string>;
    const times = (idea.page_posting_times || {}) as Record<string, string>;
    const captions = (idea.page_captions || {}) as Record<string, string>;
    for (const page of calendarPagesForIdea(idea)) {
      const date = (dates[page] || "").slice(0, 10);
      if (!date || date < weekStart || date > weekEnd) continue;
      if (pageFilter !== "all" && page !== pageFilter) continue;
      const caption = captions[page] || "";
      if (q && !(idea.topic || "").toLowerCase().includes(q) && !caption.toLowerCase().includes(q)) continue;
      out.push({ idea, page, date, time: times[page] || "", caption, status });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.page.localeCompare(b.page));
}

// Shared input/button styles
const inp: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
  fontSize: 12, background: "#09090b", color: "#e4e4e7", outline: "none", width: "100%",
  boxSizing: "border-box",
};
const sel: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
  fontSize: 12, background: "#09090b", color: "#e4e4e7", cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  padding: "6px 16px", borderRadius: 7, border: "none",
  background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 7, border: "1px solid #3f3f46",
  background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Inline views editor
// ---------------------------------------------------------------------------
function ViewsEdit({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to edit views"
        style={{ cursor: "pointer", color: value > 0 ? "#50E0B0" : "#52525b", fontSize: 12, fontWeight: 600, minWidth: 36 }}
      >
        {value > 0 ? fmt(value) : "—"}
      </span>
    );
  }
  const save = () => {
    setEditing(false);
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n !== value) onSave(n);
  };
  return (
    <input
      autoFocus value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      style={{ width: 80, ...inp, padding: "2px 6px", color: "#50E0B0", fontWeight: 600 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Day accordion
// ---------------------------------------------------------------------------
function DayGroup({ dateStr, count, children }: { dateStr: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer",
          color: "#71717a", fontSize: 11, fontWeight: 600, padding: "2px 0", marginBottom: 6, width: "100%",
        }}
      >
        <span style={{ color: open ? "#7c3aed" : "#3f3f46", fontSize: 9 }}>{open ? "▼" : "▶"}</span>
        <span style={{ color: "#a1a1aa" }}>{fmtDay(dateStr)}</span>
        <span style={{ color: "#52525b", fontWeight: 400 }}>· {count} idea{count !== 1 ? "s" : ""}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 14 }}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-playbook deploy + view breakdown
// ---------------------------------------------------------------------------
const ALL_PLAYBOOK_IDS: PlaybookId[] = ["bpb", "xf", "tech"];

function DeployedFromBadge({ idea }: { idea: any }) {
  const from = idea.deployed_from?.playbook as PlaybookId | undefined;
  if (!from || !PLAYBOOK_CONFIGS[from]) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "rgba(124,58,237,0.12)",
      borderRadius: 4, padding: "1px 6px",
    }}>
      From {PLAYBOOK_CONFIGS[from].label}
    </span>
  );
}

function CrossPlaybookViewsBlock({ idea }: { idea: any }) {
  const { id: playbookId, label: playbookLabel } = usePlaybook();
  const cv = idea.cross_playbook_views as Record<string, number> | undefined;
  if (!cv || !cv.total) return null;
  const otherPlaybooks = ALL_PLAYBOOK_IDS.filter(
    pb => pb !== playbookId && (cv[pb] || 0) > 0,
  );
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1f1f22" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#50E0B0", marginBottom: 3 }}>
        {fmt(cv.total)} cross-playbook
      </div>
      {(cv.own || 0) > 0 && (
        <div style={{ fontSize: 9, color: "#71717a" }}>{playbookLabel}: {fmt(cv.own)}</div>
      )}
      {otherPlaybooks.map(pb => (
        <div key={pb} style={{ fontSize: 9, color: "#71717a" }}>
          {PLAYBOOK_CONFIGS[pb].label}: {fmt(cv[pb] || 0)}
        </div>
      ))}
    </div>
  );
}

function DeployPlaybookModal({ idea, open, onClose }: { idea: any; open: boolean; onClose: () => void }) {
  const { id: sourcePlaybookId } = usePlaybook();
  const { role } = usePermissions();
  const qc = useQueryClient();

  const targets = useMemo(() => {
    const deployed = new Set<string>(idea.deployed_to_playbooks || []);
    return ALL_PLAYBOOK_IDS.filter(pb =>
      pb !== sourcePlaybookId
      && canEditExperimentX(role, pb)
      && !deployed.has(pb),
    );
  }, [idea.deployed_to_playbooks, role, sourcePlaybookId]);

  const deployMut = useMutation({
    mutationFn: (target: PlaybookId) =>
      deployExpIdeaToPlaybook(target, sourcePlaybookId, idea.id),
    onSuccess: (_, target) => {
      qc.invalidateQueries({ queryKey: expQk(target, "idea-bank") });
      qc.invalidateQueries({ queryKey: expQk(sourcePlaybookId, "idea-bank") });
      toast.success(`Added to ${PLAYBOOK_CONFIGS[target].label}`);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to deploy idea"),
  });

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#18181b", border: "1px solid #3f3f46", borderRadius: 12,
          padding: "22px 24px", width: "100%", maxWidth: 380,
        }}
      >
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>
          Use in another playbook
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#71717a", lineHeight: 1.45 }}>
          Copies <strong style={{ color: "#e4e4e7" }}>{idea.topic || "Untitled"}</strong> plus frame / drive links only.
          Views, baselines, and scheduling stay separate per playbook.
        </p>
        {targets.length === 0 ? (
          <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>
            No other playbooks available (already deployed or no edit access).
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {targets.map(pb => (
              <button
                key={pb}
                type="button"
                disabled={deployMut.isPending}
                onClick={() => deployMut.mutate(pb)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 14px", borderRadius: 8, border: "1px solid #3f3f46",
                  background: "#111113", color: "#e4e4e7", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16 }}>{PLAYBOOK_CONFIGS[pb].emoji}</span>
                {PLAYBOOK_CONFIGS[pb].label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16, width: "100%", padding: "8px 0", border: "none",
            background: "transparent", color: "#71717a", fontSize: 12, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeployToPlaybookButton({ idea, readOnly }: { idea: any; readOnly?: boolean }) {
  const { role } = usePermissions();
  const { id: playbookId } = usePlaybook();
  const [open, setOpen] = useState(false);
  const canDeploy = canEditExperimentX(role, playbookId);

  if (readOnly || !canDeploy) return null;

  return (
    <>
      <button
        type="button"
        title="Use in another playbook"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{
          fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "rgba(124,58,237,0.15)",
          border: "1px solid rgba(124,58,237,0.35)", borderRadius: 4, padding: "2px 7px",
          cursor: "pointer", flexShrink: 0,
        }}
      >
        → Playbook
      </button>
      <DeployPlaybookModal idea={idea} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const OPS_KANBAN_STAGES = ["testing", "proven_ideas"] as const;

function opsCardScheduleSummary(idea: any): { date: string; time: string } {
  const pages = ideaPages(idea);
  const dates = (idea.page_posting_dates || {}) as Record<string, string>;
  const times = (idea.page_posting_times || {}) as Record<string, string>;
  const scanPages = pages.length ? pages : Object.keys(dates);
  let bestDate = "";
  let bestTime = "";
  for (const pg of scanPages) {
    const d = (dates[pg] || "").slice(0, 10);
    if (d && (!bestDate || d < bestDate)) {
      bestDate = d;
      bestTime = times[pg] || "";
    }
  }
  return { date: bestDate, time: bestTime };
}

function opsCardBaselineTag(idea: any) {
  const pages = ideaPages(idea);
  const results = (idea.page_test_results || {}) as Record<string, string>;
  const RANK: Record<string, number> = { top_line: 4, above_baseline: 3, baseline: 2, below_baseline: 1 };
  let best = idea.test_result || "";
  for (const pg of pages) {
    const r = results[pg];
    if (r && (RANK[r] || 0) > (RANK[best] || 0)) best = r;
  }
  return TEST_RESULTS.find(t => t.value === best);
}

/** Content Ops — kanban card with schedule, views, baseline, frame & comp links. */
function OpsKanbanCard({ idea, onClick }: { idea: any; onClick: () => void }) {
  const { pageColors } = usePlaybook();
  const pages = ideaPages(idea);
  const isTesting = idea.status === "testing";
  const testCfg = opsCardBaselineTag(idea);
  const borderColor = isTesting && testCfg ? testCfg.color : "#27272a";
  const hoverBorder = isTesting && testCfg ? testCfg.color : "#3f3f46";
  const { date: pgDate, time: pgTime } = opsCardScheduleSummary(idea);
  const viewCount = (idea.views || 0) > 0 ? idea.views : 0;

  return (
    <div
      onClick={onClick}
      style={{
        background: isTesting && testCfg ? testCfg.bg : "#18181b",
        border: `1.5px solid ${borderColor}`,
        borderLeft: isTesting && testCfg ? `4px solid ${testCfg.color}` : `1.5px solid ${borderColor}`,
        borderRadius: 9,
        padding: "10px 12px", marginBottom: 6, cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = hoverBorder)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = borderColor)}
    >
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#e4e4e7", lineHeight: 1.35 }}>
        {idea.topic || <em style={{ color: "#52525b", fontWeight: 400 }}>Untitled</em>}
      </p>
      {pages.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {pages.map((pg: string) => {
            const pgc = pageColors[pg] || "#a1a1aa";
            return (
              <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "1px 6px" }}>
                {pg}
              </span>
            );
          })}
        </div>
      )}
      <p style={{ margin: "0 0 6px", fontSize: 11, color: pgDate ? "#a78bfa" : "#52525b" }}>
        {pgDate ? `${fmtShortDate(pgDate)}${pgTime ? ` · ${fmtTimeLabel(pgTime)}` : ""}` : "No posting date"}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: viewCount > 0 ? "#50E0B0" : "#52525b" }}>
          {viewCount > 0 ? `${fmt(viewCount)} views` : "— views"}
        </span>
        {idea.frame_link && (
          <a
            href={idea.frame_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 10, color: "#4A7FD4", fontWeight: 600 }}
          >
            Frame ↗
          </a>
        )}
        {idea.comp_link && (
          <a
            href={idea.comp_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 10, color: "#D4952A", fontWeight: 600 }}
          >
            Comp ↗
          </a>
        )}
      </div>
      {testCfg && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: testCfg.color, background: testCfg.bg, borderRadius: 4, padding: "2px 8px" }}>
            {testCfg.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban card (used in Idea Bank board)
// ---------------------------------------------------------------------------
function KanbanCard({ idea, onUpdate, onDelete, onClick, readOnly }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onClick: () => void;
  readOnly?: boolean;
}) {
  const { pages: playbookPages, pageColors, pageShort, api, id: playbookId } = usePlaybook();
  const pages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const pc = pageColors[pages[0]] || "#a1a1aa";
  const isTesting = idea.status === "testing";
  const testCfg = isTesting ? TEST_RESULTS.find(r => r.value === idea.test_result) : null;
  const borderColor = testCfg ? testCfg.color : "#27272a";
  const hoverBorder = testCfg ? testCfg.color : "#3f3f46";
  return (
    <div
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", idea.id); }}
      onClick={onClick}
      style={{
        background: testCfg ? testCfg.bg : "#18181b",
        border: `1.5px solid ${borderColor}`,
        borderLeft: testCfg ? `4px solid ${testCfg.color}` : `1.5px solid ${borderColor}`,
        borderRadius: 9,
        padding: "10px 12px", marginBottom: 6, cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = hoverBorder)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = borderColor)}
    >
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#e4e4e7", lineHeight: 1.35 }}>
        {idea.topic || <em style={{ color: "#52525b", fontWeight: 400 }}>Untitled</em>}
      </p>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {pages.map((pg: string) => {
          const pgc = pageColors[pg] || "#a1a1aa";
          return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "1px 6px" }}>{pg}</span>;
        })}
        <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 4, padding: "1px 6px" }}>
          {idea.content_type}
        </span>
        {idea.video_format && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#50E0B0", background: "rgba(80,224,176,0.1)", borderRadius: 4, padding: "1px 6px" }}>
            {idea.video_format}
          </span>
        )}
        {(idea.views || 0) > 0 && !idea.cross_playbook_views && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#50E0B0", marginLeft: "auto" }}>
            {fmt(idea.views)}
          </span>
        )}
        <DeployedFromBadge idea={idea} />
        <DeployToPlaybookButton idea={idea} readOnly={readOnly} />
      </div>
      <CrossPlaybookViewsBlock idea={idea} />
      {idea.script && (
        <p style={{ margin: "6px 0 0", fontSize: 10, color: "#52525b", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
          {idea.script}
        </p>
      )}
      {testCfg && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: testCfg.color, background: testCfg.bg, borderRadius: 4, padding: "2px 8px" }}>
            {testCfg.label}
          </span>
        </div>
      )}
      {(idea.created_by || idea.edited_by) && (
        <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #1f1f22", paddingTop: 6 }}>
          {idea.created_by && (
            <span style={{ fontSize: 11, color: "#71717a" }}>
              <span style={{ color: "#52525b", fontSize: 10 }}>Created by </span>{idea.created_by}
            </span>
          )}
          {idea.edited_by && (
            <span style={{ fontSize: 11, color: "#a78bfa", background: "rgba(124,58,237,0.1)", borderRadius: 4, padding: "2px 7px", fontWeight: 500 }}>
              Edited by {idea.edited_by}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Always-visible views input used when idea is in Posted stage
function PostedViewsInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(value > 0 ? String(value) : ""); }, [value]);
  const save = () => {
    dirty.current = false;
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n !== value) onSave(n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder="e.g. 85000"
        onChange={e => { dirty.current = true; setDraft(e.target.value); }}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); }}
        style={{
          width: 160, padding: "9px 13px", border: "1.5px solid #2D9E5F",
          borderRadius: 9, fontSize: 14, fontWeight: 700,
          outline: "none", background: "#09090b", color: "#50E0B0",
          boxSizing: "border-box",
        }}
      />
      {value > 0 && (
        <span style={{ fontSize: 13, color: "#50E0B0", fontWeight: 600 }}>{fmt(value)}</span>
      )}
    </div>
  );
}

// Compact per-page views input (used in multi-page ideas)
function PerPageViewInput({ value, pageColor, onSave }: { value: number; pageColor: string; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(value > 0 ? String(value) : ""); }, [value]);
  const save = () => {
    dirty.current = false;
    const n = parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n !== value) onSave(n);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder="e.g. 85000"
        onChange={e => { dirty.current = true; setDraft(e.target.value); }}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); }}
        style={{
          width: 140, padding: "7px 11px", border: `1.5px solid ${pageColor}66`,
          borderRadius: 8, fontSize: 13, fontWeight: 700,
          outline: "none", background: "#09090b", color: pageColor,
          boxSizing: "border-box",
        }}
      />
      {value > 0 && <span style={{ fontSize: 12, color: pageColor, fontWeight: 600 }}>{fmt(value)}</span>}
    </div>
  );
}

// Stage action buttons — same progression as Content Tracker
const STAGE_ACTIONS: Record<string, { label: string; stage: string; bg: string; color: string }[]> = {
  new:          [{ label: "Approve", stage: "approved", bg: "#7c3aed", color: "#fff" }, { label: "Reject", stage: "kill", bg: "transparent", color: "#C93B3B" }],
  approved:     [{ label: "Start base edit", stage: "base_edit", bg: "#7c3aed", color: "#fff" }],
  base_edit:    [{ label: "Start testing", stage: "testing", bg: "#7c3aed", color: "#fff" }],
  testing:      [{ label: "Proven / Batch edit", stage: "proven_ideas", bg: "#1D9E75", color: "#fff" }, { label: "Kill it", stage: "kill", bg: "transparent", color: "#C93B3B" }],
  proven_ideas: [{ label: "Schedule", stage: "scheduled", bg: "#534AB7", color: "#fff" }],
  scheduled:    [{ label: "Mark posted", stage: "posted", bg: "#2D9E5F", color: "#fff" }],
  posted: [], kill: [],
};

// Inline save text input — same as SafeTextInput in ContentTracker
function SafeField({ value, onSave, placeholder, style, readOnly }: { value: string | null; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties; readOnly?: boolean }) {
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
  if (readOnly) {
    return <span style={{ fontSize: 13, color: value ? "#e4e4e7" : "#52525b", ...style }}>{value || placeholder || "—"}</span>;
  }
  return (
    <input
      value={local}
      onChange={e => { dirty.current = true; setLocal(e.target.value); }}
      onBlur={() => { const next = local.trim(); dirty.current = false; if (next !== (value || "").trim()) onSave(next); }}
      placeholder={placeholder}
      style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, outline: "none", background: "#09090b", color: "#e4e4e7", boxSizing: "border-box", ...style }}
    />
  );
}

function SafeArea({ value, onSave, placeholder, rows, readOnly }: { value: string; onSave: (v: string) => void; placeholder?: string; rows?: number; readOnly?: boolean }) {
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
  if (readOnly) {
    return <p style={{ margin: 0, fontSize: 13, color: value ? "#e4e4e7" : "#52525b", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{value || placeholder || "—"}</p>;
  }
  return (
    <textarea
      value={local} rows={rows || 3}
      onChange={e => { dirty.current = true; setLocal(e.target.value); }}
      onBlur={() => { dirty.current = false; if (local !== value) onSave(local); }}
      placeholder={placeholder}
      style={{ width: "100%", padding: "9px 13px", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, outline: "none", background: "#09090b", color: "#e4e4e7", boxSizing: "border-box", resize: "vertical", minHeight: 60 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Idea detail modal — full Content Tracker parity
// ---------------------------------------------------------------------------
function IdeaDetailModal({ idea, onUpdate, onDelete, onClose, hideStageActions, readOnly }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  hideStageActions?: boolean;
  readOnly?: boolean;
}) {
  const { pages: playbookPages, pageColors, pageShort } = usePlaybook();
  const stage = idea.status || "new";
  const ss = STATUS_STYLE[stage] || STATUS_STYLE.new;
  const primaryPage = (idea.page_handle || "").split(",")[0].trim();
  const pc = pageColors[primaryPage] || "#a1a1aa";
  const actions = STAGE_ACTIONS[stage] || [];
  const selectedPages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const noEdit = readOnly || hideStageActions;

  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", background: "#18181b", borderRadius: 16,
          padding: "24px 28px", maxWidth: 680, width: "94%",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid #27272a",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {/* Title + close */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          {readOnly ? (
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>
              {idea.topic || <em style={{ color: "#52525b", fontWeight: 400 }}>Untitled</em>}
            </p>
          ) : (
            <SafeField
              value={idea.topic}
              onSave={v => onUpdate(idea.id, { topic: v })}
              placeholder="Topic / hook"
              style={{ fontSize: 16, fontWeight: 600, color: "#fff", border: "none", background: "transparent", padding: "0" }}
            />
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#71717a", padding: "0 4px", flexShrink: 0 }}>✕</button>
        </div>

        {/* Stage + source + page tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: ss.bg, color: ss.text }}>
            {STAGE_LABEL[stage] || stage}
          </span>
          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: idea.source === "competitor" ? "#EEEDFE" : "#E8F5EE", color: idea.source === "competitor" ? "#534AB7" : "#1A5E3A", fontWeight: 500 }}>
            {idea.source === "competitor" ? "Competitor" : "Original"}
          </span>
          {selectedPages.map((pg: string) => {
            const pgc = pageColors[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: pgc + "22", color: pgc, fontWeight: 600 }}>{pg}</span>;
          })}
          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "#27272a", color: "#71717a" }}>
            {idea.content_type}
          </span>
          <DeployedFromBadge idea={idea} />
          <DeployToPlaybookButton idea={idea} readOnly={readOnly} />
        </div>
        <CrossPlaybookViewsBlock idea={idea} />

        {/* Stage action buttons */}
        {!noEdit && actions.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {actions.map(a => (
              <button
                key={a.stage}
                onClick={() => onUpdate(idea.id, { status: a.stage })}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: a.bg === "transparent" ? `1.5px solid ${a.color}` : "none",
                  background: a.bg, color: a.color, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Page selector — multi-select, only visible in Testing and Proven stages */}
        {(stage === "testing" || stage === "proven_ideas") && (
          <div>
            <label style={ls}>Pages (select all that apply)</label>
            {readOnly ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selectedPages.map((pg: string) => {
                  const c = pageColors[pg] || "#a1a1aa";
                  return <span key={pg} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: c + "22", color: c, fontWeight: 600 }}>{pg}</span>;
                })}
              </div>
            ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {playbookPages.map(p => {
                const c = pageColors[p] || "#a1a1aa";
                const active = selectedPages.includes(p);
                return (
                  <button key={p} type="button" onClick={() => {
                    const next = active
                      ? selectedPages.filter((x: string) => x !== p)
                      : [...selectedPages, p];
                    if (next.length > 0) onUpdate(idea.id, { page_handle: next.join(",") });
                  }} style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: active ? `2px solid ${c}` : "1.5px solid #3f3f46",
                    background: active ? c + "22" : "#18181b",
                    color: active ? c : "#71717a",
                  }}>{p}</button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Video format */}
        <div>
          <label style={ls}>Video format</label>
          {readOnly ? (
            <span style={{ fontSize: 13, color: idea.video_format ? "#50E0B0" : "#52525b" }}>{idea.video_format || "—"}</span>
          ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VIDEO_FORMATS.map(fmt => {
              const active = idea.video_format === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onUpdate(idea.id, { video_format: active ? "" : fmt })}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    border: active ? "2px solid #50E0B0" : "1.5px solid #3f3f46",
                    background: active ? "rgba(80,224,176,0.12)" : "#18181b",
                    color: active ? "#50E0B0" : "#71717a",
                  }}
                >{fmt}</button>
              );
            })}
          </div>
          )}
        </div>

        {/* Hook variations */}
        <div>
          <label style={ls}>Hook variations</label>
          <SafeArea
            readOnly={readOnly}
            value={idea.hook_variations || ""}
            onSave={v => onUpdate(idea.id, { hook_variations: v })}
            placeholder="One hook per line"
            rows={3}
          />
        </div>

        {/* Music ref */}
        <div>
          <label style={ls}>Music reference / suggestions</label>
          <SafeField readOnly={readOnly} value={idea.music_ref} onSave={v => onUpdate(idea.id, { music_ref: v })} placeholder="e.g. Dark cinematic, trending audio" />
        </div>

        {/* Frame link */}
        <div>
          <label style={ls}>Frame link</label>
          <SafeField readOnly={readOnly} value={idea.frame_link} onSave={v => onUpdate(idea.id, { frame_link: v })} placeholder="Google Drive / reference frames link" />
          {idea.frame_link && <a href={idea.frame_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block", marginTop: 4 }}>{idea.frame_link}</a>}
        </div>

        {/* YT link + timestamps */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={ls}>YT link (original source)</label>
            <SafeField readOnly={readOnly} value={idea.yt_url} onSave={v => onUpdate(idea.id, { yt_url: v })} placeholder="https://youtube.com/watch?v=..." />
          </div>
          <div style={{ flex: "0 0 140px" }}>
            <label style={ls}>YT timestamps</label>
            <SafeField readOnly={readOnly} value={idea.yt_timestamps} onSave={v => onUpdate(idea.id, { yt_timestamps: v })} placeholder="0:30–1:45" />
          </div>
        </div>
        {idea.yt_url && <a href={idea.yt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all" }}>{idea.yt_url}</a>}

        {/* Comp link */}
        <div>
          <label style={ls}>Comp link</label>
          <SafeField readOnly={readOnly} value={idea.comp_link} onSave={v => onUpdate(idea.id, { comp_link: v })} placeholder="Competitor reel / post URL" />
          {idea.comp_link && <a href={idea.comp_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block", marginTop: 4 }}>{idea.comp_link}</a>}
        </div>

        {/* Per-page views — shown when 2+ pages are selected */}
        {selectedPages.length > 1 ? (
          <div>
            <label style={ls}>Views per page</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedPages.map((pg: string) => {
                const pgc = pageColors[pg] || "#a1a1aa";
                const pgViews = ((idea.page_views || {}) as Record<string, number>)[pg] || 0;
                return (
                  <div key={pg} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: pgc,
                      background: pgc + "22", borderRadius: 5, padding: "3px 10px",
                      minWidth: 140, textAlign: "center",
                    }}>{pg}</span>
                    <PerPageViewInput
                      value={pgViews}
                      pageColor={pgc}
                      onSave={v => {
                        const updated: Record<string, number> = { ...(idea.page_views || {}), [pg]: v };
                        const total = Object.values(updated).reduce((acc, val) => acc + (Number(val) || 0), 0);
                        onUpdate(idea.id, { page_views: updated, views: total });
                      }}
                    />
                  </div>
                );
              })}
              {(idea.views || 0) > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4, borderTop: "1px solid #27272a" }}>
                  <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Total</span>
                  <span style={{ fontSize: 13, color: "#50E0B0", fontWeight: 700 }}>{fmt(idea.views)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Single page or no pages — always-visible input when posted, click-to-edit otherwise */
          <div>
            <label style={ls}>Views</label>
            {stage === "posted" ? (
              <PostedViewsInput value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ViewsEdit value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />
                <span style={{ fontSize: 11, color: "#52525b" }}>(click to edit)</span>
              </div>
            )}
          </div>
        )}

        {/* Test result — only in Testing stage */}
        {stage === "testing" && (
          <div>
            <label style={ls}>Testing result</label>
            {selectedPages.length > 1 ? (
              /* Per-page test results */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedPages.map((pg: string) => {
                  const pgc = pageColors[pg] || "#a1a1aa";
                  const pgResult = ((idea.page_test_results || {}) as Record<string, string>)[pg] || "";
                  return (
                    <div key={pg}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: pgc, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: pgc }}>{pg}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {TEST_RESULTS.map(({ value, label, color, bg }) => {
                          const active = pgResult === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                const updated: Record<string, string> = { ...(idea.page_test_results || {}), [pg]: active ? "" : value };
                                if (!updated[pg]) delete updated[pg];
                                // derive overall test_result as the best result across all pages
                                const RANK: Record<string, number> = { top_line: 4, above_baseline: 3, baseline: 2, below_baseline: 1 };
                                const best = Object.values(updated).reduce<string>((b, c) => (RANK[c] || 0) > (RANK[b] || 0) ? c : b, "");
                                onUpdate(idea.id, { page_test_results: updated, test_result: best });
                              }}
                              style={{
                                padding: "6px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                border: active ? `2px solid ${color}` : "1.5px solid #3f3f46",
                                background: active ? bg : "#18181b",
                                color: active ? color : "#71717a",
                              }}
                            >{label}</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single-page test result */
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TEST_RESULTS.map(({ value, label, color, bg }) => {
                  const active = idea.test_result === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onUpdate(idea.id, { test_result: active ? "" : value })}
                      style={{
                        padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: "pointer",
                        border: active ? `2px solid ${color}` : "1.5px solid #3f3f46",
                        background: active ? bg : "#18181b",
                        color: active ? color : "#71717a",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Per-page scheduling — CS sets date/time/caption */}
        {!readOnly && (
          <PerPageIdeaPanel idea={idea} onUpdate={onUpdate} canEditSchedule canEditPerformance={false} showFrameLink={false} showCompLink={false} />
        )}

        {/* Edited by */}
        <div>
          <label style={ls}>Edited by</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Pulkit", "Varun"].map(name => {
              const active = idea.edited_by === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onUpdate(idea.id, { edited_by: active ? "" : name })}
                  style={{
                    padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", border: active ? "2px solid #7c3aed" : "1.5px solid #3f3f46",
                    background: active ? "#7c3aed22" : "#18181b",
                    color: active ? "#a78bfa" : "#71717a",
                  }}
                >{name}</button>
              );
            })}
            {idea.edited_by && (
              <button
                type="button"
                onClick={() => onUpdate(idea.id, { edited_by: "" })}
                style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: "1.5px solid #3f3f46", background: "transparent", color: "#52525b" }}
              >Clear</button>
            )}
          </div>
        </div>

        {/* Delete — only shown when explicitly allowed (not in Frontseat) */}
        {onDelete && !readOnly && (
          <button
            onClick={() => { if (confirm("Delete this idea?")) { onDelete(idea.id); onClose(); } }}
            style={{ padding: "9px 20px", background: "transparent", color: "#FF7070", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", marginTop: 4 }}
          >
            Delete idea
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive card (Content Bank) — clickable, opens full IdeaDetailModal
// ---------------------------------------------------------------------------
function ArchiveRow({ item, onUpdate, onDelete, readOnly }: { item: any; onUpdate: (id: string, data: any) => void; onDelete: (id: string) => void; readOnly?: boolean }) {
  const { pageColors } = usePlaybook();
  const [detailOpen, setDetailOpen] = useState(false);
  const pages = (item.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const ss = STATUS_STYLE[item.status || "new"] || STATUS_STYLE.new;

  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        style={{
          background: "#111113", border: "1px solid #27272a", borderRadius: 8,
          cursor: "pointer", transition: "border-color 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#3f3f46")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#27272a")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
          {pages.map((pg: string) => {
            const pgc = pageColors[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "2px 7px" }}>{pg}</span>;
          })}
          <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>{item.content_type}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: ss.text, background: ss.bg, borderRadius: 4, padding: "2px 6px" }}>{STAGE_LABEL[item.status] || item.status}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
          </span>
          {item.created_by && (
            <span style={{ fontSize: 11, color: "#71717a", whiteSpace: "nowrap" }}>
              <span style={{ color: "#52525b", fontSize: 10 }}>by </span>{item.created_by}
            </span>
          )}
          {item.edited_by && (
            <span style={{ fontSize: 11, color: "#a78bfa", background: "rgba(124,58,237,0.1)", borderRadius: 4, padding: "2px 7px", fontWeight: 500, whiteSpace: "nowrap" }}>
              Edited by {item.edited_by}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: item.views > 0 ? "#50E0B0" : "#3f3f46" }}>
            {item.views > 0 ? fmt(item.views) : "—"}
          </span>
          <span style={{ fontSize: 10, color: "#52525b" }}>Open →</span>
        </div>
      </div>

      {detailOpen && (
        <IdeaDetailModal
          idea={item}
          readOnly={readOnly}
          onUpdate={onUpdate}
          onDelete={readOnly ? undefined : onDelete}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Working idea detail modal — fetches full idea from exp_idea_bank by source_id
// ---------------------------------------------------------------------------
function WorkingIdeaDetailModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { pageColors, api, id: playbookId } = usePlaybook();
  const { data: fullIdea, isLoading } = useQuery({
    queryKey: expQk(playbookId, "idea-by-id", item.source_id),
    queryFn: () => api.getIdeaById(item.source_id),
    enabled: !!item.source_id,
  });

  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 13px", border: "1.5px solid #27272a", borderRadius: 9, fontSize: 13, background: "#09090b", color: "#e4e4e7", boxSizing: "border-box" };
  const pc = pageColors[item.page_handle] || "#a1a1aa";
  const idea = fullIdea || item;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", background: "#18181b", borderRadius: 16,
        padding: "24px 28px", maxWidth: 620, width: "94%",
        maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid #27272a",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>{item.topic || "Untitled"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#71717a" }}>✕</button>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 99, padding: "3px 10px" }}>{item.page_handle}</span>
          <span style={{ fontSize: 11, color: "#71717a", background: "#27272a", borderRadius: 99, padding: "3px 10px" }}>{item.content_type}</span>
          <span style={{ fontSize: 11, color: "#71717a", background: "#27272a", borderRadius: 99, padding: "3px 10px" }}>Week {item.week_number}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#50E0B0", marginLeft: "auto" }}>{fmt(item.views_achieved)} views</span>
        </div>

        {isLoading ? (
          <p style={{ color: "#52525b", fontSize: 12 }}>Loading idea content…</p>
        ) : (
          <>
            <div>
              <label style={ls}>Hook variations</label>
              <pre style={{ ...fieldStyle, margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", color: idea.hook_variations ? "#e4e4e7" : "#3f3f46", minHeight: 60 }}>
                {idea.hook_variations || "No hook variations added"}
              </pre>
            </div>
            <div>
              <label style={ls}>Script / notes</label>
              <pre style={{ ...fieldStyle, margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", color: idea.script ? "#e4e4e7" : "#3f3f46", minHeight: 60 }}>
                {idea.script || "No script added"}
              </pre>
            </div>
            <div>
              <label style={ls}>Music reference</label>
              <div style={{ ...fieldStyle, color: idea.music_ref ? "#e4e4e7" : "#3f3f46" }}>{idea.music_ref || "—"}</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={ls}>YT link</label>
                {idea.yt_url
                  ? <a href={idea.yt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block" }}>{idea.yt_url}</a>
                  : <div style={{ ...fieldStyle, color: "#3f3f46" }}>—</div>
                }
              </div>
              <div style={{ flex: "0 0 140px" }}>
                <label style={ls}>Timestamps</label>
                <div style={{ ...fieldStyle, color: idea.yt_timestamps ? "#e4e4e7" : "#3f3f46" }}>{idea.yt_timestamps || "—"}</div>
              </div>
            </div>
            <div>
              <label style={ls}>Frame link</label>
              {idea.frame_link
                ? <a href={idea.frame_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block" }}>{idea.frame_link}</a>
                : <div style={{ ...fieldStyle, color: "#3f3f46" }}>—</div>
              }
            </div>
            <div>
              <label style={ls}>Comp link</label>
              {idea.comp_link
                ? <a href={idea.comp_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block" }}>{idea.comp_link}</a>
                : <div style={{ ...fieldStyle, color: "#3f3f46" }}>—</div>
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Rank badge config — only within Proven Ideas
const RANK_CONFIG: Record<number, { text: string; bg: string; border: string; label: string }> = {
  1: { text: "#F0C060", bg: "rgba(240,192,96,0.12)", border: "rgba(240,192,96,0.4)", label: "#1" },
  2: { text: "#C0C8D8", bg: "rgba(192,200,216,0.08)", border: "rgba(192,200,216,0.25)", label: "#2" },
  3: { text: "#CD9060", bg: "rgba(205,144,96,0.08)", border: "rgba(205,144,96,0.25)", label: "#3" },
};

// ---------------------------------------------------------------------------
// Working idea card
// ---------------------------------------------------------------------------
function WorkingRow({ item, rank, onDistribute, readOnly }: { item: any; rank: number; onDistribute: (id: string) => void; readOnly?: boolean }) {
  const { pageColors } = usePlaybook();
  const [detailOpen, setDetailOpen] = useState(false);
  const pages = (item.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const rankCfg = RANK_CONFIG[rank];

  const borderColor = rankCfg
    ? rankCfg.border
    : item.distributed ? "#27272a" : "#4c1d95";
  const hoverBorder = rankCfg
    ? rankCfg.text + "99"
    : item.distributed ? "#3f3f46" : "#7c3aed";

  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        style={{
          background: rankCfg ? rankCfg.bg : "#111113",
          border: `1px solid ${borderColor}`,
          borderLeft: rankCfg ? `3px solid ${rankCfg.text}` : undefined,
          borderRadius: 8, overflow: "hidden",
          opacity: item.distributed ? 0.6 : 1,
          cursor: "pointer",
          transition: "border-color 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = hoverBorder)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = borderColor)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          {/* Rank badge */}
          {rankCfg ? (
            <span style={{
              fontSize: 10, fontWeight: 800, color: rankCfg.text,
              background: rankCfg.bg, border: `1px solid ${rankCfg.border}`,
              borderRadius: 4, padding: "1px 7px", flexShrink: 0,
            }}>{rankCfg.label}</span>
          ) : (
            <span style={{ fontSize: 10, color: "#3f3f46", minWidth: 22, textAlign: "right", flexShrink: 0 }}>
              #{rank}
            </span>
          )}

          {pages.map((pg: string) => {
            const pgc = pageColors[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "2px 7px" }}>{pg}</span>;
          })}
          <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
            Week {item.week_number}
          </span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
          </span>
          {item.created_by && (
            <span style={{ fontSize: 11, color: "#71717a", whiteSpace: "nowrap" }}>
              <span style={{ color: "#52525b", fontSize: 10 }}>by </span>{item.created_by}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: rankCfg ? rankCfg.text : "#50E0B0", whiteSpace: "nowrap" }}>
            {fmt(item.views_achieved)}
          </span>
          {item.distributed ? (
            <span style={{ fontSize: 10, color: "#52525b", fontStyle: "italic" }}>Distributed</span>
          ) : !readOnly ? (
            <button
              onClick={e => { e.stopPropagation(); onDistribute(item.id); }}
              style={{ ...btnPrimary, padding: "4px 12px", fontSize: 11 }}
            >
              Distribute to all pages
            </button>
          ) : null}
          <span style={{ fontSize: 10, color: "#52525b" }}>Open →</span>
        </div>
      </div>

      {detailOpen && (
        <WorkingIdeaDetailModal item={item} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add idea modal — matches Content Tracker "Add new idea" form exactly
// ---------------------------------------------------------------------------
function AddIdeaModal({ open, onAdd, onClose }: {
  open: boolean;
  onAdd: (d: any) => void;
  onClose: () => void;
}) {
  const { pages: playbookPages, pageColors } = usePlaybook();
  const { user } = useAuth();
  const createdBy = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  const [page, setPage]               = useState("");
  const [type, setType]               = useState("reel");
  const [source, setSource]           = useState("original");
  const [videoFormat, setVideoFormat] = useState("");
  const [topic, setTopic]             = useState("");
  const [hookVars, setHookVars]       = useState("");
  const [musicRef, setMusicRef]       = useState("");
  const [frameLink, setFrameLink]     = useState("");
  const [ytUrl, setYtUrl]             = useState("");
  const [ytTs, setYtTs]               = useState("");
  const [compLink, setCompLink]       = useState("");
  const [date, setDate]               = useState(toLocalISO(new Date()));

  const reset = () => {
    setPage(playbookPages[0]); setType("reel"); setSource("original"); setVideoFormat("");
    setTopic(""); setHookVars(""); setMusicRef(""); setFrameLink("");
    setYtUrl(""); setYtTs(""); setCompLink(""); setDate(toLocalISO(new Date()));
  };

  const submit = () => {
    if (!topic.trim()) return;
    onAdd({
      page_handle: page, content_type: type, status: "new",
      topic: topic.trim(), source, hook_variations: hookVars,
      music_ref: musicRef, frame_link: frameLink,
      yt_url: source === "original" ? ytUrl : "",
      yt_timestamps: source === "original" ? ytTs : "",
      comp_link: source === "competitor" ? compLink : "",
      created_by: createdBy, day_date: date, video_format: videoFormat,
    });
    reset();
  };

  if (!open) return null;

  // Shared label + input styles matching Content Tracker exactly
  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };
  const is: React.CSSProperties = { width: "100%", padding: "9px 13px", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, outline: "none", background: "#09090b", color: "#e4e4e7", boxSizing: "border-box" };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", background: "#18181b", borderRadius: 16,
          padding: "24px 28px", maxWidth: 520, width: "94%",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid #27272a",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Add new idea</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#71717a", padding: "4px 8px", borderRadius: 6 }}>✕</button>
        </div>

        {/* Title */}
        <div>
          <label style={ls}>Title / description *</label>
          <input
            autoFocus value={topic} onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. How Ambani built his first business"
            style={{ ...is, color: "#e4e4e7" }}
          />
        </div>

        {/* Source + Page */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={ls}>Source</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["original", "competitor"].map(s => (
                <button
                  key={s} onClick={() => setSource(s)}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: source === s ? "2px solid #7c3aed" : "1.5px solid #3f3f46",
                    background: source === s ? "#27272a" : "#18181b",
                    color: source === s ? "#fff" : "#71717a",
                    textTransform: "capitalize",
                  }}
                >
                  {s === "original" ? "Original" : "Competitor"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Type + Date */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={ls}>Content type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["reel", "post"].map(t => (
                <button key={t} onClick={() => setType(t)} style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: type === t ? "2px solid #7c3aed" : "1.5px solid #3f3f46",
                  background: type === t ? "#27272a" : "#18181b",
                  color: type === t ? "#fff" : "#71717a",
                  textTransform: "capitalize",
                }}>
                  {t === "reel" ? "Reel" : "Post"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={ls}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...is, color: "#e4e4e7" }} />
          </div>
        </div>

        {/* Created by */}
        <div>
          <label style={ls}>Created by</label>
          <div style={{ ...is, background: "#27272a", color: "#a1a1aa" }}>{createdBy || "—"}</div>
        </div>

        {/* Video format */}
        <div>
          <label style={ls}>Video format</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {VIDEO_FORMATS.map(fmt => (
              <button
                key={fmt} type="button"
                onClick={() => setVideoFormat(v => v === fmt ? "" : fmt)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  border: videoFormat === fmt ? "2px solid #50E0B0" : "1.5px solid #3f3f46",
                  background: videoFormat === fmt ? "rgba(80,224,176,0.12)" : "#18181b",
                  color: videoFormat === fmt ? "#50E0B0" : "#71717a",
                }}
              >{fmt}</button>
            ))}
          </div>
        </div>

        {/* Hook variations */}
        <div>
          <label style={ls}>Hook variations (one per line)</label>
          <textarea
            value={hookVars} onChange={e => setHookVars(e.target.value)}
            rows={4} placeholder={"Hook variation 1\nHook variation 2\nHook variation 3"}
            style={{ ...is, resize: "vertical", minHeight: 80, color: "#e4e4e7" }}
          />
        </div>

        {/* Music ref */}
        <div>
          <label style={ls}>Music reference / suggestions</label>
          <input value={musicRef} onChange={e => setMusicRef(e.target.value)}
            placeholder="e.g. Dark cinematic, trending audio XYZ" style={{ ...is, color: "#e4e4e7" }} />
        </div>

        {/* Frame link */}
        <div>
          <label style={ls}>Frame link</label>
          <input value={frameLink} onChange={e => setFrameLink(e.target.value)}
            placeholder="Google Drive / reference frames link" style={{ ...is, color: "#e4e4e7" }} />
        </div>

        {/* YT / Comp links */}
        {source === "original" && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={ls}>YT link (original source)</label>
              <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..." style={{ ...is, color: "#e4e4e7" }} />
            </div>
            <div style={{ flex: "0 0 140px" }}>
              <label style={ls}>YT timestamps</label>
              <input value={ytTs} onChange={e => setYtTs(e.target.value)}
                placeholder="0:30–1:45" style={{ ...is, color: "#e4e4e7" }} />
            </div>
          </div>
        )}
        {source === "competitor" && (
          <div>
            <label style={ls}>Comp link</label>
            <input value={compLink} onChange={e => setCompLink(e.target.value)}
              placeholder="Competitor reel / post URL" style={{ ...is, color: "#e4e4e7" }} />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submit} disabled={!topic.trim()}
          style={{
            padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none",
            borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: !topic.trim() ? 0.4 : 1, marginTop: 4,
          }}
        >
          Add idea
        </button>
      </div>
    </div>
  );
}

// Video format options
const VIDEO_FORMATS = [
  "Viral a-roll",
  "A-roll massy",
  "A-roll info",
  "News",
  "Shark Tank",
  "Creator videos",
] as const;

// Testing performance result config
const TEST_RESULTS = [
  { value: "below_baseline", label: "Below baseline", color: "#C93B3B", bg: "rgba(201,59,59,0.12)" },
  { value: "baseline",       label: "Baseline",       color: "#D4952A", bg: "rgba(212,149,42,0.12)" },
  { value: "above_baseline", label: "Above baseline", color: "#4A7FD4", bg: "rgba(74,127,212,0.12)"  },
  { value: "top_line",       label: "Top line",       color: "#2D9E5F", bg: "rgba(45,158,95,0.12)"  },
] as const;

// ---------------------------------------------------------------------------
// Per-page panel — schedule (CS) + performance (ops intern)
// ---------------------------------------------------------------------------
function PerPageIdeaPanel({ idea, onUpdate, canEditSchedule, canEditPerformance, canEditCaption, showSchedule = true, showFrameLink = true, showCompLink = true }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  canEditSchedule?: boolean;
  canEditPerformance?: boolean;
  canEditCaption?: boolean;
  showSchedule?: boolean;
  showFrameLink?: boolean;
  showCompLink?: boolean;
}) {
  const { pageColors } = usePlaybook();
  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };
  const pages = ideaPages(idea);
  const stage = idea.status || "new";
  const editCaption = canEditCaption ?? !!canEditSchedule;

  const patchPageField = (field: "page_posting_dates" | "page_posting_times" | "page_captions", page: string, value: string) => {
    const cur = { ...(idea[field] || {}) } as Record<string, string>;
    if (value) cur[page] = value;
    else delete cur[page];
    onUpdate(idea.id, { [field]: cur });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 0 4px", borderTop: "1px solid #27272a" }}>
      {showSchedule && showFrameLink && (
        <div>
          <label style={ls}>Frame link</label>
          {idea.frame_link ? (
            <a href={idea.frame_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#4A7FD4", wordBreak: "break-all" }}>{idea.frame_link}</a>
          ) : (
            <span style={{ fontSize: 13, color: "#52525b" }}>—</span>
          )}
        </div>
      )}

      {showSchedule && showCompLink && (
        <div>
          <label style={ls}>Comp link</label>
          {idea.comp_link ? (
            <a href={idea.comp_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#D4952A", wordBreak: "break-all" }}>{idea.comp_link}</a>
          ) : (
            <span style={{ fontSize: 13, color: "#52525b" }}>—</span>
          )}
        </div>
      )}

      {!pages.length ? (
        <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>No pages assigned yet.</p>
      ) : pages.map(pg => {
        const pgc = pageColors[pg] || "#a1a1aa";
        const pgDate = ((idea.page_posting_dates || {}) as Record<string, string>)[pg] || "";
        const pgTime = ((idea.page_posting_times || {}) as Record<string, string>)[pg] || "";
        const pgCaption = ((idea.page_captions || {}) as Record<string, string>)[pg] || "";
        const pgViews = ((idea.page_views || {}) as Record<string, number>)[pg] || 0;
        const pgResult = ((idea.page_test_results || {}) as Record<string, string>)[pg] || "";

        return (
          <div key={pg} style={{ padding: "12px 14px", background: "#111113", borderRadius: 10, border: "1px solid #27272a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: pgc, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: pgc }}>{pg}</span>
            </div>

            {showSchedule && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={ls}>Posting date</label>
                    {canEditSchedule ? (
                      <input type="date" value={pgDate.slice(0, 10)} onChange={e => patchPageField("page_posting_dates", pg, e.target.value)} style={inp} />
                    ) : (
                      <span style={{ fontSize: 13, color: "#e4e4e7" }}>{pgDate ? fmtShortDate(pgDate.slice(0, 10)) : "—"}</span>
                    )}
                  </div>
                  <div style={{ flex: "0 0 130px" }}>
                    <label style={ls}>Posting time</label>
                    {canEditSchedule ? (
                      <input type="time" value={pgTime} onChange={e => patchPageField("page_posting_times", pg, e.target.value)} style={inp} />
                    ) : (
                      <span style={{ fontSize: 13, color: "#e4e4e7" }}>{pgTime ? fmtTimeLabel(pgTime) : "—"}</span>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: canEditPerformance ? 10 : 0 }}>
                  <label style={ls}>Caption</label>
                  {editCaption ? (
                    <SafeArea value={pgCaption} onSave={v => patchPageField("page_captions", pg, v)} placeholder="Instagram caption" rows={3} />
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: pgCaption ? "#e4e4e7" : "#52525b", whiteSpace: "pre-wrap" }}>{pgCaption || "—"}</p>
                  )}
                </div>
              </>
            )}

            {canEditPerformance && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={ls}>Views</label>
                  {canEditPerformance ? (
                    pages.length > 1 ? (
                      <PerPageViewInput value={pgViews} pageColor={pgc} onSave={v => {
                        const updated: Record<string, number> = { ...(idea.page_views || {}), [pg]: v };
                        const total = Object.values(updated).reduce((acc, val) => acc + (Number(val) || 0), 0);
                        onUpdate(idea.id, { page_views: updated, views: total });
                      }} />
                    ) : (
                      stage === "posted"
                        ? <PostedViewsInput value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />
                        : <ViewsEdit value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />
                    )
                  ) : (
                    <span style={{ fontSize: 13, color: "#50E0B0", fontWeight: 600 }}>{(pages.length > 1 ? pgViews : idea.views) > 0 ? fmt(pages.length > 1 ? pgViews : idea.views) : "—"}</span>
                  )}
                </div>
                <div>
                  <label style={ls}>Baseline / top line</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TEST_RESULTS.map(({ value, label, color, bg }) => {
                      const active = (pages.length > 1 ? pgResult : idea.test_result) === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!canEditPerformance}
                          onClick={() => {
                            if (!canEditPerformance) return;
                            if (pages.length > 1) {
                              const updated: Record<string, string> = { ...(idea.page_test_results || {}), [pg]: active ? "" : value };
                              if (!updated[pg]) delete updated[pg];
                              const RANK: Record<string, number> = { top_line: 4, above_baseline: 3, baseline: 2, below_baseline: 1 };
                              const best = Object.values(updated).reduce<string>((b, c) => (RANK[c] || 0) > (RANK[b] || 0) ? c : b, "");
                              onUpdate(idea.id, { page_test_results: updated, test_result: best });
                            } else {
                              onUpdate(idea.id, { test_result: active ? "" : value });
                            }
                          }}
                          style={{
                            padding: "6px 13px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                            cursor: canEditPerformance ? "pointer" : "default",
                            border: active ? `2px solid ${color}` : "1.5px solid #3f3f46",
                            background: active ? bg : "#18181b",
                            color: active ? color : "#71717a",
                          }}
                        >{label}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContentOpsIdeaModal({ idea, onUpdate, onClose, viewOnly }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onClose: () => void;
  viewOnly?: boolean;
}) {
  const { pageColors } = usePlaybook();
  const stage = idea.status || "new";
  const ss = STATUS_STYLE[stage] || STATUS_STYLE.new;
  const selectedPages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", background: "#18181b", borderRadius: 16,
          padding: "24px 28px", maxWidth: 560, width: "94%",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid #27272a",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>
              {idea.topic || <em style={{ color: "#52525b", fontWeight: 400 }}>Untitled</em>}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: ss.bg, color: ss.text }}>
                {STAGE_LABEL[stage] || stage}
              </span>
              {selectedPages.map((pg: string) => {
                const c = pageColors[pg] || "#a1a1aa";
                return <span key={pg} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: c + "22", color: c, fontWeight: 600 }}>{pg}</span>;
              })}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#71717a", padding: "0 4px" }}>✕</button>
        </div>
        <PerPageIdeaPanel
          idea={idea}
          onUpdate={onUpdate}
          canEditSchedule={!viewOnly}
          canEditPerformance={!viewOnly}
          canEditCaption={false}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar tab — page-wise week view of testing + proven ideas by posting date/time
// ---------------------------------------------------------------------------
function CalendarTab({ pageFilter, search, opsOnly, calendarViewOnly }: {
  pageFilter: string;
  search: string;
  opsOnly?: boolean;
  calendarViewOnly?: boolean;
}) {
  const { pageColors, pageShort, pages: playbookPages, api, id: playbookId } = usePlaybook();
  const { role } = usePermissions();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [detailIdea, setDetailIdea] = useState<any>(null);
  const days = weekDays(weekStart);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayStr = toLocalISO(new Date());

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: expQk(playbookId, "calendar-ideas"),
    queryFn: () => api.getIdeaBank({ enrich_cross: false }),
    staleTime: EXP_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const updateMut = useMutation(expIdeaUpdateMutationOpts(qc, playbookId, api, {
    onDetail: (id, patch) => setDetailIdea((prev: any) => prev?.id === id ? { ...prev, ...patch } : prev),
  }));

  const weekEnd = addDays(weekStart, 6);
  const calEntries = useMemo(
    () => buildCalendarEntries(ideas as any[], weekStart, weekEnd, pageFilter, search),
    [ideas, weekStart, weekEnd, pageFilter, search],
  );

  const displayPages = useMemo(() => {
    if (pageFilter !== "all") return [pageFilter];
    return [...playbookPages];
  }, [pageFilter, playbookPages]);

  const calReadOnly = calendarViewOnly ?? false;

  const openIdea = (entry: CalEntry) => {
    if (opsOnly) {
      setDetailIdea(entry.idea);
      return;
    }
    if (calReadOnly) return;
    setDetailIdea(entry.idea);
  };

  const renderCalCard = (entry: CalEntry) => {
    const pgResult = ((entry.idea.page_test_results || {}) as Record<string, string>)[entry.page] || entry.idea.test_result;
    const tr = TEST_RESULTS.find(t => t.value === pgResult);
    const pgViews = ((entry.idea.page_views || {}) as Record<string, number>)[entry.page];
    const stageSs = STATUS_STYLE[entry.status] || STATUS_STYLE.testing;
    return (
      <div
        key={`${entry.idea.id}-${entry.page}-${entry.date}`}
        onClick={() => openIdea(entry)}
        style={{
          padding: "6px 8px", marginBottom: 4, borderRadius: 6,
          cursor: calReadOnly && !opsOnly ? "default" : "pointer",
          background: "#18181b", border: "1px solid #27272a",
        }}
      >
        {entry.time ? (
          <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 700, color: "#D4952A" }}>{fmtTimeLabel(entry.time)}</p>
        ) : (
          <p style={{ margin: "0 0 3px", fontSize: 9, color: "#52525b" }}>No time set</p>
        )}
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#fff", lineHeight: 1.3,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
          {entry.idea.topic || "Untitled"}
        </p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: stageSs.bg, color: stageSs.text }}>
            {STAGE_LABEL[entry.status as IdeaStage] || entry.status}
          </span>
          {(pgViews || 0) > 0 && (
            <span style={{ fontSize: 9, color: "#50E0B0", fontWeight: 600 }}>{fmt(pgViews)}</span>
          )}
          {tr && <span style={{ fontSize: 9, fontWeight: 600, color: tr.color }}>{tr.label}</span>}
        </div>
      </div>
    );
  };

  if (isLoading) return <p style={{ color: "#52525b", fontSize: 12, padding: "20px 0" }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={btnSecondary}>← Prev</button>
        <button onClick={() => setWeekStart(getMonday(new Date()))} style={btnSecondary}>Today</button>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={btnSecondary}>Next →</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
          {fmtShortDate(weekStart)} – {fmtShortDate(weekEnd)}
        </span>
        <span style={{ fontSize: 12, color: "#52525b" }}>{calEntries.length} post{calEntries.length !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: 11, color: "#71717a" }}>Testing & Proven only</span>
        {calReadOnly && !opsOnly && <span style={{ fontSize: 11, color: "#71717a" }}>View only</span>}
      </div>

      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #27272a" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `minmax(120px, 150px) repeat(7, minmax(130px, 1fr))`,
          minWidth: 900,
          background: "#27272a",
          gap: 1,
        }}>
          {/* Header row */}
          <div style={{ background: "#111113", padding: "10px 12px" }} />
          {days.map((day, i) => {
            const isToday = day === todayStr;
            return (
              <div key={day} style={{ background: isToday ? "#1a1a14" : "#111113", padding: "8px 10px", textAlign: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: isToday ? "#D4952A" : "#71717a", display: "block" }}>{dayLabels[i]}</span>
                <span style={{ fontSize: 14, fontWeight: isToday ? 700 : 500, color: isToday ? "#fff" : "#a1a1aa" }}>
                  {new Date(day + "T00:00:00").getDate()}
                </span>
              </div>
            );
          })}

          {/* Page rows */}
          {displayPages.map(page => {
            const c = pageColors[page] || "#7c3aed";
            const short = pageShort[page] || page;
            const rowHasItems = calEntries.some(e => e.page === page);
            if (pageFilter === "all" && !rowHasItems) return null;

            return (
              <Fragment key={page}>
                <div
                  style={{
                    background: "#111113", padding: "10px 12px",
                    display: "flex", alignItems: "flex-start", gap: 8,
                    borderTop: "1px solid #27272a",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: c, lineHeight: 1.2 }}>{short}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 9, color: "#52525b", lineHeight: 1.2 }}>{page}</p>
                  </div>
                </div>
                {days.map(day => {
                  const isToday = day === todayStr;
                  const dayItems = calEntries
                    .filter(e => e.page === page && e.date === day)
                    .sort((a, b) => a.time.localeCompare(b.time));
                  return (
                    <div
                      key={`${page}-${day}`}
                      style={{
                        background: isToday ? "#1a1a14" : "#111113",
                        padding: 6, minHeight: 88,
                        borderTop: "1px solid #27272a",
                      }}
                    >
                      {dayItems.length === 0 ? (
                        <p style={{ fontSize: 10, color: "#3f3f46", textAlign: "center", padding: "16px 4px", margin: 0 }}>—</p>
                      ) : dayItems.map(renderCalCard)}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      {calEntries.length === 0 && (
        <p style={{ fontSize: 12, color: "#52525b", marginTop: 16, textAlign: "center" }}>
          No Testing or Proven ideas with a posting date this week. Set posting dates on ideas in those stages.
        </p>
      )}

      {detailIdea && opsOnly && (
        <ContentOpsIdeaModal
          idea={detailIdea}
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onClose={() => setDetailIdea(null)}
        />
      )}
      {detailIdea && !opsOnly && !calReadOnly && (
        <IdeaDetailModal
          idea={detailIdea}
          readOnly={!canEditExperimentX(role, playbookId)}
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onClose={() => setDetailIdea(null)}
        />
      )}
    </div>
  );
}

// Stage column dot colors
const STAGE_DOT: Record<string, string> = {
  new: "#4A7FD4", approved: "#2D9E5F", base_edit: "#7B61C4",
  testing: "#D4952A", proven_ideas: "#1D9E75", scheduled: "#534AB7",
  posted: "#2D9E5F", kill: "#C93B3B",
};

// ---------------------------------------------------------------------------
// Idea Bank tab — kanban board (same layout as Content Tracker)
// ---------------------------------------------------------------------------
function IdeaBankTab({ pageFilter, search, readOnly, opsOnly }: { pageFilter: string; search: string; readOnly?: boolean; opsOnly?: boolean }) {
  const { api, id: playbookId } = usePlaybook();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [addOpen, setAddOpen] = useState(false);
  const [detailIdea, setDetailIdea] = useState<any>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const autoArchiveDone = useRef(false);
  const migrationDone = useRef(false);

  const { data: settings } = useQuery({
    queryKey: expQk(playbookId, "settings"),
    queryFn: api.getSettings,
    staleTime: EXP_STALE_MS,
  });
  const currentWeek = useMemo(() => {
    const start = settings?.experiment_start_date;
    if (!start) return 1;
    return computeCurrentWeek(start);
  }, [settings]);

  // Auto-archive past weeks silently
  const archiveMut = useMutation({ mutationFn: api.archiveWeek });
  const { data: allIdeas = [] } = useQuery({
    queryKey: expQk(playbookId, "idea-bank-all"),
    queryFn: () => api.getIdeaBank({ enrich_cross: false }),
    enabled: !!settings,
    staleTime: EXP_STALE_MS,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!settings || autoArchiveDone.current || allIdeas.length === 0) return;
    const pastWeeks = [...new Set(
      allIdeas.filter((i: any) => i.week_number < currentWeek).map((i: any) => i.week_number as number)
    )];
    if (!pastWeeks.length) return;
    autoArchiveDone.current = true;
    pastWeeks.forEach(w => archiveMut.mutate(w, { onSuccess: () => qc.invalidateQueries({ queryKey: expQk(playbookId, "content-bank") }) }));
  }, [settings, allIdeas, currentWeek]);

  // One-time migration: posted → proven_ideas
  useEffect(() => {
    if (migrationDone.current || allIdeas.length === 0) return;
    const hasPosted = allIdeas.some((i: any) => i.status === "posted");
    if (!hasPosted) return;
    migrationDone.current = true;
    api.migratePostedToProven().then(() => {
      qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") });
      qc.invalidateQueries({ queryKey: expQk(playbookId, "content-bank-all") });
    });
  }, [allIdeas, api, playbookId, qc]);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: expQk(playbookId, "idea-bank", currentWeek, pageFilter),
    queryFn: () => api.getIdeaBank({
      week: currentWeek,
      page: pageFilter !== "all" ? pageFilter : undefined,
      enrich_cross: true,
    }),
    enabled: !!settings,
    staleTime: EXP_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: api.createIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }); setAddOpen(false); toast.success("Idea added"); },
    onError: (e: any) => toast.error(e?.message || "Failed to add idea"),
  });
  const updateMut = useMutation(expIdeaUpdateMutationOpts(qc, playbookId, api, {
    onDetail: (id, patch) => setDetailIdea((prev: any) => prev?.id === id ? { ...prev, ...patch } : prev),
  }));
  const deleteMut = useMutation({
    mutationFn: api.deleteIdea,
    onSuccess: () => qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }),
    onError: () => toast.error("Failed to delete"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const currentWeekIdeas = (ideas as any[]).filter((i: any) => !i.frontseat_pool);
    const currentIds = new Set(currentWeekIdeas.map((i: any) => i.id));
    // Keep testing ideas from past weeks visible in the Testing column
    const crossWeekTesting = (allIdeas as any[]).filter((i: any) =>
      i.status === "testing" && i.week_number < currentWeek && !i.frontseat_pool &&
      !currentIds.has(i.id) &&
      (pageFilter === "all" || (i.page_handle || "").split(",").some((p: string) => p.trim() === pageFilter))
    );
    const merged = [...currentWeekIdeas, ...crossWeekTesting];
    if (!q) return merged;
    return merged.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) || (i.script || "").toLowerCase().includes(q)
    );
  }, [ideas, allIdeas, currentWeek, pageFilter, search]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STAGES.forEach(s => { c[s] = 0; });
    filtered.forEach((i: any) => { const s = i.status || "new"; if (s in c) c[s]++; });
    return c;
  }, [filtered]);

  const opsFiltered = useMemo(() => {
    if (!opsOnly) return [];
    const q = search.toLowerCase().trim();
    const isOpsStage = (s: string) => s === "testing" || s === "proven_ideas";
    const currentWeekIdeas = (ideas as any[]).filter((i: any) => !i.frontseat_pool && isOpsStage(i.status || ""));
    const currentIds = new Set(currentWeekIdeas.map((i: any) => i.id));
    const crossWeek = (allIdeas as any[]).filter((i: any) =>
      isOpsStage(i.status || "") && i.week_number < currentWeek && !i.frontseat_pool &&
      !currentIds.has(i.id) &&
      (pageFilter === "all" || (i.page_handle || "").split(",").some((p: string) => p.trim() === pageFilter))
    );
    let merged = [...currentWeekIdeas, ...crossWeek];
    if (pageFilter !== "all") {
      merged = merged.filter((i: any) =>
        (i.page_handle || "").split(",").some((p: string) => p.trim() === pageFilter)
      );
    }
    if (q) merged = merged.filter((i: any) => (i.topic || "").toLowerCase().includes(q));
    return merged;
  }, [opsOnly, ideas, allIdeas, currentWeek, pageFilter, search]);

  const opsStageCounts = useMemo(() => {
    const c: Record<string, number> = { testing: 0, proven_ideas: 0 };
    opsFiltered.forEach((i: any) => {
      const s = i.status || "";
      if (s in c) c[s]++;
    });
    return c;
  }, [opsFiltered]);

  if (isLoading) return <p style={{ color: "#52525b", fontSize: 12, padding: "20px 0" }}>Loading…</p>;

  if (opsOnly) {
    return (
      <div>
        <p style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
          Week {currentWeek} · {opsFiltered.length} idea{opsFiltered.length !== 1 ? "s" : ""} · tap to edit posting date, views & baseline
        </p>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 20, minHeight: "calc(100vh - 260px)" }}>
          {OPS_KANBAN_STAGES.map(stage => {
            const stageIdeas = opsFiltered.filter((i: any) => (i.status || "") === stage);
            const dot = STAGE_DOT[stage] || "#71717a";
            return (
              <div key={stage} style={{ minWidth: 220, maxWidth: 280, flex: "1 0 220px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 2px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{STAGE_LABEL[stage as IdeaStage] || stage}</span>
                  <span style={{ fontSize: 12, color: "#52525b" }}>{opsStageCounts[stage] ?? stageIdeas.length}</span>
                </div>
                <div style={{ minHeight: 120 }}>
                  {stageIdeas.length === 0 ? (
                    <p style={{ fontSize: 11, color: "#3f3f46", textAlign: "center", padding: "24px 8px", border: "1.5px dashed #27272a", borderRadius: 8 }}>Empty</p>
                  ) : stageIdeas.map((idea: any) => (
                    <OpsKanbanCard key={idea.id} idea={idea} onClick={() => setDetailIdea(idea)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {detailIdea && (
          <ContentOpsIdeaModal
            idea={detailIdea}
            onUpdate={(id, data) => updateMut.mutate({ id, data })}
            onClose={() => setDetailIdea(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>Week {currentWeek} · {filtered.length} idea{filtered.length !== 1 ? "s" : ""}</span>
        {can('add_experiment_idea') && !readOnly && (
          <button onClick={() => setAddOpen(true)} style={{ ...btnPrimary, padding: "5px 14px" }}>
            + New idea
          </button>
        )}
      </div>

      <AddIdeaModal
        open={addOpen}
        onAdd={data => createMut.mutate(data)}
        onClose={() => setAddOpen(false)}
      />

      {/* Kanban board */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 20, minHeight: "calc(100vh - 260px)" }}>
        {STAGES.filter(s => s !== "kill" && s !== "scheduled" && s !== "posted").concat(["kill"] as IdeaStage[]).map(stage => (
          <div
            key={stage}
            style={{ minWidth: 200, maxWidth: 240, flex: "1 0 200px" }}
            onDragOver={readOnly ? undefined : e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropStage(stage); }}
            onDragLeave={readOnly ? undefined : () => setDropStage(null)}
            onDrop={readOnly ? undefined : e => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) updateMut.mutate({ id, data: { status: stage } });
              setDraggingId(null); setDropStage(null);
            }}
          >
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px 10px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STAGE_DOT[stage] || "#52525b", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_STYLE[stage]?.text || "#a1a1aa" }}>{STAGE_LABEL[stage]}</span>
              <span style={{ fontSize: 10, color: "#52525b", fontWeight: 500 }}>{stageCounts[stage] ?? 0}</span>
            </div>

            {/* Drop zone */}
            <div style={{
              minHeight: 60, padding: 2, borderRadius: 9,
              border: dropStage === stage ? "2px solid #7c3aed" : "2px solid transparent",
              background: dropStage === stage ? "rgba(124,58,237,0.05)" : "transparent",
              transition: "all 0.12s",
            }}>
              {filtered
                .filter((i: any) => (i.status || "new") === stage)
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((idea: any) => (
                  <div
                    key={idea.id}
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : e => { setDraggingId(idea.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", idea.id); }}
                    onDragEnd={readOnly ? undefined : () => { setDraggingId(null); setDropStage(null); }}
                    style={{ opacity: draggingId === idea.id ? 0.4 : 1, transition: "opacity 0.12s" }}
                  >
                    <KanbanCard
                      idea={idea}
                      readOnly={readOnly}
                      onUpdate={(id, data) => updateMut.mutate({ id, data })}
                      onDelete={id => deleteMut.mutate(id)}
                      onClick={() => setDetailIdea(idea)}
                    />
                  </div>
                ))
              }
              {(stageCounts[stage] ?? 0) === 0 && (
                <div style={{ padding: "20px 10px", textAlign: "center", color: "#3f3f46", fontSize: 11, border: "1.5px dashed #27272a", borderRadius: 9 }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {detailIdea && (
        <IdeaDetailModal
          idea={detailIdea}
          readOnly={readOnly}
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onDelete={readOnly ? undefined : id => deleteMut.mutate(id)}
          onClose={() => setDetailIdea(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Bank tab (full archive — month / week / day / search)
// ---------------------------------------------------------------------------
function ContentBankTab({ pageFilter, search, readOnly }: { pageFilter: string; search: string; readOnly?: boolean }) {
  const { api, id: playbookId } = usePlaybook();
  const qc = useQueryClient();
  const now = new Date();
  // null = all time; set to a specific month to filter
  const [monthFilter, setMonthFilter] = useState<{ year: number; month: number } | null>(null);

  const updateMut = useMutation(expIdeaUpdateMutationOpts(qc, playbookId, api));
  const deleteMut = useMutation({
    mutationFn: api.deleteIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: expQk(playbookId, "content-bank-all") }); qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }); },
    onError: () => toast.error("Failed to delete"),
  });
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const [dayFilter, setDayFilter]   = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "proven_ideas">("all");

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: expQk(playbookId, "content-bank-all", pageFilter),
    queryFn: () => api.getIdeaBank({
      page: pageFilter !== "all" ? pageFilter : undefined,
      enrich_cross: false,
    }),
    staleTime: EXP_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Show all ideas across all weeks — team decides topline/baseline from views + status
  const allValidItems = useMemo(() =>
    rawItems.filter((i: any) => i.status !== "new" && i.status !== "testing"),
    [rawItems]);

  // Apply optional month filter on top
  const monthItems = useMemo(() => {
    if (!monthFilter) return allValidItems;
    const ms = `${monthFilter.year}-${String(monthFilter.month + 1).padStart(2, "0")}-01`;
    const me = toLocalISO(new Date(monthFilter.year, monthFilter.month + 1, 0));
    return allValidItems.filter((i: any) => {
      const d = (i.day_date || "").slice(0, 10);
      return d >= ms && d <= me;
    });
  }, [allValidItems, monthFilter]);

  // Derive available months from all valid items for the navigator
  const availableMonths = useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    for (const i of allValidItems) {
      const d = (i.day_date || "").slice(0, 7); // "YYYY-MM"
      if (d && !seen.has(d)) {
        const [y, m] = d.split("-").map(Number);
        seen.set(d, { year: y, month: m - 1 });
      }
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(e => e[1]);
  }, [allValidItems]);

  // Helpers for the selected month label
  const monthStart = monthFilter
    ? `${monthFilter.year}-${String(monthFilter.month + 1).padStart(2, "0")}-01`
    : "";
  const monthEndStr = monthFilter ? toLocalISO(new Date(monthFilter.year, monthFilter.month + 1, 0)) : "";

  // Available weeks within this month (compute label from week_number)
  const weeksInMonth = useMemo(() => {
    const seen = new Map<number, string>();
    for (const i of monthItems) {
      if (!seen.has(i.week_number)) seen.set(i.week_number, `Week ${i.week_number}`);
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [monthItems]);

  // Apply week filter
  const weekFiltered = useMemo(() =>
    weekFilter === "all" ? monthItems : monthItems.filter((i: any) => i.week_number === weekFilter),
    [monthItems, weekFilter]);

  // Days available within selected week
  const daysInWeek = useMemo(() => {
    const seen = new Set<string>();
    for (const i of weekFiltered) {
      const d = (i.day_date || "").slice(0, 10);
      if (d) seen.add(d);
    }
    return [...seen].sort();
  }, [weekFiltered]);

  // Apply day filter
  const dayFiltered = useMemo(() =>
    dayFilter === "all" ? weekFiltered : weekFiltered.filter((i: any) => (i.day_date || "").slice(0, 10) === dayFilter),
    [weekFiltered, dayFilter]);

  // Apply search + status filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = dayFiltered;
    if (statusFilter !== "all") result = result.filter((i: any) => i.status === statusFilter);
    if (!q) return result;
    return result.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
  }, [dayFiltered, search, statusFilter]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div>
      {/* Month navigator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#27272a", borderRadius: 7, border: "1px solid #3f3f46", padding: "2px 4px" }}>
          <button
            onClick={() => { setMonthFilter(null); setWeekFilter("all"); setDayFilter("all"); }}
            style={{ padding: "4px 10px", background: !monthFilter ? "#3f3f46" : "none", border: "none", color: !monthFilter ? "#fff" : "#a1a1aa", cursor: "pointer", fontSize: 11, fontWeight: 600, borderRadius: 5 }}
          >All time</button>
          {availableMonths.map(({ year, month }) => {
            const active = monthFilter?.year === year && monthFilter?.month === month;
            return (
              <button
                key={`${year}-${month}`}
                onClick={() => { setMonthFilter({ year, month }); setWeekFilter("all"); setDayFilter("all"); }}
                style={{ padding: "4px 10px", background: active ? "#3f3f46" : "none", border: "none", color: active ? "#fff" : "#a1a1aa", cursor: "pointer", fontSize: 11, fontWeight: active ? 600 : 400, borderRadius: 5, whiteSpace: "nowrap" }}
              >{fmtMonthLabel(year, month)}</button>
            );
          })}
        </div>

        {/* Week filter */}
        {weeksInMonth.length > 0 && (
          <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
            <button
              onClick={() => { setWeekFilter("all"); setDayFilter("all"); }}
              style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: weekFilter === "all" ? "#3f3f46" : "transparent", color: weekFilter === "all" ? "#fff" : "#71717a" }}
            >All weeks</button>
            {weeksInMonth.map(([wn, label]) => (
              <button
                key={wn}
                onClick={() => { setWeekFilter(wn); setDayFilter("all"); }}
                style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: weekFilter === wn ? "#3f3f46" : "transparent", color: weekFilter === wn ? "#fff" : "#71717a" }}
              >{label}</button>
            ))}
          </div>
        )}

        {/* Day filter — only shows when a week is selected */}
        {weekFilter !== "all" && daysInWeek.length > 0 && (
          <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
            <button
              onClick={() => setDayFilter("all")}
              style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: dayFilter === "all" ? "#3f3f46" : "transparent", color: dayFilter === "all" ? "#fff" : "#71717a" }}
            >All days</button>
            {daysInWeek.map(d => (
              <button
                key={d}
                onClick={() => setDayFilter(d)}
                style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: dayFilter === d ? "#3f3f46" : "transparent", color: dayFilter === d ? "#fff" : "#71717a" }}
              >{fmtDay(d)}</button>
            ))}
          </div>
        )}

        {/* Status filter */}
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {([["all", "All"], ["approved", "Approved"], ["proven_ideas", "Proven"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              style={{
                padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer",
                background: statusFilter === val ? (val === "approved" ? "#1a3a2a" : val === "proven_ideas" ? "#1a1a3a" : "#3f3f46") : "transparent",
                color: statusFilter === val ? (val === "approved" ? "#4ade80" : val === "proven_ideas" ? "#a78bfa" : "#fff") : "#71717a",
              }}
            >{label}</button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: "#52525b" }}>{filtered.length} idea{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          {search ? "No ideas match your search." : allValidItems.length === 0 ? "No approved or proven ideas yet." : monthFilter ? "No ideas in this month." : "No ideas match the selected filters."}
        </p>
      ) : (
        grouped.map(([day, items]) => (
          <DayGroup key={day} dateStr={day} count={items.length}>
            {items.map(item => (
              <ArchiveRow
                key={item.id}
                item={item}
                readOnly={readOnly}
                onUpdate={(id, data) => updateMut.mutate({ id, data })}
                onDelete={id => deleteMut.mutate(id)}
              />
            ))}
          </DayGroup>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Working Ideas tab
// ---------------------------------------------------------------------------
function WorkingIdeasTab({ pageFilter, search, readOnly }: { pageFilter: string; search: string; readOnly?: boolean }) {
  const { pageColors, api, id: playbookId } = usePlaybook();
  const qc = useQueryClient();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [sortBy, setSortBy] = useState<"views" | "date">("views");

  const { data: settings } = useQuery({
    queryKey: expQk(playbookId, "settings"),
    queryFn: api.getSettings,
    staleTime: EXP_STALE_MS,
  });
  const viewGoal: number = settings?.view_goal ?? 100000;

  const updateSettingsMut = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: expQk(playbookId, "settings") }); setEditingGoal(false); toast.success("Goal updated"); },
    onError: (e: any) => toast.error(`Failed: ${e?.message || "unknown error"}`),
  });

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: expQk(playbookId, "working-ideas", pageFilter),
    queryFn: () => api.getWorkingIdeas({ page: pageFilter !== "all" ? pageFilter : undefined }),
    staleTime: EXP_STALE_MS,
  });

  const distributeMut = useMutation({
    mutationFn: api.distributeWorkingIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: expQk(playbookId, "working-ideas") }); toast.success("Marked as distributed"); },
    onError: () => toast.error("Failed to distribute"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const valid = ideas.filter((i: any) => i.source_id != null);
    const searched = !q ? valid : valid.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
    return [...searched].sort((a: any, b: any) =>
      sortBy === "views"
        ? (b.views_achieved || 0) - (a.views_achieved || 0)
        : new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime()
    );
  }, [ideas, search, sortBy]);

  const topIdea = filtered[0] ?? null;

  const saveGoal = () => {
    const n = parseInt(goalDraft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) updateSettingsMut.mutate({ view_goal: n });
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>View goal:</span>
        {editingGoal ? (
          <>
            <input
              autoFocus value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
              style={{ width: 100, ...inp, padding: "3px 8px", color: "#50E0B0", fontWeight: 700 }}
            />
            <button onClick={saveGoal} style={{ ...btnPrimary, padding: "4px 12px" }}>Save</button>
            <button onClick={() => setEditingGoal(false)} style={{ ...btnSecondary, padding: "4px 10px" }}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#50E0B0" }}>{fmt(viewGoal)} views</span>
            <button onClick={() => { setGoalDraft(String(viewGoal)); setEditingGoal(true); }} style={{ ...btnSecondary, padding: "3px 10px", fontSize: 11 }}>
              Edit goal
            </button>
          </>
        )}
        <span style={{ color: "#52525b", fontSize: 12 }}>· {ideas.length} proven idea{ideas.length !== 1 ? "s" : ""}</span>

        {/* Sort toggle */}
        <div style={{ marginLeft: "auto", display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          <button
            onClick={() => setSortBy("views")}
            style={{ padding: "4px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: sortBy === "views" ? "#534AB7" : "transparent", color: sortBy === "views" ? "#fff" : "#71717a" }}
          >Top views</button>
          <button
            onClick={() => setSortBy("date")}
            style={{ padding: "4px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: sortBy === "date" ? "#3f3f46" : "transparent", color: sortBy === "date" ? "#fff" : "#71717a" }}
          >Recent</button>
        </div>
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          {search ? "No ideas match your search." : `No ideas have crossed ${fmt(viewGoal)} views yet. Keep going!`}
        </p>
      ) : (
        <>
          {/* Top performer spotlight — only shown when sorted by views */}
          {sortBy === "views" && topIdea && (
            <div style={{
              marginBottom: 20, padding: "16px 20px",
              background: "linear-gradient(135deg, rgba(240,192,96,0.08) 0%, rgba(240,192,96,0.03) 100%)",
              border: "1.5px solid rgba(240,192,96,0.35)",
              borderLeft: "4px solid #F0C060",
              borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#F0C060", background: "rgba(240,192,96,0.15)", border: "1px solid rgba(240,192,96,0.4)", borderRadius: 4, padding: "2px 8px", letterSpacing: "0.04em" }}>
                      TOP IDEA
                    </span>
                    <span style={{ fontSize: 10, color: "#71717a" }}>Week {topIdea.week_number}</span>
                    {(() => {
                      const pages = (topIdea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                      return pages.map((pg: string) => {
                        const pgc = pageColors[pg] || "#a1a1aa";
                        return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "1px 6px" }}>{pg}</span>;
                      });
                    })()}
                  </div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.4 }}>
                    {topIdea.topic || <em style={{ color: "#52525b" }}>No topic</em>}
                  </p>
                  {topIdea.created_by && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#71717a" }}>by {topIdea.created_by}</p>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#F0C060", letterSpacing: "-0.02em" }}>
                    {fmt(topIdea.views_achieved)}
                  </div>
                  <div style={{ fontSize: 10, color: "#71717a", fontWeight: 500 }}>views achieved</div>
                </div>
              </div>
            </div>
          )}

          {/* Ranked list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((item, idx) => (
              <WorkingRow key={item.id} item={item} rank={idx + 1} readOnly={readOnly} onDistribute={id => distributeMut.mutate(id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Add — simplified form (title + source link + format)
// ---------------------------------------------------------------------------
function QuickAddModal({ open, onAdd, onClose }: {
  open: boolean; onAdd: (d: any) => void; onClose: () => void;
}) {
  const { user } = useAuth();
  const createdBy = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const [title, setTitle]             = useState("");
  const [source, setSource]           = useState<"competitor" | "original">("competitor");
  const [compLink, setCompLink]       = useState("");
  const [ytUrl, setYtUrl]             = useState("");
  const [ytTs, setYtTs]               = useState("");
  const [format, setFormat]           = useState<"reel" | "post">("reel");
  const [videoFormat, setVideoFormat] = useState("");

  const reset = () => {
    setTitle(""); setCompLink(""); setYtUrl(""); setYtTs(""); setFormat("reel"); setVideoFormat("");
  };

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      topic: title.trim(), source, content_type: format, video_format: videoFormat,
      status: "new", page_handle: "",
      comp_link: source === "competitor" ? compLink : "",
      yt_url: source === "original" ? ytUrl : "",
      yt_timestamps: source === "original" ? ytTs : "",
      created_by: createdBy, day_date: toLocalISO(new Date()),
      frontseat_pool: true,
    });
    reset(); onClose();
  };

  if (!open) return null;
  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };
  const is: React.CSSProperties = { width: "100%", padding: "9px 13px", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, outline: "none", background: "#09090b", color: "#e4e4e7", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", background: "#18181b", borderRadius: 16,
        padding: "24px 28px", maxWidth: 460, width: "94%", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: "1px solid #27272a",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>New idea</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#71717a" }}>✕</button>
        </div>
        <div>
          <label style={ls}>Title *</label>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. JRD Tata story" style={{ ...is, color: "#e4e4e7" }} />
        </div>
        <div>
          <label style={ls}>Source</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["competitor", "original"] as const).map(s => (
              <button key={s} onClick={() => setSource(s)} style={{
                flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: source === s ? "2px solid #7c3aed" : "1.5px solid #3f3f46",
                background: source === s ? "#27272a" : "#18181b", color: source === s ? "#fff" : "#71717a",
              }}>{s === "competitor" ? "Competitor (IG)" : "YouTube"}</button>
            ))}
          </div>
        </div>
        {source === "competitor" ? (
          <div>
            <label style={ls}>Comp link</label>
            <input value={compLink} onChange={e => setCompLink(e.target.value)}
              placeholder="https://instagram.com/reel/..." style={{ ...is, color: "#e4e4e7" }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={ls}>YouTube link</label>
              <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://youtube.com/..." style={{ ...is, color: "#e4e4e7" }} />
            </div>
            <div style={{ flex: "0 0 130px" }}>
              <label style={ls}>Timestamp</label>
              <input value={ytTs} onChange={e => setYtTs(e.target.value)}
                placeholder="0:30–1:45" style={{ ...is, color: "#e4e4e7" }} />
            </div>
          </div>
        )}
        <div>
          <label style={ls}>Format</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["reel", "post"] as const).map(f => (
              <button key={f} onClick={() => setFormat(f)} style={{
                flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                textTransform: "capitalize",
                border: format === f ? "2px solid #7c3aed" : "1.5px solid #3f3f46",
                background: format === f ? "#27272a" : "#18181b", color: format === f ? "#fff" : "#71717a",
              }}>{f}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={ls}>Video format</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VIDEO_FORMATS.map(vf => (
              <button key={vf} onClick={() => setVideoFormat(v => v === vf ? "" : vf)} style={{
                padding: "5px 11px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: videoFormat === vf ? "2px solid #50E0B0" : "1.5px solid #3f3f46",
                background: videoFormat === vf ? "rgba(80,224,176,0.12)" : "#18181b",
                color: videoFormat === vf ? "#50E0B0" : "#71717a",
              }}>{vf}</button>
            ))}
          </div>
        </div>
        <button onClick={submit} disabled={!title.trim()} style={{
          padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none",
          borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
          opacity: !title.trim() ? 0.4 : 1,
        }}>Add idea</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontseat — pool card (left panel, draggable)
// ---------------------------------------------------------------------------
function FrontseatPoolCard({ idea, letter, onDragStart, onClick, onDelete, readOnly }: {
  idea: any; letter: string; onDragStart: () => void; onClick: () => void; onDelete?: () => void; readOnly?: boolean;
}) {
  return (
    <div
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", idea.id); onDragStart(); }}
      onClick={onClick}
      style={{
        position: "relative", background: "#18181b", border: "1.5px solid #27272a", borderRadius: 8,
        padding: "8px 10px", cursor: "grab", marginBottom: 6, transition: "border-color 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#3f3f46")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#27272a")}
    >
      {!readOnly && onDelete && (
      <button
        onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
        title="Delete idea"
        style={{
          position: "absolute", top: 5, right: 5,
          padding: "2px 6px", fontSize: 9, fontWeight: 700,
          background: "#3f3f46", color: "#a1a1aa", border: "none", borderRadius: 3, cursor: "pointer",
          zIndex: 2,
        }}
      >✕</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", background: "#7c3aed22", borderRadius: 4, padding: "1px 6px" }}>{letter}</span>
        <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 4, padding: "1px 5px" }}>{idea.content_type}</span>
        {idea.source === "competitor"
          ? <span style={{ fontSize: 9, color: "#7BB0FF", background: "#7BB0FF22", borderRadius: 4, padding: "1px 5px" }}>IG</span>
          : <span style={{ fontSize: 9, color: "#FF9580", background: "#FF958022", borderRadius: 4, padding: "1px 5px" }}>YT</span>
        }
      </div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#e4e4e7", lineHeight: 1.4,
        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
        {idea.topic || <em style={{ color: "#52525b" }}>Untitled</em>}
      </p>
      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <DeployedFromBadge idea={idea} />
        <DeployToPlaybookButton idea={idea} readOnly={readOnly} />
      </div>
      <CrossPlaybookViewsBlock idea={idea} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontseat — page column card (clickable, status colour-coded)
// ---------------------------------------------------------------------------
function FrontseatPageCard({ idea, letter, onClick, onRemoveFromPage }: {
  idea: any; letter: string; onClick: () => void; onRemoveFromPage?: () => void;
}) {
  const stage = idea.status || "new";
  const ss = STATUS_STYLE[stage] || STATUS_STYLE.new;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#18181b", borderRadius: 8, position: "relative",
        borderTop: "1.5px solid #27272a", borderRight: "1.5px solid #27272a",
        borderBottom: "1.5px solid #27272a", borderLeft: `3px solid ${ss.text}`,
        padding: "8px 10px", cursor: "pointer", marginBottom: 6, transition: "opacity 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
    >
      {/* ✕ positioned absolute so it never triggers the card's onClick */}
      {onRemoveFromPage && (
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onRemoveFromPage(); }}
          title="Remove from this page"
          style={{
            position: "absolute", top: 5, right: 5,
            padding: "2px 6px", fontSize: 9, fontWeight: 700,
            background: "#3f3f46", color: "#a1a1aa", border: "none", borderRadius: 3, cursor: "pointer",
            zIndex: 2,
          }}
        >✕</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", background: "#7c3aed22", borderRadius: 4, padding: "1px 6px" }}>{letter}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: ss.text, background: ss.bg, borderRadius: 4, padding: "1px 6px" }}>
          {STAGE_LABEL[stage as IdeaStage] || stage}
        </span>
        {idea.content_type && (
          <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 4, padding: "1px 5px" }}>{idea.content_type}</span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#e4e4e7", lineHeight: 1.4,
        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
        {idea.topic || <em style={{ color: "#52525b" }}>Untitled</em>}
      </p>
      {idea.video_format && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#50E0B0", fontWeight: 600 }}>{idea.video_format}</p>
      )}
      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        <DeployedFromBadge idea={idea} />
        <DeployToPlaybookButton idea={idea} />
      </div>
      <CrossPlaybookViewsBlock idea={idea} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontseat tab — current-week ideas organised by page (view layer over Idea Bank)
// ---------------------------------------------------------------------------
function FrontseatTab({ readOnly, opsOnly }: { readOnly?: boolean; opsOnly?: boolean }) {
  const { pages: playbookPages, pageColors, pageShort, api, id: playbookId } = usePlaybook();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [addOpen, setAddOpen]       = useState(false);
  const [detailIdea, setDetailIdea] = useState<any>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: expQk(playbookId, "settings"),
    queryFn: api.getSettings,
    staleTime: EXP_STALE_MS,
  });
  const currentWeek = useMemo(() => {
    const start = settings?.experiment_start_date;
    if (!start) return 1;
    return computeCurrentWeek(start);
  }, [settings]);

  // Fetch by today's local date directly — no settings waterfall, loads immediately on page open
  const todayStr = toLocalISO(new Date());
  const QK = expQk(playbookId, "idea-bank", "today", todayStr);
  const { data: ideas = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.getIdeaBank({ day_date: todayStr }),
    staleTime: EXP_STALE_MS,
  });

  const createMut = useMutation({
    mutationFn: api.createIdea,
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData(QK);
      const optimistic = {
        id: `temp-${Date.now()}`, ...newData,
        frontseat_pool: true, week_number: currentWeek,
        created_at: new Date().toISOString(), views: 0,
        page_views: {}, page_test_results: {},
      };
      qc.setQueryData(QK, (old: any[] = []) => [...old, optimistic]);
      return { prev };
    },
    onSuccess: () => toast.success("Idea added"),
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(e?.message || "Failed to add idea");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }),
  });
  const updateMut = useMutation(expIdeaUpdateMutationOpts(qc, playbookId, api, {
    onDetail: (id, patch) => setDetailIdea((p: any) => p?.id === id ? { ...p, ...patch } : p),
  }));
  const deleteMut = useMutation({
    mutationFn: api.deleteIdea,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData(QK);
      qc.setQueryData(QK, (old: any[] = []) => old.filter((i: any) => i.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx: any) => { if (ctx?.prev) qc.setQueryData(QK, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }),
  });
  const createCopyMut = useMutation({
    mutationFn: api.createIdea,
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData(QK);
      const optimistic = {
        id: `temp-copy-${Date.now()}`, ...newData,
        frontseat_pool: false, week_number: currentWeek,
        created_at: new Date().toISOString(), views: 0,
        page_views: {}, page_test_results: {},
      };
      qc.setQueryData(QK, (old: any[] = []) => [...old, optimistic]);
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
      toast.error(e?.message || "Failed to assign idea");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: expQk(playbookId, "idea-bank") }),
  });

  // Backend already filters to today; this guards against any stale optimistic entries
  const todayIdeas = useMemo(() =>
    (ideas as any[]).filter((i: any) => (i.day_date || "").slice(0, 10) === todayStr),
    [ideas, todayStr]
  );

  // Pool = permanent ideas added via Frontseat "+ New".
  // After migration: frontseat_pool === true. Before migration runs (column is null): fall back to status === "new".
  const poolIdeas = useMemo(() =>
    todayIdeas
      .filter((i: any) =>
        i.frontseat_pool === true ||
        (i.frontseat_pool == null && i.status === "new")
      )
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [todayIdeas]
  );

  // Letters a, b, c… in creation order — stable for the whole day
  const ideaLetterMap = useMemo(() => {
    const map: Record<string, string> = {};
    poolIdeas.forEach((idea: any, i: number) => {
      map[idea.id] = String.fromCharCode(97 + (i % 26));
    });
    return map;
  }, [poolIdeas]);

  // Page columns: copies only (frontseat_pool === false or null before migration).
  // !i.frontseat_pool covers both false and null, so old pre-migration ideas still appear.
  const ideasByPage = useMemo(() => {
    const result: Record<string, any[]> = {};
    playbookPages.forEach(p => { result[p] = []; });
    todayIdeas.filter((i: any) => !i.frontseat_pool).forEach((idea: any) => {
      const pages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      pages.forEach((p: string) => { if (result[p]) result[p].push(idea); });
    });
    playbookPages.forEach(p => {
      result[p].sort((a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
    return result;
  }, [todayIdeas]);

  const handleDrop = (page: string, e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const ideaId = e.dataTransfer.getData("text/plain");
    setDropTarget(null); setDraggingId(null);
    if (!ideaId || ideaId.startsWith("temp-")) return; // wait for real DB id
    const idea = (ideas as any[]).find((i: any) => i.id === ideaId);
    if (!idea || !idea.frontseat_pool) return;
    // Prevent duplicate copies for the same pool idea + page combo
    const alreadyAssigned = (ideasByPage[page] || []).some((c: any) => c.source_pool_id === ideaId);
    if (alreadyAssigned) return;
    // Create a pipeline copy for this page
    createCopyMut.mutate({
      topic: idea.topic, source: idea.source, content_type: idea.content_type,
      video_format: idea.video_format || "", status: "new", page_handle: page,
      comp_link: idea.comp_link || "", yt_url: idea.yt_url || "",
      yt_timestamps: idea.yt_timestamps || "", created_by: idea.created_by || "",
      day_date: todayStr, frontseat_pool: false, source_pool_id: ideaId,
    });
    // Track assigned pages on pool idea (for chip display)
    const existingPages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!existingPages.includes(page)) {
      updateMut.mutate({ id: ideaId, data: { page_handle: [...existingPages, page].join(",") } });
    }
  };

  const legendStages: IdeaStage[] = ["approved", "base_edit", "testing", "proven_ideas", "kill"];
  const dragDisabled = readOnly || opsOnly;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 220px)" }}>

      {/* ── Left panel: idea pool ── */}
      <div style={{
        width: 210, flexShrink: 0, paddingRight: 16, marginRight: 16,
        borderRight: "1px solid #27272a", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ideas Pool</p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "#52525b" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {opsOnly ? " · view & update scheduling" : " · drag to assign"}
            </p>
          </div>
          {can("add_experiment_idea") && !dragDisabled && (
            <button onClick={() => setAddOpen(true)} style={{
              padding: "4px 10px", background: "#7c3aed", color: "#fff", border: "none",
              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>+ New</button>
          )}
        </div>

        {/* Colour legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, padding: "8px 10px", background: "#111113", borderRadius: 7, border: "1px solid #1f1f22" }}>
          {legendStages.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_STYLE[s]?.text || "#52525b", flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: STATUS_STYLE[s]?.text || "#71717a" }}>{STAGE_LABEL[s]}</span>
            </div>
          ))}
        </div>

        {/* Pool cards */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading ? (
            <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
          ) : poolIdeas.length === 0 ? (
            <div style={{ padding: "24px 10px", textAlign: "center", color: "#3f3f46", fontSize: 11, border: "1.5px dashed #27272a", borderRadius: 9 }}>
              No ideas today<br />
              <span style={{ fontSize: 10 }}>Add one above</span>
            </div>
          ) : (
            poolIdeas.map((idea: any) => {
              const assignedPages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
              return (
                <div key={idea.id} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} style={{ opacity: draggingId === idea.id ? 0.4 : 1, transition: "opacity 0.12s" }}>
                  <FrontseatPoolCard
                    idea={idea}
                    letter={ideaLetterMap[idea.id] || "?"}
                    readOnly={dragDisabled}
                    onDragStart={() => setDraggingId(idea.id)}
                    onClick={() => setDetailIdea(idea)}
                    onDelete={opsOnly ? undefined : () => {
                      // Delete pool idea + all its page copies
                      const copies = (ideas as any[]).filter((i: any) => i.source_pool_id === idea.id);
                      copies.forEach((c: any) => deleteMut.mutate(c.id));
                      deleteMut.mutate(idea.id);
                    }}
                  />
                  {/* Show assigned page chips below the card */}
                  {assignedPages.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: -3, marginBottom: 6, paddingLeft: 2 }}>
                      {assignedPages.map((p: string) => {
                        const c = pageColors[p] || "#a1a1aa";
                        const short = pageShort[p] || p;
                        return (
                          <span key={p} style={{ fontSize: 9, fontWeight: 700, color: c, background: c + "22", borderRadius: 3, padding: "1px 5px" }}>
                            {short}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel: page columns ── */}
      <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 10, paddingBottom: 20, alignItems: "flex-start" }}>
        {playbookPages.map(page => {
          const short    = pageShort[page] || page;
          const color    = pageColors[page] || "#a1a1aa";
          const colIdeas = ideasByPage[page] || [];
          const isDrop   = dropTarget === page;

          return (
            <div
              key={page}
              style={{ minWidth: 195, flex: "1 0 195px", maxWidth: 250 }}
              onDragOver={dragDisabled ? undefined : e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget(page); }}
              onDragLeave={dragDisabled ? undefined : e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
              onDrop={dragDisabled ? undefined : e => handleDrop(page, e)}
            >
              {/* Column header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 8px 8px", marginBottom: 4,
                borderBottom: `2px solid ${color}30`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{short}</span>
                {colIdeas.length > 0 && (
                  <span style={{ fontSize: 10, color: "#52525b", fontWeight: 500 }}>{colIdeas.length}</span>
                )}
              </div>

              {/* Drop zone + cards */}
              <div style={{
                minHeight: 120, padding: "6px 4px", borderRadius: 9,
                border: isDrop ? "2px dashed #7c3aed" : "2px dashed transparent",
                background: isDrop ? "rgba(124,58,237,0.05)" : "transparent",
                transition: "all 0.12s",
              }}>
                {colIdeas.length === 0 && !isDrop && (
                  <div style={{ padding: "24px 10px", textAlign: "center", color: "#3f3f46", fontSize: 10 }}>
                    Drop an idea here
                  </div>
                )}
                {colIdeas.map((idea: any) => (
                  <FrontseatPageCard
                    key={idea.id}
                    idea={idea}
                    letter={ideaLetterMap[idea.source_pool_id] || "?"}
                    onClick={() => setDetailIdea(idea)}
                    onRemoveFromPage={dragDisabled ? undefined : () => {
                      // Delete the copy
                      deleteMut.mutate(idea.id);
                      // Remove page from pool idea's chip tracking
                      const poolIdea = poolIdeas.find((pi: any) => pi.id === idea.source_pool_id);
                      if (poolIdea) {
                        const remaining = (poolIdea.page_handle || "")
                          .split(",").map((s: string) => s.trim()).filter((p: string) => p && p !== page);
                        updateMut.mutate({ id: poolIdea.id, data: { page_handle: remaining.join(",") } });
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <QuickAddModal open={addOpen} onAdd={data => createMut.mutate(data)} onClose={() => setAddOpen(false)} />
      {detailIdea && opsOnly && (
        <ContentOpsIdeaModal
          idea={detailIdea}
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onClose={() => setDetailIdea(null)}
        />
      )}
      {detailIdea && !opsOnly && (
        <IdeaDetailModal
          idea={detailIdea}
          readOnly={readOnly}
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onClose={() => setDetailIdea(null)}
          hideStageActions={detailIdea.frontseat_pool === true}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PlaybookExperimentPage({ playbookId }: { playbookId: PlaybookId }) {
  const ctx = useMemo(() => buildPlaybookContext(playbookId), [playbookId]);
  return (
    <PlaybookExperimentContext.Provider value={ctx}>
      <ExperimentXShell key={playbookId} />
    </PlaybookExperimentContext.Provider>
  );
}

function ExperimentXShell() {
  const { pages: playbookPages, id: playbookId, label, emoji } = usePlaybook();
  const { role } = usePermissions();
  const access = getPlaybookAccess(role, playbookId);
  const opsOnly = access === "ops";
  const viewOnly = access === "view";
  const readOnly = access !== "edit";
  const [tab, setTab] = useState<TabMode>(() => (opsOnly || viewOnly ? "calendar" : "idea-bank"));
  const [pageFilter, setPageFilter] = useState("all");
  const [search, setSearch] = useState("");

  const visibleTabs: TabMode[] = opsOnly || viewOnly
    ? ["calendar", "idea-bank", "frontseat"]
    : ["frontseat", "idea-bank", "calendar", "content-bank", "working-ideas"];

  const accessLabel =
    access === "edit" ? null
    : access === "ops" ? "Ops — edit schedule, views & baseline"
    : access === "view" ? "View only"
    : null;

  if (access === "none") {
    return (
      <div style={{ minHeight: "100vh", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: "#71717a", fontSize: 14 }}>You don&apos;t have permission to view {label}.</p>
      </div>
    );
  }

  const tabColors: Record<TabMode, string> = {
    "frontseat":     "#7c3aed",
    "idea-bank":     "#3f3f46",
    "calendar":      "#2563eb",
    "content-bank":  "#1A5E3A",
    "working-ideas": "#534AB7",
  };
  const tabLabels: Record<TabMode, string> = {
    "frontseat":     "Frontseat",
    "idea-bank":     "Idea Bank",
    "calendar":      "Calendar",
    "content-bank":  "Content Bank",
    "working-ideas": "Proven Ideas",
  };

  return (
    <div style={{
      fontFamily: "'DM Sans','Helvetica Neue',sans-serif",
      minHeight: "100vh", background: "#09090b", color: "#e4e4e7",
      padding: "72px 28px 60px 72px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
          {label} <span style={{ fontSize: 15 }}>{emoji}</span>
        </h1>
        <p style={{ fontSize: 12, color: "#52525b", margin: "4px 0 0" }}>
          {playbookPages.length} pages · {playbookPages.join(", ")}
          {accessLabel && (
            <span style={{ marginLeft: 10, color: access === "ops" ? "#a78bfa" : "#71717a", fontWeight: 600 }}>
              · {accessLabel}
            </span>
          )}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {visibleTabs.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); }}
              style={{
                padding: "5px 14px", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: tab === t ? tabColors[t] : "transparent",
                color: tab === t ? "#fff" : "#71717a",
              }}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Page filter */}
        <select value={pageFilter} onChange={e => setPageFilter(e.target.value)} style={sel}>
          <option value="all">All pages</option>
          {playbookPages.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Search */}
        <input
          placeholder="Search ideas…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, width: 220, flex: "0 0 220px" }}
        />
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: (tab === "idea-bank" || tab === "frontseat" || tab === "calendar") ? "none" : 860 }}>
        {tab === "frontseat"     && <FrontseatTab readOnly={readOnly} opsOnly={opsOnly} />}
        {tab === "idea-bank"     && <IdeaBankTab pageFilter={pageFilter} search={search} readOnly={readOnly} opsOnly={opsOnly} />}
        {tab === "calendar"      && <CalendarTab pageFilter={pageFilter} search={search} opsOnly={opsOnly} calendarViewOnly={viewOnly} />}
        {tab === "content-bank"  && <ContentBankTab pageFilter={pageFilter} search={search} readOnly={readOnly} />}
        {tab === "working-ideas" && <WorkingIdeasTab pageFilter={pageFilter} search={search} readOnly={readOnly} />}
      </div>
    </div>
  );
}
