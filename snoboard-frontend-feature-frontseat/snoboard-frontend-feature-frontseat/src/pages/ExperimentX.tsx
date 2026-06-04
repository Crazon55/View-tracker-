import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getExpSettings, updateExpSettings,
  getExpIdeaBank, createExpIdea, updateExpIdea, deleteExpIdea, archiveExpWeek,
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

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft:  { bg: "rgba(74,127,212,0.15)",  text: "#7BB0FF" },
  posted: { bg: "rgba(45,158,95,0.15)",   text: "#5AE0A0" },
  killed: { bg: "rgba(201,59,59,0.15)",   text: "#FF7070" },
};

type TabMode = "all" | "content-bank" | "working-ideas";

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
// Idea row card (editable — used in Idea Bank)
// ---------------------------------------------------------------------------
function IdeaRow({ idea, onUpdate, onDelete }: {
  idea: any;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editTopic, setEditTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(idea.topic || "");
  const [editScript, setEditScript] = useState(false);
  const [scriptDraft, setScriptDraft] = useState(idea.script || "");

  const pc = PAGE_COLORS[idea.page_handle] || "#a1a1aa";
  const ss = STATUS_STYLE[idea.status] || STATUS_STYLE.draft;

  const saveTopic = () => { setEditTopic(false); if (topicDraft !== idea.topic) onUpdate(idea.id, { topic: topicDraft }); };
  const saveScript = () => { setEditScript(false); if (scriptDraft !== idea.script) onUpdate(idea.id, { script: scriptDraft }); };

  return (
    <div style={{
      background: "#111113", border: "1px solid #27272a", borderRadius: 8,
      overflow: "hidden",
    }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
          {idea.page_handle}
        </span>
        <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          {idea.content_type}
        </span>
        <select
          value={idea.status}
          onChange={e => onUpdate(idea.id, { status: e.target.value })}
          style={{ fontSize: 10, fontWeight: 600, color: ss.text, background: ss.bg, border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
        >
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="killed">Killed</option>
        </select>

        {/* Topic — inline edit */}
        {editTopic ? (
          <input
            autoFocus value={topicDraft}
            onChange={e => setTopicDraft(e.target.value)}
            onBlur={saveTopic}
            onKeyDown={e => { if (e.key === "Enter") saveTopic(); if (e.key === "Escape") setEditTopic(false); }}
            style={{ flex: 1, minWidth: 140, ...inp, padding: "3px 8px", fontSize: 12 }}
          />
        ) : (
          <span
            onClick={() => { setTopicDraft(idea.topic || ""); setEditTopic(true); }}
            style={{
              flex: 1, minWidth: 100, fontSize: 12, fontWeight: 500,
              color: idea.topic ? "#e4e4e7" : "#52525b", cursor: "pointer",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
            title={idea.topic || "Click to add topic"}
          >
            {idea.topic || "Click to add topic…"}
          </span>
        )}

        <ViewsEdit value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />

        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 11, padding: "0 4px" }}
          title="Expand"
        >
          {expanded ? "▲" : "▼"}
        </button>
        <button
          onClick={() => { if (confirm("Delete this idea?")) onDelete(idea.id); }}
          style={{ background: "none", border: "none", color: "#3f3f46", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}
          title="Delete"
        >
          ×
        </button>
      </div>

      {/* Expanded script area */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1f1f22", padding: "8px 12px", background: "#0d0d0f" }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, color: "#52525b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Script / notes</p>
          {editScript ? (
            <textarea
              autoFocus value={scriptDraft}
              onChange={e => setScriptDraft(e.target.value)}
              onBlur={saveScript}
              rows={3}
              style={{ ...inp, resize: "vertical", fontSize: 11 }}
            />
          ) : (
            <p
              onClick={() => { setScriptDraft(idea.script || ""); setEditScript(true); }}
              style={{ margin: 0, fontSize: 11, color: idea.script ? "#a1a1aa" : "#3f3f46", cursor: "pointer", lineHeight: 1.5 }}
            >
              {idea.script || "Click to add script or notes…"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive card (read-only — used in Content Bank)
// ---------------------------------------------------------------------------
function ArchiveRow({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PAGE_COLORS[item.page_handle] || "#a1a1aa";
  const ss = STATUS_STYLE[item.status] || STATUS_STYLE.draft;
  return (
    <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px" }}>
          {item.page_handle}
        </span>
        <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          {item.content_type}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: ss.text, background: ss.bg, borderRadius: 4, padding: "2px 6px" }}>
          {item.status}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: item.views > 0 ? "#50E0B0" : "#3f3f46" }}>
          {item.views > 0 ? fmt(item.views) : "—"}
        </span>
        {item.script && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 11 }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {expanded && item.script && (
        <div style={{ borderTop: "1px solid #1f1f22", padding: "8px 12px", background: "#0d0d0f" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#71717a", lineHeight: 1.5 }}>{item.script}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Working idea card
// ---------------------------------------------------------------------------
function WorkingRow({ item, onDistribute }: { item: any; onDistribute: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PAGE_COLORS[item.page_handle] || "#a1a1aa";
  return (
    <div style={{
      background: "#111113",
      border: `1px solid ${item.distributed ? "#27272a" : "#4c1d95"}`,
      borderRadius: 8, overflow: "hidden",
      opacity: item.distributed ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px" }}>
          {item.page_handle}
        </span>
        <span style={{ fontSize: 10, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          Week {item.week_number}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.topic || <em style={{ color: "#52525b" }}>No topic</em>}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#50E0B0", whiteSpace: "nowrap" }}>
          {fmt(item.views_achieved)}
        </span>
        {item.distributed ? (
          <span style={{ fontSize: 10, color: "#52525b", fontStyle: "italic" }}>Distributed</span>
        ) : (
          <button onClick={() => onDistribute(item.id)} style={{ ...btnPrimary, padding: "4px 12px", fontSize: 11 }}>
            Distribute to all pages
          </button>
        )}
        {item.script && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 11 }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {expanded && item.script && (
        <div style={{ borderTop: "1px solid #1f1f22", padding: "8px 12px", background: "#0d0d0f" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#71717a", lineHeight: 1.5 }}>{item.script}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add idea inline form
// ---------------------------------------------------------------------------
function AddIdeaForm({ onAdd, onCancel }: { onAdd: (d: any) => void; onCancel: () => void }) {
  const [page, setPage] = useState(EXP_PAGES[0]);
  const [type, setType] = useState("reel");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [date, setDate] = useState(toLocalISO(new Date()));

  return (
    <div style={{
      background: "#111113", border: "1px solid #3f3f46", borderRadius: 10,
      padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={page} onChange={e => setPage(e.target.value as any)} style={sel}>
          {EXP_PAGES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {["reel", "post"].map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              padding: "5px 12px", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: type === t ? "#3f3f46" : "transparent",
              color: type === t ? "#fff" : "#71717a",
            }}>{t === "reel" ? "Reel" : "Post"}</button>
          ))}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ ...sel, width: "auto" }} />
      </div>
      <input
        autoFocus placeholder="Topic / hook *"
        value={topic} onChange={e => setTopic(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && topic.trim()) onAdd({ page_handle: page, content_type: type, topic: topic.trim(), script, day_date: date }); }}
        style={inp}
      />
      <textarea
        placeholder="Script or notes (optional)"
        value={script} onChange={e => setScript(e.target.value)}
        rows={2} style={{ ...inp, resize: "none" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { if (topic.trim()) onAdd({ page_handle: page, content_type: type, topic: topic.trim(), script, day_date: date }); }}
          disabled={!topic.trim()}
          style={{ ...btnPrimary, opacity: !topic.trim() ? 0.4 : 1 }}
        >
          Add idea
        </button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idea Bank tab (All — current week, editable, auto-archives past weeks)
// ---------------------------------------------------------------------------
function IdeaBankTab({ pageFilter, search }: { pageFilter: string; search: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const autoArchiveDone = useRef(false);

  const { data: settings } = useQuery({ queryKey: ["exp-settings"], queryFn: getExpSettings });
  const currentWeek = useMemo(() => {
    const start = settings?.experiment_start_date;
    if (!start) return 1;
    return computeCurrentWeek(start);
  }, [settings]);

  // Auto-archive any past weeks that haven't been archived yet
  const archiveMut = useMutation({ mutationFn: archiveExpWeek });
  const { data: allIdeas = [] } = useQuery({
    queryKey: ["exp-idea-bank-all"],
    queryFn: () => getExpIdeaBank(),
    enabled: !!settings,
  });

  useEffect(() => {
    if (!settings || autoArchiveDone.current || allIdeas.length === 0) return;
    const pastWeeks = [...new Set(allIdeas
      .filter((i: any) => i.week_number < currentWeek)
      .map((i: any) => i.week_number as number)
    )];
    if (pastWeeks.length === 0) return;
    autoArchiveDone.current = true;
    pastWeeks.forEach(w => {
      archiveMut.mutate(w, {
        onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-content-bank"] }),
      });
    });
  }, [settings, allIdeas, currentWeek]);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["exp-idea-bank", currentWeek, pageFilter],
    queryFn: () => getExpIdeaBank({
      week: currentWeek,
      page: pageFilter !== "all" ? pageFilter : undefined,
    }),
    enabled: !!settings,
  });

  const createMut = useMutation({
    mutationFn: createExpIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); setShowAdd(false); toast.success("Idea added"); },
    onError: (e: any) => toast.error(e?.message || "Failed to add idea"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateExpIdea(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); qc.invalidateQueries({ queryKey: ["exp-working-ideas"] }); },
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
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
  }, [ideas, search]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>Week {currentWeek} · {ideas.length} idea{ideas.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setShowAdd(s => !s)} style={{ ...btnPrimary, padding: "5px 14px" }}>
          {showAdd ? "Cancel" : "+ New idea"}
        </button>
      </div>

      {showAdd && (
        <AddIdeaForm
          onAdd={data => createMut.mutate(data)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          {search ? "No ideas match your search." : "No ideas for this week yet. Add the first one!"}
        </p>
      ) : (
        grouped.map(([day, items]) => (
          <DayGroup key={day} dateStr={day} count={items.length}>
            {items.map(idea => (
              <IdeaRow
                key={idea.id}
                idea={idea}
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
// Content Bank tab (full archive — month / week / day / search)
// ---------------------------------------------------------------------------
function ContentBankTab({ pageFilter, search }: { pageFilter: string; search: string }) {
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");

  // Load ideas for the selected month (by day_date range)
  const monthStart = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, "0")}-01`;
  const monthEnd   = new Date(monthYear.year, monthYear.month + 1, 0);
  const monthEndStr = toLocalISO(monthEnd);

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["exp-content-bank-month", monthYear.year, monthYear.month, pageFilter],
    queryFn: () => getExpContentBank({ page: pageFilter !== "all" ? pageFilter : undefined }),
  });

  // Filter to selected month
  const monthItems = useMemo(() =>
    rawItems.filter((i: any) => {
      const d = (i.day_date || "").slice(0, 10);
      return d >= monthStart && d <= monthEndStr;
    }), [rawItems, monthStart, monthEndStr]);

  // Available weeks within this month
  const weeksInMonth = useMemo(() => {
    const seen = new Map<number, string>();
    for (const i of monthItems) {
      if (!seen.has(i.week_number)) seen.set(i.week_number, i.week_label || `Week ${i.week_number}`);
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [monthItems]);

  // Apply week filter
  const weekFiltered = useMemo(() =>
    weekFilter === "all" ? monthItems : monthItems.filter((i: any) => i.week_number === weekFilter),
    [monthItems, weekFilter]);

  // Apply search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return weekFiltered;
    return weekFiltered.filter((i: any) =>
      (i.topic || "").toLowerCase().includes(q) ||
      (i.script || "").toLowerCase().includes(q)
    );
  }, [weekFiltered, search]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div>
      {/* Month navigator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#27272a", borderRadius: 7, border: "1px solid #3f3f46", padding: "2px 4px" }}>
          <button
            onClick={() => setMonthYear(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 })}
            style={{ padding: "4px 8px", background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: 12 }}
          >←</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7", minWidth: 110, textAlign: "center" }}>
            {fmtMonthLabel(monthYear.year, monthYear.month)}
          </span>
          <button
            onClick={() => setMonthYear(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 })}
            style={{ padding: "4px 8px", background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: 12 }}
          >→</button>
        </div>

        {/* Week filter */}
        {weeksInMonth.length > 0 && (
          <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
            <button
              onClick={() => setWeekFilter("all")}
              style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: weekFilter === "all" ? "#3f3f46" : "transparent", color: weekFilter === "all" ? "#fff" : "#71717a" }}
            >All weeks</button>
            {weeksInMonth.map(([wn, label]) => (
              <button
                key={wn}
                onClick={() => setWeekFilter(wn)}
                style={{ padding: "5px 12px", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", background: weekFilter === wn ? "#3f3f46" : "transparent", color: weekFilter === wn ? "#fff" : "#71717a" }}
              >{label}</button>
            ))}
          </div>
        )}

        <span style={{ fontSize: 12, color: "#52525b" }}>{filtered.length} idea{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          {search ? "No ideas match your search." : monthItems.length === 0 ? "Nothing archived for this month yet." : "No ideas match the selected week."}
        </p>
      ) : (
        grouped.map(([day, items]) => (
          <DayGroup key={day} dateStr={day} count={items.length}>
            {items.map(item => <ArchiveRow key={item.id} item={item} />)}
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
    if (!q) return ideas;
    return ideas.filter((i: any) =>
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
  const [tab, setTab] = useState<TabMode>("all");
  const [pageFilter, setPageFilter] = useState("all");
  const [search, setSearch] = useState("");

  const tabColors: Record<TabMode, string> = {
    "all": "#3f3f46",
    "content-bank": "#1A5E3A",
    "working-ideas": "#534AB7",
  };
  const tabLabels: Record<TabMode, string> = {
    "all": "All",
    "content-bank": "Content Bank",
    "working-ideas": "Working Ideas",
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
          {(["all", "content-bank", "working-ideas"] as TabMode[]).map(t => (
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
      <div style={{ maxWidth: 860 }}>
        {tab === "all"           && <IdeaBankTab    pageFilter={pageFilter} search={search} />}
        {tab === "content-bank"  && <ContentBankTab pageFilter={pageFilter} search={search} />}
        {tab === "working-ideas" && <WorkingIdeasTab pageFilter={pageFilter} search={search} />}
      </div>
    </div>
  );
}
