import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import IdeaThread from "@/components/IdeaThread";
import {
  getExpSettings, updateExpSettings,
  getExpIdeaBank, getExpIdeaById, createExpIdea, updateExpIdea, deleteExpIdea, archiveExpWeek,
  getExpContentBank, getExpContentBankWeeks,
  getExpWorkingIdeas, distributeExpWorkingIdea,
} from "@/services/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EXP_PAGES = [
  "indianfoundersco",
  "indianbusinesscom",
  "indiastartupstory",
  "indiafounderscore",
  "indianfoundersdaily",
] as const;

const PAGE_COLORS: Record<string, string> = {
  indianfoundersco:    "#7BB0FF",
  indianbusinesscom:   "#50E0B0",
  indiastartupstory:   "#F0C060",
  indiafounderscore:   "#B49EFF",
  indianfoundersdaily: "#FF9580",
};

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

type TabMode = "idea-bank" | "content-bank" | "working-ideas";

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
// Kanban card (used in Idea Bank board)
// ---------------------------------------------------------------------------
function KanbanCard({ idea, onUpdate, onDelete, onClick }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onClick: () => void;
}) {
  const pages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const pc = PAGE_COLORS[pages[0]] || "#a1a1aa";
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", idea.id); }}
      onClick={onClick}
      style={{
        background: "#18181b", border: "1px solid #27272a", borderRadius: 9,
        padding: "10px 12px", marginBottom: 6, cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#3f3f46")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#27272a")}
    >
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#e4e4e7", lineHeight: 1.35 }}>
        {idea.topic || <em style={{ color: "#52525b", fontWeight: 400 }}>Untitled</em>}
      </p>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {pages.map((pg: string) => {
          const pgc = PAGE_COLORS[pg] || "#a1a1aa";
          return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "1px 6px" }}>{pg}</span>;
        })}
        <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 4, padding: "1px 6px" }}>
          {idea.content_type}
        </span>
        {(idea.views || 0) > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#50E0B0", marginLeft: "auto" }}>
            {fmt(idea.views)}
          </span>
        )}
      </div>
      {idea.script && (
        <p style={{ margin: "6px 0 0", fontSize: 10, color: "#52525b", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
          {idea.script}
        </p>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        {idea.created_by && (
          <span style={{ fontSize: 9, color: "#52525b" }}>by {idea.created_by}</span>
        )}
        {idea.currently_editing_by && (
          <span style={{ fontSize: 9, color: "#f59e0b", background: "rgba(245,158,11,0.12)", borderRadius: 3, padding: "1px 5px" }}>
            ✏ {idea.currently_editing_by}
          </span>
        )}
      </div>
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
function SafeField({ value, onSave, placeholder, style }: { value: string | null; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
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

function SafeArea({ value, onSave, placeholder, rows }: { value: string; onSave: (v: string) => void; placeholder?: string; rows?: number }) {
  const [local, setLocal] = useState(value || "");
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setLocal(value || ""); }, [value]);
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
function IdeaDetailModal({ idea, onUpdate, onDelete, onClose }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const me = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  useEffect(() => {
    if (me) onUpdate(idea.id, { currently_editing_by: me });
    return () => { onUpdate(idea.id, { currently_editing_by: "" }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = idea.status || "new";
  const ss = STATUS_STYLE[stage] || STATUS_STYLE.new;
  const primaryPage = (idea.page_handle || "").split(",")[0].trim();
  const pc = PAGE_COLORS[primaryPage] || "#a1a1aa";
  const actions = STAGE_ACTIONS[stage] || [];
  const selectedPages = (idea.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);

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
          <SafeField
            value={idea.topic}
            onSave={v => onUpdate(idea.id, { topic: v })}
            placeholder="Topic / hook"
            style={{ fontSize: 16, fontWeight: 600, color: "#fff", border: "none", background: "transparent", padding: "0" }}
          />
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
            const pgc = PAGE_COLORS[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: pgc + "22", color: pgc, fontWeight: 600 }}>{pg}</span>;
          })}
          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "#27272a", color: "#71717a" }}>
            {idea.content_type}
          </span>
        </div>

        {/* Stage action buttons */}
        {actions.length > 0 && (
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EXP_PAGES.map(p => {
                const c = PAGE_COLORS[p] || "#a1a1aa";
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
          </div>
        )}

        {/* Hook variations */}
        <div>
          <label style={ls}>Hook variations</label>
          <SafeArea
            value={idea.hook_variations || ""}
            onSave={v => onUpdate(idea.id, { hook_variations: v })}
            placeholder="One hook per line"
            rows={3}
          />
        </div>

        {/* Music ref */}
        <div>
          <label style={ls}>Music reference / suggestions</label>
          <SafeField value={idea.music_ref} onSave={v => onUpdate(idea.id, { music_ref: v })} placeholder="e.g. Dark cinematic, trending audio" />
        </div>

        {/* Frame link */}
        <div>
          <label style={ls}>Frame link</label>
          <SafeField value={idea.frame_link} onSave={v => onUpdate(idea.id, { frame_link: v })} placeholder="Google Drive / reference frames link" />
          {idea.frame_link && <a href={idea.frame_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block", marginTop: 4 }}>{idea.frame_link}</a>}
        </div>

        {/* YT link + timestamps */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={ls}>YT link (original source)</label>
            <SafeField value={idea.yt_url} onSave={v => onUpdate(idea.id, { yt_url: v })} placeholder="https://youtube.com/watch?v=..." />
          </div>
          <div style={{ flex: "0 0 140px" }}>
            <label style={ls}>YT timestamps</label>
            <SafeField value={idea.yt_timestamps} onSave={v => onUpdate(idea.id, { yt_timestamps: v })} placeholder="0:30–1:45" />
          </div>
        </div>
        {idea.yt_url && <a href={idea.yt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all" }}>{idea.yt_url}</a>}

        {/* Comp link */}
        <div>
          <label style={ls}>Comp link</label>
          <SafeField value={idea.comp_link} onSave={v => onUpdate(idea.id, { comp_link: v })} placeholder="Competitor reel / post URL" />
          {idea.comp_link && <a href={idea.comp_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#4A7FD4", wordBreak: "break-all", display: "block", marginTop: 4 }}>{idea.comp_link}</a>}
        </div>

        {/* Views — always-visible input when posted, click-to-edit otherwise */}
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

        {/* Discussion thread */}
        <IdeaThread ideaId={idea.id} active={stage !== "new"} trackerType="reel" />

        {/* Delete */}
        <button
          onClick={() => { if (confirm("Delete this idea?")) { onDelete(idea.id); onClose(); } }}
          style={{ padding: "9px 20px", background: "transparent", color: "#FF7070", border: "1.5px solid #3f3f46", borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer", marginTop: 4 }}
        >
          Delete idea
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive card (Content Bank) — clickable, opens full IdeaDetailModal
// ---------------------------------------------------------------------------
function ArchiveRow({ item, onUpdate, onDelete }: { item: any; onUpdate: (id: string, data: any) => void; onDelete: (id: string) => void }) {
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
            const pgc = PAGE_COLORS[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "2px 7px" }}>{pg}</span>;
          })}
          <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>{item.content_type}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: ss.text, background: ss.bg, borderRadius: 4, padding: "2px 6px" }}>{STAGE_LABEL[item.status] || item.status}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
          </span>
          {item.created_by && (
            <span style={{ fontSize: 10, color: "#52525b", whiteSpace: "nowrap" }}>by {item.created_by}</span>
          )}
          {item.currently_editing_by && (
            <span style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.12)", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
              ✏ {item.currently_editing_by}
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
          onUpdate={onUpdate}
          onDelete={onDelete}
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
  const { data: fullIdea, isLoading } = useQuery({
    queryKey: ["exp-idea-by-id", item.source_id],
    queryFn: () => getExpIdeaById(item.source_id),
    enabled: !!item.source_id,
  });

  const ls: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" };
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "9px 13px", border: "1.5px solid #27272a", borderRadius: 9, fontSize: 13, background: "#09090b", color: "#e4e4e7", boxSizing: "border-box" };
  const pc = PAGE_COLORS[item.page_handle] || "#a1a1aa";
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

// ---------------------------------------------------------------------------
// Working idea card
// ---------------------------------------------------------------------------
function WorkingRow({ item, onDistribute }: { item: any; onDistribute: (id: string) => void }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const pages = (item.page_handle || "").split(",").map((s: string) => s.trim()).filter(Boolean);

  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        style={{
          background: "#111113",
          border: `1px solid ${item.distributed ? "#27272a" : "#4c1d95"}`,
          borderRadius: 8, overflow: "hidden",
          opacity: item.distributed ? 0.6 : 1,
          cursor: "pointer",
          transition: "border-color 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = item.distributed ? "#3f3f46" : "#7c3aed")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = item.distributed ? "#27272a" : "#4c1d95")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          {pages.map((pg: string) => {
            const pgc = PAGE_COLORS[pg] || "#a1a1aa";
            return <span key={pg} style={{ fontSize: 10, fontWeight: 700, color: pgc, background: pgc + "22", borderRadius: 4, padding: "2px 7px" }}>{pg}</span>;
          })}
          <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
            Week {item.week_number}
          </span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
          </span>
          {item.created_by && (
            <span style={{ fontSize: 10, color: "#52525b", whiteSpace: "nowrap" }}>by {item.created_by}</span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#50E0B0", whiteSpace: "nowrap" }}>
            {fmt(item.views_achieved)}
          </span>
          {item.distributed ? (
            <span style={{ fontSize: 10, color: "#52525b", fontStyle: "italic" }}>Distributed</span>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onDistribute(item.id); }}
              style={{ ...btnPrimary, padding: "4px 12px", fontSize: 11 }}
            >
              Distribute to all pages
            </button>
          )}
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
  const { user } = useAuth();
  const createdBy = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  const [page, setPage]           = useState(EXP_PAGES[0] as string);
  const [type, setType]           = useState("reel");
  const [source, setSource]       = useState("original");
  const [topic, setTopic]         = useState("");
  const [hookVars, setHookVars]   = useState("");
  const [musicRef, setMusicRef]   = useState("");
  const [frameLink, setFrameLink] = useState("");
  const [ytUrl, setYtUrl]         = useState("");
  const [ytTs, setYtTs]           = useState("");
  const [compLink, setCompLink]   = useState("");
  const [date, setDate]           = useState(toLocalISO(new Date()));

  const reset = () => {
    setPage(EXP_PAGES[0]); setType("reel"); setSource("original");
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
      created_by: createdBy, day_date: date,
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
          <div style={{ flex: 1 }}>
            <label style={ls}>Page *</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EXP_PAGES.map(p => {
                const pc = PAGE_COLORS[p] || "#a1a1aa";
                const sel2 = page === p;
                return (
                  <button
                    key={p} type="button" onClick={() => setPage(p)}
                    style={{
                      padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: sel2 ? `2px solid ${pc}` : "1.5px solid #3f3f46",
                      background: sel2 ? pc + "22" : "#18181b",
                      color: sel2 ? pc : "#71717a",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
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

// Stage column dot colors
const STAGE_DOT: Record<string, string> = {
  new: "#4A7FD4", approved: "#2D9E5F", base_edit: "#7B61C4",
  testing: "#D4952A", proven_ideas: "#1D9E75", scheduled: "#534AB7",
  posted: "#2D9E5F", kill: "#C93B3B",
};

// ---------------------------------------------------------------------------
// Idea Bank tab — kanban board (same layout as Content Tracker)
// ---------------------------------------------------------------------------
function IdeaBankTab({ pageFilter, search }: { pageFilter: string; search: string }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [addOpen, setAddOpen] = useState(false);
  const [detailIdea, setDetailIdea] = useState<any>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const autoArchiveDone = useRef(false);

  const { data: settings } = useQuery({ queryKey: ["exp-settings"], queryFn: getExpSettings });
  const currentWeek = useMemo(() => {
    const start = settings?.experiment_start_date;
    if (!start) return 1;
    return computeCurrentWeek(start);
  }, [settings]);

  // Auto-archive past weeks silently
  const archiveMut = useMutation({ mutationFn: archiveExpWeek });
  const { data: allIdeas = [] } = useQuery({
    queryKey: ["exp-idea-bank-all"],
    queryFn: () => getExpIdeaBank(),
    enabled: !!settings,
  });
  useEffect(() => {
    if (!settings || autoArchiveDone.current || allIdeas.length === 0) return;
    const pastWeeks = [...new Set(
      allIdeas.filter((i: any) => i.week_number < currentWeek).map((i: any) => i.week_number as number)
    )];
    if (!pastWeeks.length) return;
    autoArchiveDone.current = true;
    pastWeeks.forEach(w => archiveMut.mutate(w, { onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-content-bank"] }) }));
  }, [settings, allIdeas, currentWeek]);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["exp-idea-bank", currentWeek, pageFilter],
    queryFn: () => getExpIdeaBank({ week: currentWeek, page: pageFilter !== "all" ? pageFilter : undefined }),
    enabled: !!settings,
  });

  const createMut = useMutation({
    mutationFn: createExpIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); setAddOpen(false); toast.success("Idea added"); },
    onError: (e: any) => toast.error(e?.message || "Failed to add idea"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateExpIdea(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["exp-idea-bank"] });
      qc.invalidateQueries({ queryKey: ["exp-working-ideas"] });
      // keep detail modal in sync
      setDetailIdea((prev: any) => prev?.id === vars.id ? { ...prev, ...vars.data } : prev);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update"),
  });
  const deleteMut = useMutation({
    mutationFn: deleteExpIdea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return ideas;
    return ideas.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) || (i.script || "").toLowerCase().includes(q)
    );
  }, [ideas, search]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STAGES.forEach(s => { c[s] = 0; });
    filtered.forEach((i: any) => { const s = i.status || "new"; if (s in c) c[s]++; });
    return c;
  }, [filtered]);

  if (isLoading) return <p style={{ color: "#52525b", fontSize: 12, padding: "20px 0" }}>Loading…</p>;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>Week {currentWeek} · {ideas.length} idea{ideas.length !== 1 ? "s" : ""}</span>
        {can('add_experiment_idea') && (
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
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropStage(stage); }}
            onDragLeave={() => setDropStage(null)}
            onDrop={e => {
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
                    draggable
                    onDragStart={e => { setDraggingId(idea.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", idea.id); }}
                    onDragEnd={() => { setDraggingId(null); setDropStage(null); }}
                    style={{ opacity: draggingId === idea.id ? 0.4 : 1, transition: "opacity 0.12s" }}
                  >
                    <KanbanCard
                      idea={idea}
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
          onUpdate={(id, data) => updateMut.mutate({ id, data })}
          onDelete={id => deleteMut.mutate(id)}
          onClose={() => setDetailIdea(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Bank tab (full archive — month / week / day / search)
// ---------------------------------------------------------------------------
function ContentBankTab({ pageFilter, search }: { pageFilter: string; search: string }) {
  const qc = useQueryClient();
  const now = new Date();
  // null = all time; set to a specific month to filter
  const [monthFilter, setMonthFilter] = useState<{ year: number; month: number } | null>(null);

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateExpIdea(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank-all-for-cb"] }); qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed to update"),
  });
  const deleteMut = useMutation({
    mutationFn: deleteExpIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank-all-for-cb"] }); qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); },
    onError: () => toast.error("Failed to delete"),
  });
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const [dayFilter, setDayFilter]   = useState<string | "all">("all");

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["exp-idea-bank-all-for-cb", pageFilter],
    queryFn: () => getExpIdeaBank({ page: pageFilter !== "all" ? pageFilter : undefined }),
  });

  // ALL approved + proven ideas regardless of date — Content Bank is the full store
  const allValidItems = useMemo(() =>
    rawItems.filter((i: any) => i.status === "proven_ideas" || i.status === "approved"),
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

  // Apply search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return dayFiltered;
    return dayFiltered.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
  }, [dayFiltered, search]);

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
function WorkingIdeasTab({ pageFilter, search }: { pageFilter: string; search: string }) {
  const qc = useQueryClient();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const { data: settings } = useQuery({ queryKey: ["exp-settings"], queryFn: getExpSettings });
  const viewGoal: number = settings?.view_goal ?? 100000;

  const updateSettingsMut = useMutation({
    mutationFn: updateExpSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-settings"] }); setEditingGoal(false); toast.success("Goal updated"); },
    onError: (e: any) => toast.error(`Failed: ${e?.message || "unknown error"}`),
  });

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["exp-working-ideas", pageFilter],
    queryFn: () => getExpWorkingIdeas({ page: pageFilter !== "all" ? pageFilter : undefined }),
  });

  const distributeMut = useMutation({
    mutationFn: distributeExpWorkingIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-working-ideas"] }); toast.success("Marked as distributed"); },
    onError: () => toast.error("Failed to distribute"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    // Exclude entries whose source idea was deleted from the idea bank (source_id becomes null)
    const valid = ideas.filter((i: any) => i.source_id != null);
    if (!q) return valid;
    return valid.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
  }, [ideas, search]);

  const saveGoal = () => {
    const n = parseInt(goalDraft.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) updateSettingsMut.mutate({ view_goal: n });
  };

  return (
    <div>
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
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          {search ? "No ideas match your search." : `No ideas have crossed ${fmt(viewGoal)} views yet. Keep going!`}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(item => (
            <WorkingRow key={item.id} item={item} onDistribute={id => distributeMut.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ExperimentX() {
  const [tab, setTab] = useState<TabMode>("idea-bank");
  const [pageFilter, setPageFilter] = useState("all");
  const [search, setSearch] = useState("");

  const tabColors: Record<TabMode, string> = {
    "idea-bank":     "#3f3f46",
    "content-bank":  "#1A5E3A",
    "working-ideas": "#534AB7",
  };
  const tabLabels: Record<TabMode, string> = {
    "idea-bank":     "Idea Bank",
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
          Experiment X <span style={{ fontSize: 15 }}>🧪</span>
        </h1>
        <p style={{ fontSize: 12, color: "#52525b", margin: "4px 0 0" }}>
          5 pages · {EXP_PAGES.join(", ")}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {(["idea-bank", "content-bank", "working-ideas"] as TabMode[]).map(t => (
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
          {EXP_PAGES.map(p => <option key={p} value={p}>{p}</option>)}
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
      <div style={{ maxWidth: tab === "idea-bank" ? "none" : 860 }}>
        {tab === "idea-bank"     && <IdeaBankTab    pageFilter={pageFilter} search={search} />}
        {tab === "content-bank"  && <ContentBankTab pageFilter={pageFilter} search={search} />}
        {tab === "working-ideas" && <WorkingIdeasTab pageFilter={pageFilter} search={search} />}
      </div>
    </div>
  );
}
