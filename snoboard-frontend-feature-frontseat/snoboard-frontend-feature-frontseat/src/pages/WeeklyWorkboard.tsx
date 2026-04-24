import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  WORKBOARD_ROLES,
  CHUNK_STATUS_LABEL,
  type WorkboardRoleId,
  type MainAssignment,
  type WorkboardChunk,
  type WorkboardInterrupt,
  type ChunkStatus,
  getMondayISO,
  addDaysISO,
  fmtWeekRange,
  rollupPercent,
  newId,
} from "@/lib/workboardTypes";
import { LayoutGrid, List, ChevronLeft, ChevronRight, Plus, Trash2, Link2 } from "lucide-react";

const STORAGE_KEY = "fsboard-weekly-workboard-v1";

function loadStore(): MainAssignment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (p?.version === 1 && Array.isArray(p.assignments)) return p.assignments;
  } catch {
    /* ignore */
  }
  return [];
}

function saveStore(assignments: MainAssignment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, assignments }));
}

function roleLabel(id: WorkboardRoleId) {
  return WORKBOARD_ROLES.find((r) => r.id === id)?.label ?? id;
}

function roleShort(id: WorkboardRoleId) {
  return WORKBOARD_ROLES.find((r) => r.id === id)?.short ?? id;
}

const STATUS_OPTIONS: ChunkStatus[] = ["not_started", "in_progress", "completed"];

export default function WeeklyWorkboard() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getMondayISO());
  const [view, setView] = useState<"list" | "gallery">("list");
  const [assignments, setAssignments] = useState<MainAssignment[]>(() => loadStore());

  useEffect(() => {
    saveStore(assignments);
  }, [assignments]);

  const weekAssignments = useMemo(
    () => assignments.filter((a) => a.week_start === weekStart),
    [assignments, weekStart]
  );

  const byRole = useMemo(() => {
    const m = new Map<WorkboardRoleId, MainAssignment>();
    weekAssignments.forEach((a) => m.set(a.role_id, a));
    return m;
  }, [weekAssignments]);

  const upsertAssignment = useCallback((next: MainAssignment) => {
    setAssignments((prev) => {
      const i = prev.findIndex((a) => a.id === next.id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = next;
        return copy;
      }
      return [...prev, next];
    });
  }, []);

  const removeAssignment = useCallback((id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAssignment = useCallback(
    (role_id: WorkboardRoleId) => {
      const id = newId();
      upsertAssignment({
        id,
        role_id,
        week_start: weekStart,
        title: "",
        description: "",
        due_date: addDaysISO(weekStart, 4),
        chunks: [],
        interrupts: [],
      });
    },
    [weekStart, upsertAssignment]
  );

  const updateChunk = useCallback(
    (assignmentId: string, chunkId: string, patch: Partial<WorkboardChunk>) => {
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          return {
            ...a,
            chunks: a.chunks.map((c) => (c.id === chunkId ? { ...c, ...patch } : c)),
          };
        })
      );
    },
    []
  );

  const addChunk = useCallback((assignmentId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        const n = a.chunks.length;
        return {
          ...a,
          chunks: [
            ...a.chunks,
            { id: newId(), title: "", status: "not_started", sort_order: n },
          ],
        };
      })
    );
  }, []);

  const removeChunk = useCallback((assignmentId: string, chunkId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return { ...a, chunks: a.chunks.filter((c) => c.id !== chunkId) };
      })
    );
  }, []);

  const updateInterrupt = useCallback(
    (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => {
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          return {
            ...a,
            interrupts: a.interrupts.map((x) => (x.id === intId ? { ...x, ...patch } : x)),
          };
        })
      );
    },
    []
  );

  const addInterrupt = useCallback((assignmentId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return {
          ...a,
          interrupts: [
            ...a.interrupts,
            {
              id: newId(),
              title: "",
              status: "not_started",
              note: "",
              blocks_target_id: null,
              blocks_target_kind: null,
            },
          ],
        };
      })
    );
  }, []);

  const removeInterrupt = useCallback((assignmentId: string, intId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return { ...a, interrupts: a.interrupts.filter((x) => x.id !== intId) };
      })
    );
  }, []);

  const patchAssignment = useCallback((id: string, patch: Partial<MainAssignment>) => {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="pl-[70px] pr-6 pt-6 pb-10 max-w-[1200px] mx-auto">
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-400 mb-1">
            Cross-team weekly workboard
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Studio & ops bandwidth</h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-2xl">
            For{" "}
            <span className="text-zinc-400">
              AI Developer, Graphic Designer, Ops Manager, Boss Man, Video Editor, Content Creator
            </span>
            . Managers set the main assignment; each person breaks it into phases, tracks interrupts, and links what
            blocked what. Data is stored in this browser for now — we can wire Supabase next.
          </p>
          {user?.email && (
            <p className="text-xs text-zinc-600 mt-2">Signed in as {user.email}</p>
          )}
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 p-1">
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
              className="p-2 rounded-md hover:bg-zinc-800 text-zinc-400"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-medium text-zinc-200 min-w-[200px] text-center">
              {fmtWeekRange(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
              className="p-2 rounded-md hover:bg-zinc-800 text-zinc-400"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(getMondayISO())}
              className="ml-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              This week
            </button>
          </div>

          <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
                view === "list" ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-l border-zinc-800 ${
                view === "gallery" ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Gallery
            </button>
          </div>
        </div>

        {view === "gallery" ? (
          <GalleryView
            byRole={byRole}
            addAssignment={addAssignment}
            removeAssignment={removeAssignment}
            patchAssignment={patchAssignment}
            addChunk={addChunk}
            removeChunk={removeChunk}
            updateChunk={updateChunk}
            addInterrupt={addInterrupt}
            removeInterrupt={removeInterrupt}
            updateInterrupt={updateInterrupt}
          />
        ) : (
          <ListView
            weekAssignments={weekAssignments}
            addAssignment={addAssignment}
            removeAssignment={removeAssignment}
            patchAssignment={patchAssignment}
            addChunk={addChunk}
            removeChunk={removeChunk}
            updateChunk={updateChunk}
            addInterrupt={addInterrupt}
            removeInterrupt={removeInterrupt}
            updateInterrupt={updateInterrupt}
          />
        )}
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChunkStatusSelect({
  value,
  onChange,
}: {
  value: ChunkStatus;
  onChange: (v: ChunkStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChunkStatus)}
      className="text-xs rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {CHUNK_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function AssignmentEditor({
  a,
  compact,
  removeAssignment,
  patchAssignment,
  addChunk,
  removeChunk,
  updateChunk,
  addInterrupt,
  removeInterrupt,
  updateInterrupt,
}: {
  a: MainAssignment;
  compact?: boolean;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, patch: Partial<MainAssignment>) => void;
  addChunk: (assignmentId: string) => void;
  removeChunk: (assignmentId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const pct = rollupPercent(a.chunks);
  const blockOptions: { id: string; kind: "main" | "chunk"; label: string }[] = [
    { id: a.id, kind: "main", label: `Main: ${a.title || "(untitled)"}` },
    ...a.chunks.map((c) => ({ id: c.id, kind: "chunk" as const, label: `Chunk: ${c.title || "…"}` })),
  ];

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
            {roleLabel(a.role_id)}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500 w-24">Main task</span>
            <input
              value={a.title}
              onChange={(e) => patchAssignment(a.id, { title: e.target.value })}
              placeholder="e.g. Ship view tracker + bandwidth"
              className="flex-1 min-w-[200px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeAssignment(a.id)}
          className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
          title="Remove assignment"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500">Due date</label>
          <input
            type="date"
            value={a.due_date}
            onChange={(e) => patchAssignment(a.id, { due_date: e.target.value })}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase font-semibold text-zinc-500">Rollup (from chunks)</label>
          <div className="mt-2">
            <ProgressBar pct={pct} />
            <p className="text-xs text-zinc-500 mt-1">{pct}% — {a.chunks.filter((c) => c.status === "completed").length}/{a.chunks.length || 0} chunks done</p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="text-[10px] uppercase font-semibold text-zinc-500">Details / brief</label>
        <textarea
          value={a.description}
          onChange={(e) => patchAssignment(a.id, { description: e.target.value })}
          rows={compact ? 2 : 3}
          placeholder="What the manager asked for…"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm resize-y"
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase text-zinc-400">Your chunks (phases)</h3>
          <button
            type="button"
            onClick={() => addChunk(a.id)}
            className="flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300"
          >
            <Plus className="w-3.5 h-3.5" />
            Add chunk
          </button>
        </div>
        {a.chunks.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2">Break the main task into steps (wireframe, UI, build, ship…).</p>
        ) : (
          <ul className="space-y-2">
            {a.chunks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-950/80 border border-zinc-800 p-2">
                <input
                  value={c.title}
                  onChange={(e) => updateChunk(a.id, c.id, { title: e.target.value })}
                  placeholder="Chunk name"
                  className="flex-1 min-w-[140px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                />
                <ChunkStatusSelect value={c.status} onChange={(v) => updateChunk(a.id, c.id, { status: v })} />
                <button
                  type="button"
                  onClick={() => removeChunk(a.id, c.id)}
                  className="p-1.5 text-zinc-600 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase text-zinc-400 flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5" />
            Interrupts & blockers
          </h3>
          <button
            type="button"
            onClick={() => addInterrupt(a.id)}
            className="flex items-center gap-1 text-xs font-semibold text-amber-400/90 hover:text-amber-300"
          >
            <Plus className="w-3.5 h-3.5" />
            Add interrupt
          </button>
        </div>
        {a.interrupts.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2">Urgent tickets, bugs, or side quests — link what they blocked.</p>
        ) : (
          <ul className="space-y-3">
            {a.interrupts.map((it) => (
              <li key={it.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={it.title}
                    onChange={(e) => updateInterrupt(a.id, it.id, { title: e.target.value })}
                    placeholder="What came up?"
                    className="flex-1 min-w-[160px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  />
                  <ChunkStatusSelect
                    value={it.status}
                    onChange={(v) => updateInterrupt(a.id, it.id, { status: v })}
                  />
                  <button
                    type="button"
                    onClick={() => removeInterrupt(a.id, it.id)}
                    className="p-1.5 text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  <span className="text-zinc-500">Blocks:</span>
                  <select
                    value={
                      it.blocks_target_id
                        ? `${it.blocks_target_kind}:${it.blocks_target_id}`
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        updateInterrupt(a.id, it.id, {
                          blocks_target_id: null,
                          blocks_target_kind: null,
                        });
                        return;
                      }
                      const [kind, ...rest] = v.split(":");
                      const id = rest.join(":");
                      updateInterrupt(a.id, it.id, {
                        blocks_target_kind: kind as "main" | "chunk",
                        blocks_target_id: id,
                      });
                    }}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
                  >
                    <option value="">— nothing linked —</option>
                    {blockOptions.map((o) => (
                      <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={it.note}
                  onChange={(e) => updateInterrupt(a.id, it.id, { note: e.target.value })}
                  placeholder="Note: e.g. spent 4h here today; main chunk slipped…"
                  rows={2}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm resize-y"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ListView({
  weekAssignments,
  addAssignment,
  removeAssignment,
  patchAssignment,
  addChunk,
  removeChunk,
  updateChunk,
  addInterrupt,
  removeInterrupt,
  updateInterrupt,
}: {
  weekAssignments: MainAssignment[];
  addAssignment: (role_id: WorkboardRoleId) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, patch: Partial<MainAssignment>) => void;
  addChunk: (assignmentId: string) => void;
  removeChunk: (assignmentId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const missingRoles = WORKBOARD_ROLES.filter((r) => !weekAssignments.some((a) => a.role_id === r.id));

  return (
    <div className="space-y-6">
      {weekAssignments.map((a) => (
        <AssignmentEditor
          key={a.id}
          a={a}
          removeAssignment={removeAssignment}
          patchAssignment={patchAssignment}
          addChunk={addChunk}
          removeChunk={removeChunk}
          updateChunk={updateChunk}
          addInterrupt={addInterrupt}
          removeInterrupt={removeInterrupt}
          updateInterrupt={updateInterrupt}
        />
      ))}

      {missingRoles.length > 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-4">
          <p className="text-xs text-zinc-500 mb-3">Add a row for a role (manager assignment for this week):</p>
          <div className="flex flex-wrap gap-2">
            {missingRoles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addAssignment(r.id)}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-violet-600 hover:text-white border border-zinc-700"
              >
                + {r.short}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GalleryView({
  byRole,
  addAssignment,
  removeAssignment,
  patchAssignment,
  addChunk,
  removeChunk,
  updateChunk,
  addInterrupt,
  removeInterrupt,
  updateInterrupt,
}: {
  byRole: Map<WorkboardRoleId, MainAssignment>;
  addAssignment: (role_id: WorkboardRoleId) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, patch: Partial<MainAssignment>) => void;
  addChunk: (assignmentId: string) => void;
  removeChunk: (assignmentId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const [expandId, setExpandId] = useState<string | null>(null);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {WORKBOARD_ROLES.map((r) => {
        const a = byRole.get(r.id);
        if (!a) {
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => addAssignment(r.id)}
              className="rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/20 p-6 text-left hover:border-violet-500/50 hover:bg-zinc-900/40 transition-colors min-h-[160px] flex flex-col justify-center"
            >
              <span className="text-sm font-bold text-zinc-400">{r.label}</span>
              <span className="text-xs text-zinc-600 mt-2">Click to add this week&apos;s assignment</span>
            </button>
          );
        }
        const pct = rollupPercent(a.chunks);
        const open = expandId === a.id;
        return (
          <div
            key={a.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col"
          >
            <div className="p-4 flex-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-violet-400 uppercase tracking-wide">{roleShort(r.id)}</span>
                <span className="text-[10px] text-zinc-500">{a.due_date}</span>
              </div>
              <h2 className="text-sm font-semibold text-white line-clamp-2 min-h-[2.5rem]">
                {a.title || "Untitled main task"}
              </h2>
              <div className="mt-3">
                <ProgressBar pct={pct} />
                <p className="text-[11px] text-zinc-500 mt-1">{pct}% complete · {a.interrupts.length} interrupts</p>
              </div>
            </div>
            <div className="border-t border-zinc-800 p-2 flex gap-2">
              <button
                type="button"
                onClick={() => setExpandId(open ? null : a.id)}
                className="flex-1 py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              >
                {open ? "Collapse" : "Expand"}
              </button>
              <button
                type="button"
                onClick={() => removeAssignment(a.id)}
                className="px-3 py-2 text-xs rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mx-auto" />
              </button>
            </div>
            {open && (
              <div className="border-t border-zinc-800 p-4 bg-zinc-950/80 max-h-[70vh] overflow-y-auto">
                <AssignmentEditor
                  a={a}
                  compact
                  removeAssignment={removeAssignment}
                  patchAssignment={patchAssignment}
                  addChunk={addChunk}
                  removeChunk={removeChunk}
                  updateChunk={updateChunk}
                  addInterrupt={addInterrupt}
                  removeInterrupt={removeInterrupt}
                  updateInterrupt={updateInterrupt}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
