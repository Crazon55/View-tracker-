import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getExpSettings, updateExpSettings,
  getExpIdeaBank, createExpIdea, updateExpIdea, deleteExpIdea, archiveExpWeek,
  getExpContentBank, getExpContentBankWeeks,
  getExpWorkingIdeas, distributeExpWorkingIdea,
} from "@/services/api";

const EXP_PAGES = [
  "indianfoundersco",
  "indianbusinesscom",
  "indiastartupstory",
  "indiafounderscore",
  "indianfoundersdaily",
] as const;

type ExpPage = (typeof EXP_PAGES)[number];
type TabMode = "all" | "content-bank" | "working-ideas";
type ContentType = "reel" | "post";
type IdeaStatus = "draft" | "posted" | "killed";

const PAGE_COLORS: Record<string, string> = {
  indianfoundersco:   "#7BB0FF",
  indianbusinesscom:  "#50E0B0",
  indiastartupstory:  "#F0C060",
  indiafounderscore:  "#B49EFF",
  indianfoundersdaily:"#FF9580",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:  { bg: "rgba(74,127,212,0.15)",  text: "#7BB0FF" },
  posted: { bg: "rgba(45,158,95,0.15)",   text: "#5AE0A0" },
  killed: { bg: "rgba(201,59,59,0.15)",   text: "#FF7070" },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupByDay<T extends { day_date?: string }>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = (item.day_date || "").slice(0, 10) || "unknown";
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}

function DayLabel({ dateStr }: { dateStr: string }) {
  if (!dateStr || dateStr === "unknown") return <span>Unknown date</span>;
  const d = new Date(dateStr + "T00:00:00");
  return (
    <span>
      {d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline editable field
// ---------------------------------------------------------------------------
function InlineEdit({
  value, onSave, placeholder = "", multiline = false, style = {},
}: {
  value: string; onSave: (v: string) => void; placeholder?: string;
  multiline?: boolean; style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const base: React.CSSProperties = {
    background: "transparent", border: "none", outline: "none",
    color: "#e4e4e7", fontSize: 12, fontFamily: "inherit", width: "100%",
    resize: "none", padding: 0, cursor: "pointer", ...style,
  };
  const editStyle: React.CSSProperties = {
    ...base, cursor: "text",
    background: "#18181b", border: "1px solid #3f3f46",
    borderRadius: 4, padding: "2px 6px",
  };

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{ ...base, display: "block", minHeight: 18, color: value ? "#e4e4e7" : "#52525b" }}
      >
        {value || placeholder}
      </span>
    );
  }

  const save = () => { setEditing(false); if (draft !== value) onSave(draft); };

  if (multiline) {
    return (
      <textarea
        autoFocus rows={3} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        style={editStyle}
      />
    );
  }
  return (
    <input
      autoFocus value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      style={editStyle}
    />
  );
}

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
        style={{ cursor: "pointer", color: value > 0 ? "#50E0B0" : "#52525b", fontSize: 12, fontWeight: 600 }}
        title="Click to edit views"
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
      style={{
        width: 80, background: "#18181b", border: "1px solid #3f3f46",
        borderRadius: 4, color: "#50E0B0", fontSize: 12, fontWeight: 600,
        padding: "1px 6px", outline: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Add Idea Form
// ---------------------------------------------------------------------------
function AddIdeaForm({ onAdd, onCancel }: { onAdd: (data: any) => void; onCancel: () => void }) {
  const [page, setPage] = useState<ExpPage>("indianfoundersco");
  const [contentType, setContentType] = useState<ContentType>("reel");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [dayDate, setDayDate] = useState(toLocalISO(new Date()));

  const sel: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
    fontSize: 12, background: "#09090b", color: "#e4e4e7", cursor: "pointer",
  };
  const inp: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
    fontSize: 12, background: "#09090b", color: "#e4e4e7", outline: "none", width: "100%",
  };

  return (
    <div style={{
      background: "#111113", border: "1px solid #3f3f46", borderRadius: 10,
      padding: "16px 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={page} onChange={e => setPage(e.target.value as ExpPage)} style={sel}>
          {EXP_PAGES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {(["reel", "post"] as ContentType[]).map(t => (
            <button
              key={t}
              onClick={() => setContentType(t)}
              style={{
                padding: "5px 12px", border: "none", fontSize: 12, fontWeight: 500,
                cursor: "pointer",
                background: contentType === t ? "#3f3f46" : "transparent",
                color: contentType === t ? "#fff" : "#71717a",
              }}
            >
              {t === "reel" ? "Reel" : "Post"}
            </button>
          ))}
        </div>
        <input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} style={{ ...sel, width: "auto" }} />
      </div>
      <input
        placeholder="Topic / hook"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        style={inp}
      />
      <textarea
        placeholder="Script or notes (optional)"
        value={script}
        onChange={e => setScript(e.target.value)}
        rows={2}
        style={{ ...inp, resize: "none" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { if (topic.trim()) onAdd({ page_handle: page, content_type: contentType, topic: topic.trim(), script, day_date: dayDate }); }}
          style={{
            padding: "6px 16px", borderRadius: 7, border: "none", background: "#7c3aed",
            color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Add idea
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "6px 16px", borderRadius: 7, border: "1px solid #3f3f46", background: "transparent", color: "#71717a", fontSize: 12, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idea Card (used in Idea Bank / All tab)
// ---------------------------------------------------------------------------
function IdeaCard({ idea, onUpdate, onDelete }: { idea: any; onUpdate: (id: string, data: any) => void; onDelete: (id: string) => void }) {
  const sc = STATUS_COLORS[idea.status] || STATUS_COLORS.draft;
  const pc = PAGE_COLORS[idea.page_handle] || "#e4e4e7";

  return (
    <div style={{
      background: "#111113", border: "1px solid #27272a", borderRadius: 8,
      padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px" }}>
          {idea.page_handle}
        </span>
        <span style={{ fontSize: 11, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          {idea.content_type}
        </span>
        <select
          value={idea.status}
          onChange={e => onUpdate(idea.id, { status: e.target.value })}
          style={{ fontSize: 11, fontWeight: 600, color: sc.text, background: sc.bg, border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
        >
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="killed">Killed</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#52525b" }}>
          <DayLabel dateStr={idea.day_date} />
        </span>
        <ViewsEdit value={idea.views || 0} onSave={v => onUpdate(idea.id, { views: v })} />
        <button
          onClick={() => { if (confirm("Delete this idea?")) onDelete(idea.id); }}
          style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
          title="Delete"
        >
          ×
        </button>
      </div>
      <InlineEdit
        value={idea.topic || ""}
        onSave={v => onUpdate(idea.id, { topic: v })}
        placeholder="Topic / hook…"
        style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}
      />
      {(idea.script || idea._showScript) && (
        <InlineEdit
          value={idea.script || ""}
          onSave={v => onUpdate(idea.id, { script: v })}
          placeholder="Script / notes…"
          multiline
          style={{ fontSize: 11, color: "#a1a1aa" }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive card (read-only, used in Content Bank)
// ---------------------------------------------------------------------------
function ArchiveCard({ item }: { item: any }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.draft;
  const pc = PAGE_COLORS[item.page_handle] || "#e4e4e7";
  return (
    <div style={{
      background: "#111113", border: "1px solid #27272a", borderRadius: 8,
      padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px" }}>
          {item.page_handle}
        </span>
        <span style={{ fontSize: 11, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          {item.content_type}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: sc.text, background: sc.bg, borderRadius: 4, padding: "2px 6px" }}>
          {item.status}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: item.views > 0 ? "#50E0B0" : "#52525b", fontWeight: 600 }}>
          {item.views > 0 ? fmt(item.views) : "—"}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}>{item.topic || <em style={{ color: "#52525b" }}>No topic</em>}</p>
      {item.script && <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>{item.script}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Working Idea Card
// ---------------------------------------------------------------------------
function WorkingIdeaCard({ item, onDistribute }: { item: any; onDistribute: (id: string) => void }) {
  const pc = PAGE_COLORS[item.page_handle] || "#e4e4e7";
  return (
    <div style={{
      background: "#111113", border: `1px solid ${item.distributed ? "#27272a" : "#4c1d95"}`,
      borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6,
      opacity: item.distributed ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: pc, background: pc + "22", borderRadius: 4, padding: "2px 7px" }}>
          {item.page_handle}
        </span>
        <span style={{ fontSize: 11, color: "#71717a", background: "#27272a", borderRadius: 4, padding: "2px 7px" }}>
          {item.content_type}
        </span>
        <span style={{ fontSize: 11, color: "#52525b" }}>Week {item.week_number}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#50E0B0" }}>
          {fmt(item.views_achieved)}
        </span>
        {item.distributed ? (
          <span style={{ fontSize: 11, color: "#52525b", fontStyle: "italic" }}>Distributed</span>
        ) : (
          <button
            onClick={() => onDistribute(item.id)}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "none",
              background: "#7c3aed", color: "#fff", fontSize: 11,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Distribute to all pages
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}>{item.topic || <em style={{ color: "#52525b" }}>No topic</em>}</p>
      {item.script && <p style={{ margin: 0, fontSize: 11, color: "#71717a" }}>{item.script}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day group accordion
// ---------------------------------------------------------------------------
function DayGroup({ dateStr, children, defaultOpen = true }: { dateStr: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = Array.isArray(children) ? children.length : (children ? 1 : 0);
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "none", border: "none", cursor: "pointer",
          color: "#a1a1aa", fontSize: 12, fontWeight: 600, padding: "4px 0", marginBottom: 6,
        }}
      >
        <span style={{ color: open ? "#7c3aed" : "#52525b", fontSize: 10 }}>{open ? "▼" : "▶"}</span>
        <DayLabel dateStr={dateStr} />
        <span style={{ color: "#52525b", fontWeight: 400 }}>· {count} idea{count !== 1 ? "s" : ""}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 16 }}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All tab (Idea Bank — current week, editable)
// ---------------------------------------------------------------------------
function AllTab({ pageFilter }: { pageFilter: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: settings } = useQuery({ queryKey: ["exp-settings"], queryFn: getExpSettings });
  const currentWeek = useMemo(() => {
    if (!settings?.experiment_start_date) return 1;
    const start = new Date(settings.experiment_start_date + "T00:00:00");
    const today = new Date();
    const delta = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.floor(delta / 7) + 1);
  }, [settings]);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["exp-idea-bank", currentWeek, pageFilter],
    queryFn: () => getExpIdeaBank({ week: currentWeek, page: pageFilter === "all" ? undefined : pageFilter }),
  });

  const createMut = useMutation({
    mutationFn: createExpIdea,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }); setShowAdd(false); },
    onError: () => toast.error("Failed to add idea"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateExpIdea(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }),
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteExpIdea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-idea-bank"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveExpWeek(currentWeek),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["exp-content-bank"] });
      qc.invalidateQueries({ queryKey: ["exp-content-bank-weeks"] });
      toast.success(`Archived ${res.archived} idea${res.archived !== 1 ? "s" : ""} as ${res.week_label}`);
    },
    onError: () => toast.error("Archive failed"),
  });

  const grouped = useMemo(() => groupByDay(ideas), [ideas]);
  const days = Object.keys(grouped).sort();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>
          Week {currentWeek} · {ideas.length} idea{ideas.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowAdd(s => !s)}
          style={{
            padding: "5px 14px", borderRadius: 7, border: "none",
            background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          + Add idea
        </button>
        <button
          onClick={() => { if (confirm(`Archive all Week ${currentWeek} ideas to Content Bank?`)) archiveMut.mutate(); }}
          disabled={archiveMut.isPending || ideas.length === 0}
          style={{
            padding: "5px 14px", borderRadius: 7, border: "1px solid #3f3f46",
            background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer",
            opacity: ideas.length === 0 ? 0.4 : 1,
          }}
        >
          {archiveMut.isPending ? "Archiving…" : "Archive this week"}
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
      ) : days.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>No ideas for this week yet. Add the first one!</p>
      ) : (
        days.map(day => (
          <DayGroup key={day} dateStr={day} defaultOpen={true}>
            {grouped[day].map(idea => (
              <IdeaCard
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
// Content Bank tab (read-only archive, week selector)
// ---------------------------------------------------------------------------
function ContentBankTab({ pageFilter }: { pageFilter: string }) {
  const { data: weeks = [] } = useQuery({
    queryKey: ["exp-content-bank-weeks"],
    queryFn: getExpContentBankWeeks,
  });

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const activeWeek = selectedWeek ?? (weeks[weeks.length - 1]?.week_number ?? null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["exp-content-bank", activeWeek, pageFilter],
    queryFn: () => activeWeek != null
      ? getExpContentBank({ week: activeWeek, page: pageFilter === "all" ? undefined : pageFilter })
      : Promise.resolve([]),
    enabled: activeWeek != null,
  });

  const grouped = useMemo(() => groupByDay(items), [items]);
  const days = Object.keys(grouped).sort();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {weeks.length === 0 ? (
          <span style={{ fontSize: 12, color: "#52525b" }}>No archived weeks yet — use "Archive this week" in the Idea Bank.</span>
        ) : (
          <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46", flexWrap: "wrap" }}>
            {weeks.map(w => (
              <button
                key={w.week_number}
                onClick={() => setSelectedWeek(w.week_number)}
                style={{
                  padding: "5px 12px", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: activeWeek === w.week_number ? "#3f3f46" : "transparent",
                  color: activeWeek === w.week_number ? "#fff" : "#71717a",
                }}
              >
                {w.week_label}
              </button>
            ))}
          </div>
        )}
        {activeWeek != null && (
          <span style={{ fontSize: 12, color: "#71717a" }}>{items.length} idea{items.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : activeWeek == null ? null : days.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Nothing archived for this week.</p>
      ) : (
        days.map(day => (
          <DayGroup key={day} dateStr={day} defaultOpen={true}>
            {grouped[day].map(item => (
              <ArchiveCard key={item.id} item={item} />
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
function WorkingIdeasTab({ pageFilter }: { pageFilter: string }) {
  const qc = useQueryClient();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const { data: settings } = useQuery({ queryKey: ["exp-settings"], queryFn: getExpSettings });
  const viewGoal: number = settings?.view_goal ?? 100000;

  const updateSettingsMut = useMutation({
    mutationFn: updateExpSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exp-settings"] }); setEditingGoal(false); },
    onError: () => toast.error("Failed to update goal"),
  });

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["exp-working-ideas", pageFilter],
    queryFn: () => getExpWorkingIdeas({ page: pageFilter === "all" ? undefined : pageFilter }),
  });

  const distributeMut = useMutation({
    mutationFn: distributeExpWorkingIdea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exp-working-ideas"] }),
    onError: () => toast.error("Failed to mark distributed"),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>
          Current goal:
        </span>
        {editingGoal ? (
          <>
            <input
              autoFocus
              value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const n = parseInt(goalDraft.replace(/[^0-9]/g, ""), 10);
                  if (!isNaN(n)) updateSettingsMut.mutate({ view_goal: n });
                }
                if (e.key === "Escape") setEditingGoal(false);
              }}
              style={{
                width: 100, background: "#18181b", border: "1px solid #3f3f46",
                borderRadius: 6, color: "#50E0B0", fontSize: 13, fontWeight: 700,
                padding: "3px 8px", outline: "none",
              }}
            />
            <button
              onClick={() => { const n = parseInt(goalDraft.replace(/[^0-9]/g, ""), 10); if (!isNaN(n)) updateSettingsMut.mutate({ view_goal: n }); }}
              style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontSize: 11, cursor: "pointer" }}
            >
              Save
            </button>
            <button
              onClick={() => setEditingGoal(false)}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#71717a", fontSize: 11, cursor: "pointer" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#50E0B0" }}>{fmt(viewGoal)} views</span>
            <button
              onClick={() => { setGoalDraft(String(viewGoal)); setEditingGoal(true); }}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#71717a", fontSize: 11, cursor: "pointer" }}
            >
              Edit goal
            </button>
          </>
        )}
        <span style={{ marginLeft: 8, fontSize: 12, color: "#52525b" }}>
          {ideas.length} proven idea{ideas.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>Loading…</p>
      ) : ideas.length === 0 ? (
        <p style={{ color: "#52525b", fontSize: 12 }}>
          No ideas have crossed {fmt(viewGoal)} views yet. Keep going!
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ideas.map(item => (
            <WorkingIdeaCard
              key={item.id}
              item={item}
              onDistribute={id => distributeMut.mutate(id)}
            />
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

  const tabLabel: Record<TabMode, string> = {
    "all": "All",
    "content-bank": "Content Bank",
    "working-ideas": "Working Ideas",
  };

  const sel: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 7, border: "1.5px solid #3f3f46",
    fontSize: 12, background: "#09090b", color: "#e4e4e7", cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", padding: "80px 40px 60px", color: "#e4e4e7" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
          Experiment X <span style={{ fontSize: 16, color: "#7c3aed" }}>🧪</span>
        </h1>
        <p style={{ fontSize: 13, color: "#71717a", margin: "4px 0 0" }}>
          5 pages · {EXP_PAGES.join(", ")}
        </p>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#27272a", borderRadius: 7, overflow: "hidden", border: "1px solid #3f3f46" }}>
          {(["all", "content-bank", "working-ideas"] as TabMode[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "5px 14px", border: "none", fontSize: 12, fontWeight: 500,
                cursor: "pointer",
                background: tab === t
                  ? (t === "working-ideas" ? "#534AB7" : t === "content-bank" ? "#1A5E3A" : "#3f3f46")
                  : "transparent",
                color: tab === t ? "#fff" : "#71717a",
              }}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>

        {/* Page filter */}
        <select value={pageFilter} onChange={e => setPageFilter(e.target.value)} style={sel}>
          <option value="all">All pages</option>
          {EXP_PAGES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 900 }}>
        {tab === "all" && <AllTab pageFilter={pageFilter} />}
        {tab === "content-bank" && <ContentBankTab pageFilter={pageFilter} />}
        {tab === "working-ideas" && <WorkingIdeasTab pageFilter={pageFilter} />}
      </div>
    </div>
  );
}
