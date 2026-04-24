import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkboardMentionCandidates } from "@/services/api";
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
  normalizeAssignments,
  mentionFromName,
  workboardMentionSubtitle,
} from "@/lib/workboardTypes";
import type { WorkboardMentionPerson } from "@/services/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Plus, Trash2, Link2, AtSign, User } from "lucide-react";

const STORAGE_KEY = "fsboard-weekly-workboard-v1";

function loadStore(): MainAssignment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (p?.version === 1 && Array.isArray(p.assignments)) return normalizeAssignments(p.assignments);
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

/** Human label for what an interrupt is blocking (main vs chunk title). */
function blockTargetLabel(a: MainAssignment, kind: "main" | "chunk" | null, targetId: string | null): string {
  if (!kind || !targetId) return "";
  if (kind === "main") return `main: ${a.title || "(untitled)"}`;
  const ch = a.chunks.find((c) => c.id === targetId);
  return ch?.title ? `chunk: ${ch.title}` : "a chunk";
}

/** Logged-in user's @mention — used only to hide that person from quick-pick (don't tag yourself). */
function workboardSelfMention(user: { user_metadata?: { full_name?: string; name?: string }; email?: string } | null): string | null {
  if (!user) return null;
  const full = (user.user_metadata?.full_name || user.user_metadata?.name || "").trim();
  const first = full.split(/\s+/).filter(Boolean)[0];
  if (first) return `@${first}`;
  const local = (user.email || "").split("@")[0];
  return local ? `@${local}` : null;
}

function isPersonMentionTag(t: string): boolean {
  return t.trim().startsWith("@");
}

function allAssignmentTags(a: MainAssignment): string[] {
  const set = new Set<string>();
  (a.tags || []).forEach((t) => t && set.add(t));
  a.interrupts.forEach((i) => (i.tags || []).forEach((t) => t && set.add(t)));
  return [...set];
}

function TagField({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { user } = useAuth();
  const mentionListId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const { data: mentionPayload } = useQuery({
    queryKey: ["workboard-mention-candidates"],
    queryFn: getWorkboardMentionCandidates,
    staleTime: 5 * 60 * 1000,
  });
  const apiPeople: WorkboardMentionPerson[] = mentionPayload?.people ?? [];

  const mentionPickerPeople = useMemo(() => {
    const self = workboardSelfMention(user)?.toLowerCase() ?? "";
    return apiPeople
      .filter((p) => p.role_id || p.email || p.is_content_strategist)
      .filter((p) => {
        const tag = mentionFromName(p.display).toLowerCase();
        return tag && tag !== self;
      })
      .sort((a, b) => a.display.toLowerCase().localeCompare(b.display.toLowerCase()));
  }, [user, apiPeople]);

  const mentionMenu = useMemo(() => {
    const at = draft.lastIndexOf("@");
    if (at === -1) return null;
    const after = draft.slice(at + 1);
    if (/\s/.test(after)) return null;
    return { at, filter: after.toLowerCase() };
  }, [draft]);

  const mentionFiltered = useMemo(() => {
    if (!mentionMenu) return [];
    const q = mentionMenu.filter;
    return mentionPickerPeople.filter((p) => {
      if (!q) return true;
      const disp = p.display.toLowerCase();
      const em = (p.email || "").toLowerCase();
      const sub = (
        workboardMentionSubtitle(p.role_id, p.email, { isContentStrategist: p.is_content_strategist }) || ""
      ).toLowerCase();
      return disp.includes(q) || em.includes(q) || sub.includes(q);
    });
  }, [mentionMenu, mentionPickerPeople]);

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionMenu?.at, mentionMenu?.filter, mentionFiltered.length]);

  const pushTag = (raw: string) => {
    let t = raw.trim();
    if (!t) return;
    if (!t.startsWith("@") && !t.startsWith("#")) {
      if (t.includes(" ")) {
        /* keep as free-form label */
      } else if (/^\d+$/.test(t)) {
        t = `#${t}`;
      } else {
        t = `@${t}`;
      }
    }
    if (tags.includes(t)) return;
    onChange([...tags, t]);
  };

  const pickMention = (person: WorkboardMentionPerson) => {
    if (!mentionMenu) return;
    setDraft(draft.slice(0, mentionMenu.at));
    pushTag(mentionFromName(person.display));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const person = isPersonMentionTag(t);
            return (
              <span
                key={t}
                className={`inline-flex items-center gap-0.5 pl-2.5 pr-1 py-0.5 rounded-full text-[12px] max-w-full border ${
                  person
                    ? "bg-sky-500/15 text-sky-100 border-sky-400/25"
                    : "bg-stone-500/10 text-stone-200 border-stone-400/15"
                }`}
              >
                {person ? <AtSign className="w-3 h-3 shrink-0 opacity-70" /> : null}
                <span className="truncate max-w-[200px]" title={t}>
                  {person ? t.slice(1) : t}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  className={`shrink-0 px-1 rounded-full text-sm leading-none opacity-60 hover:opacity-100 ${
                    person ? "hover:bg-sky-500/20" : "hover:bg-stone-500/20"
                  }`}
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (mentionMenu) {
              if (mentionFiltered.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionHighlight((i) => (i + 1) % mentionFiltered.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionHighlight((i) => (i - 1 + mentionFiltered.length) % mentionFiltered.length);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  pickMention(mentionFiltered[mentionHighlight]!);
                  return;
                }
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(draft.slice(0, mentionMenu.at));
                return;
              }
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (mentionMenu && mentionFiltered.length === 0) return;
              pushTag(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder || "Type @ for people, #ticket and Enter…"}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          role="combobox"
          aria-expanded={Boolean(mentionMenu)}
          aria-controls={mentionMenu ? `${mentionListId}-listbox` : undefined}
          aria-autocomplete="list"
        />
        {mentionMenu ? (
          <ul
            id={`${mentionListId}-listbox`}
            role="listbox"
            className="absolute z-50 left-0 right-0 bottom-full mb-1.5 max-h-[min(320px,50vh)] overflow-y-auto rounded-xl border border-white/[0.12] bg-[#141416]/[0.98] shadow-[0_-16px_48px_rgba(0,0,0,0.55)] py-1.5 backdrop-blur-md"
          >
            <li className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500" role="presentation">
              People
            </li>
            {mentionFiltered.length === 0 ? (
              <li className="px-3 py-2.5 text-xs text-zinc-500" role="presentation">
                No matches — keep typing or press Esc
              </li>
            ) : (
              mentionFiltered.map((person, idx) => {
                const sub = workboardMentionSubtitle(person.role_id, person.email, {
                  isContentStrategist: person.is_content_strategist,
                });
                const rowKey = `${person.display}|${person.email ?? ""}|${person.role_id ?? ""}`;
                return (
                  <li key={rowKey} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === mentionHighlight}
                      className={`mx-1 flex w-[calc(100%-0.5rem)] items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        idx === mentionHighlight
                          ? "bg-white/[0.1] text-zinc-50"
                          : "text-zinc-200 hover:bg-white/[0.05]"
                      }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickMention(person);
                      }}
                      onMouseEnter={() => setMentionHighlight(idx)}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-400">
                        <User className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium leading-tight">{person.display}</span>
                        {sub ? (
                          <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-500">{sub}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function TagChipsRow({ tags, max = 6 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  const show = tags.slice(0, max);
  const more = tags.length - show.length;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {show.map((t) => {
        const person = isPersonMentionTag(t);
        return (
          <span
            key={t}
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] max-w-[170px] truncate border ${
              person
                ? "bg-sky-500/12 text-sky-100/90 border-sky-400/20"
                : "bg-stone-500/10 text-stone-300 border-stone-400/12"
            }`}
            title={t}
          >
            {person ? <AtSign className="w-2.5 h-2.5 shrink-0 opacity-60" /> : null}
            <span className="truncate">{person ? t.slice(1) : t}</span>
          </span>
        );
      })}
      {more > 0 && <span className="text-[10px] text-zinc-500 self-center">+{more}</span>}
    </div>
  );
}

function BlockingLines({ a }: { a: MainAssignment }) {
  const lines = a.interrupts
    .filter((it) => it.blocks_target_id && it.blocks_target_kind)
    .map((it) => {
      const tgt = blockTargetLabel(a, it.blocks_target_kind, it.blocks_target_id);
      const name = it.title?.trim() || "Interrupt";
      return `${name} → blocking ${tgt}`;
    });
  if (!lines.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {lines.map((line, i) => (
        <li key={i} className="text-[12px] text-orange-200/85 leading-snug flex gap-2">
          <span className="text-orange-400/50 shrink-0 mt-0.5">○</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

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
        tags: [],
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
              tags: [],
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
    <div
      className="min-h-screen text-zinc-100 bg-[#1a1a1c]"
      style={{
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
        backgroundImage: "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(56, 189, 248, 0.08), transparent 55%)",
      }}
    >
      <div className="pl-[70px] pr-6 pt-8 pb-12 max-w-[1100px] mx-auto">
        <header className="mb-10">
          <p className="text-sm text-sky-300/90 font-medium mb-1">Weekly workboard</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Studio &amp; ops</h1>
          <p className="text-[15px] text-zinc-400 mt-3 max-w-2xl leading-relaxed">
            Plan the week by role, split work into steps, and note what got in the way. Mention teammates with{" "}
            <span className="text-zinc-200">@name</span> (like Notion) or tickets with{" "}
            <span className="text-zinc-200">#13</span>. Edit the teammate list in{" "}
            <code className="text-zinc-500 text-[13px]">workboardTypes.ts</code> if needed. Saves on this device for now.
          </p>
          {user?.email && <p className="text-xs text-zinc-600 mt-3">{user.email}</p>}
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <div className="flex items-center gap-0.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
              className="p-2.5 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 text-sm font-medium text-zinc-100 min-w-[200px] text-center tabular-nums">
              {fmtWeekRange(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
              className="p-2.5 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(getMondayISO())}
              className="ml-0.5 mr-1 px-3 py-2 text-xs font-medium rounded-xl bg-white/[0.08] text-zinc-200 hover:bg-white/[0.12] transition-colors"
            >
              This week
            </button>
          </div>

          <div className="inline-flex rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                view === "list" ? "bg-sky-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setView("gallery")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                view === "gallery" ? "bg-sky-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
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

function interruptRollupPercent(interrupts: WorkboardInterrupt[]): number {
  if (!interrupts.length) return 0;
  const done = interrupts.filter((i) => i.status === "completed").length;
  return Math.round((done / interrupts.length) * 100);
}

function ProgressBar({ pct, variant = "sky" }: { pct: number; variant?: "sky" | "orange" }) {
  return (
    <div className="h-2 rounded-full bg-zinc-800/80 overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          variant === "orange"
            ? "bg-gradient-to-r from-orange-500 to-amber-400/90"
            : "bg-gradient-to-r from-sky-500 to-sky-400/90",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChunkStatusSelect({
  value,
  onChange,
  accent = "sky",
}: {
  value: ChunkStatus;
  onChange: (v: ChunkStatus) => void;
  /** Ring color when focused (chunks vs interrupts). */
  accent?: "sky" | "orange";
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ChunkStatus)}>
      <SelectTrigger
        className={cn(
          "h-9 w-[min(100%,11rem)] shrink-0 rounded-xl border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 shadow-none",
          "focus:ring-2 data-[state=open]:ring-2",
          accent === "orange" ? "focus:ring-orange-500/30 data-[state=open]:ring-orange-500/30" : "focus:ring-sky-500/30 data-[state=open]:ring-sky-500/30",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="z-[200] border border-white/10 bg-zinc-950 text-zinc-100 shadow-xl"
      >
        {STATUS_OPTIONS.map((s) => (
          <SelectItem
            key={s}
            value={s}
            className="cursor-pointer text-zinc-100 focus:bg-white/10 focus:text-white"
          >
            {CHUNK_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const INTERRUPT_BLOCKS_NONE = "__none__";

function InterruptBlocksSelect({
  blockOptions,
  targetKind,
  targetId,
  onChange,
}: {
  blockOptions: { id: string; kind: "main" | "chunk"; label: string }[];
  targetKind: "main" | "chunk" | null;
  targetId: string | null;
  onChange: (kind: "main" | "chunk" | null, id: string | null) => void;
}) {
  const value =
    targetId && targetKind ? `${targetKind}:${targetId}` : INTERRUPT_BLOCKS_NONE;
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === INTERRUPT_BLOCKS_NONE) {
          onChange(null, null);
          return;
        }
        const i = v.indexOf(":");
        const kind = v.slice(0, i) as "main" | "chunk";
        const id = v.slice(i + 1);
        onChange(kind, id);
      }}
    >
      <SelectTrigger className="h-8 min-w-[160px] max-w-[min(100%,280px)] rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 shadow-none focus:ring-2 focus:ring-orange-500/25 data-[state=open]:ring-2 data-[state=open]:ring-orange-500/25">
        <SelectValue placeholder="Nothing linked" />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="z-[200] max-h-72 border border-white/10 bg-zinc-950 text-zinc-100 shadow-xl"
      >
        <SelectItem
          value={INTERRUPT_BLOCKS_NONE}
          className="cursor-pointer text-zinc-100 focus:bg-white/10 focus:text-white"
        >
          Nothing linked
        </SelectItem>
        {blockOptions.map((o) => (
          <SelectItem
            key={`${o.kind}:${o.id}`}
            value={`${o.kind}:${o.id}`}
            className="cursor-pointer text-zinc-100 focus:bg-white/10 focus:text-white"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AssignmentEditor({
  a,
  compact,
  /** When true, skip role + trash header; main task is edited in the grid (for list view under collapsible header). */
  embedBelowListHeader,
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
  embedBelowListHeader?: boolean;
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
  const intPct = interruptRollupPercent(a.interrupts);
  const intDoneCount = a.interrupts.filter((i) => i.status === "completed").length;
  const blockOptions: { id: string; kind: "main" | "chunk"; label: string }[] = [
    { id: a.id, kind: "main", label: `Main: ${a.title || "(untitled)"}` },
    ...a.chunks.map((c) => ({ id: c.id, kind: "chunk" as const, label: `Chunk: ${c.title || "…"}` })),
  ];

  const shellClass = embedBelowListHeader
    ? `${compact ? "p-4" : "p-5"}`
    : `rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-sm ${compact ? "p-4" : "p-6"}`;

  return (
    <div className={shellClass}>
      {!embedBelowListHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <span className="text-xs font-medium text-sky-300/90">{roleLabel(a.role_id)}</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-zinc-500 w-24 shrink-0">Main task</span>
              <input
                value={a.title}
                onChange={(e) => patchAssignment(a.id, { title: e.target.value })}
                placeholder="What you’re shipping this week…"
                className="flex-1 min-w-[200px] rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeAssignment(a.id)}
            className="p-2 rounded-xl text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            title="Remove assignment"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className={`grid gap-3 mb-4 ${embedBelowListHeader ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <div className={embedBelowListHeader ? "sm:col-span-2" : ""}>
          <label className="text-xs font-medium text-zinc-500">
            {embedBelowListHeader ? "Main task" : "Due date"}
          </label>
          {embedBelowListHeader ? (
            <input
              value={a.title}
              onChange={(e) => patchAssignment(a.id, { title: e.target.value })}
              placeholder="What you’re shipping this week…"
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
          ) : (
            <input
              type="date"
              value={a.due_date}
              onChange={(e) => patchAssignment(a.id, { due_date: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
          )}
        </div>
        {embedBelowListHeader ? (
          <>
            <div>
              <label className="text-xs font-medium text-zinc-500">Due date</label>
              <input
                type="date"
                value={a.due_date}
                onChange={(e) => patchAssignment(a.id, { due_date: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500">Progress from steps</label>
              <div className="mt-2">
                <ProgressBar pct={pct} />
                <p className="text-xs text-zinc-500 mt-1">
                  {pct}% — {a.chunks.filter((c) => c.status === "completed").length}/{a.chunks.length || 0} chunks done
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-zinc-500">Progress from steps</label>
              <div className="mt-2">
                <ProgressBar pct={pct} />
                <p className="text-xs text-zinc-500 mt-1">{pct}% — {a.chunks.filter((c) => c.status === "completed").length}/{a.chunks.length || 0} chunks done</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mb-5">
        <label className="text-xs font-medium text-zinc-500">Brief from manager</label>
        <textarea
          value={a.description}
          onChange={(e) => patchAssignment(a.id, { description: e.target.value })}
          rows={compact ? 2 : 3}
          placeholder="Context, links, expectations…"
          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky-500/25"
        />
      </div>

      <div className="mb-5">
        <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
          <AtSign className="w-3.5 h-3.5 opacity-70" />
          Mentions &amp; labels
        </label>
        <p className="text-[12px] text-zinc-500 mt-1 mb-2">
          Tag <span className="text-zinc-300">who assigned or cares</span> — not yourself. Quick picks below; or type{" "}
          <span className="text-zinc-300">@name</span> / <span className="text-zinc-300">#ticket</span>.
        </p>
        <TagField tags={a.tags || []} onChange={(tags) => patchAssignment(a.id, { tags })} />
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-zinc-300">Steps (chunks)</h3>
          <button
            type="button"
            onClick={() => addChunk(a.id)}
            className="flex items-center gap-1 text-sm font-medium text-sky-400 hover:text-sky-300"
          >
            <Plus className="w-4 h-4" />
            Add step
          </button>
        </div>
        {a.chunks.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">Split the work into phases (design, build, review…).</p>
        ) : (
          <ul className="space-y-2">
            {a.chunks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
                <input
                  value={c.title}
                  onChange={(e) => updateChunk(a.id, c.id, { title: e.target.value })}
                  placeholder="Step name"
                  className="flex-1 min-w-[140px] rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-orange-300/70" />
            Extra work &amp; blockers
          </h3>
          <button
            type="button"
            onClick={() => addInterrupt(a.id)}
            className="flex items-center gap-1 text-sm font-medium text-orange-300/90 hover:text-orange-200"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        </div>
        {a.interrupts.length > 0 && (
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Extra work progress</span>
              <span>
                {intPct}% · {intDoneCount}/{a.interrupts.length} done
              </span>
            </div>
            <ProgressBar pct={intPct} variant="orange" />
          </div>
        )}
        {a.interrupts.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">Urgent asks, bugs, or interrupts — say what they blocked.</p>
        ) : (
          <ul className="space-y-3">
            {a.interrupts.map((it) => (
              <li key={it.id} className="rounded-xl border border-white/[0.07] bg-orange-950/[0.12] p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={it.title}
                    onChange={(e) => updateInterrupt(a.id, it.id, { title: e.target.value })}
                    placeholder="What came up?"
                    className="flex-1 min-w-[160px] rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <ChunkStatusSelect
                    value={it.status}
                    onChange={(v) => updateInterrupt(a.id, it.id, { status: v })}
                    accent="orange"
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
                  <InterruptBlocksSelect
                    blockOptions={blockOptions}
                    targetKind={it.blocks_target_kind}
                    targetId={it.blocks_target_id}
                    onChange={(kind, id) => {
                      updateInterrupt(a.id, it.id, {
                        blocks_target_kind: kind,
                        blocks_target_id: id,
                      });
                    }}
                  />
                </div>
                <textarea
                  value={it.note}
                  onChange={(e) => updateInterrupt(a.id, it.id, { note: e.target.value })}
                  placeholder="Note: e.g. spent 4h here today; main chunk slipped…"
                  rows={2}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <div className="pt-1">
                  <label className="text-xs font-medium text-zinc-500">Mentions for this item</label>
                  <div className="mt-1">
                    <TagField
                      tags={it.tags || []}
                      onChange={(tags) => updateInterrupt(a.id, it.id, { tags })}
                      placeholder="@who asked · #ticket — Enter"
                    />
                  </div>
                </div>
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
  const [listExpanded, setListExpanded] = useState<Record<string, boolean>>({});
  const listIsOpen = (id: string) => listExpanded[id] !== false;
  const toggleListCard = (id: string) => {
    setListExpanded((p) => {
      const open = p[id] !== false;
      return { ...p, [id]: !open };
    });
  };

  const missingRoles = WORKBOARD_ROLES.filter((r) => !weekAssignments.some((a) => a.role_id === r.id));

  return (
    <div className="space-y-4">
      {weekAssignments.map((a) => {
        const open = listIsOpen(a.id);
        const pct = rollupPercent(a.chunks);
        const listIntPct = interruptRollupPercent(a.interrupts);
        const listIntDone = a.interrupts.filter((i) => i.status === "completed").length;
        return (
          <div
            key={a.id}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-sm overflow-hidden"
          >
            <div className="flex items-stretch gap-0">
              <button
                type="button"
                onClick={() => toggleListCard(a.id)}
                className="flex flex-1 items-start gap-3 p-4 text-left hover:bg-white/[0.04] transition-colors min-w-0"
              >
                {open ? (
                  <ChevronDown className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-sky-300/90">{roleLabel(a.role_id)}</div>
                  <div className="text-[15px] font-medium text-white mt-1 break-words">
                    {a.title || "Untitled main task"}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-zinc-500">
                    <span>Due {a.due_date}</span>
                    <span>
                      {pct}% · {a.chunks.filter((c) => c.status === "completed").length}/{a.chunks.length || 0} steps
                    </span>
                    {a.interrupts.length > 0 && <span className="text-orange-300/80">{a.interrupts.length} extra</span>}
                  </div>
                  <div className="mt-2 max-w-md space-y-1.5">
                    <ProgressBar pct={pct} />
                    {a.interrupts.length > 0 && (
                      <>
                        <ProgressBar pct={listIntPct} variant="orange" />
                        <p className="text-[10px] text-zinc-600">
                          Extra work {listIntPct}% · {listIntDone}/{a.interrupts.length} done
                        </p>
                      </>
                    )}
                  </div>
                  {!open && <TagChipsRow tags={allAssignmentTags(a)} />}
                  {!open && <BlockingLines a={a} />}
                </div>
              </button>
              <div className="flex items-start p-3 shrink-0">
                <button
                  type="button"
                  onClick={() => removeAssignment(a.id)}
                  className="p-2 rounded-xl text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Remove assignment"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {open && (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 bg-black/20">
                <AssignmentEditor
                  a={a}
                  embedBelowListHeader
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

      {missingRoles.length > 0 && (
        <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-5">
          <p className="text-sm text-zinc-500 mb-3">Add a card for someone’s role this week:</p>
          <div className="flex flex-wrap gap-2">
            {missingRoles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addAssignment(r.id)}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.08] text-zinc-200 hover:bg-sky-600 hover:text-white border border-white/[0.08] transition-colors"
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
              className="rounded-2xl border-2 border-dashed border-white/[0.12] bg-white/[0.02] p-6 text-left hover:border-sky-500/40 hover:bg-white/[0.04] transition-colors min-h-[160px] flex flex-col justify-center"
            >
              <span className="text-sm font-medium text-zinc-300">{r.label}</span>
              <span className="text-xs text-zinc-500 mt-2">Add this week’s focus</span>
            </button>
          );
        }
        const pct = rollupPercent(a.chunks);
        const intPct = interruptRollupPercent(a.interrupts);
        const intDoneCount = a.interrupts.filter((i) => i.status === "completed").length;
        const open = expandId === a.id;
        const doneChunks = a.chunks.filter((c) => c.status === "completed").length;
        return (
          <div
            key={a.id}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-sm overflow-hidden flex flex-col"
          >
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-sky-300/90">{roleShort(r.id)}</span>
                <span className="text-[11px] text-zinc-500">{a.due_date}</span>
              </div>
              <p className="text-[11px] font-medium text-zinc-500 mb-1">Assigned</p>
              <h2 className="text-sm font-medium text-white line-clamp-3 min-h-[2.75rem] leading-snug">
                {a.title || "Untitled main task"}
              </h2>
              <div className="mt-3">
                <p className="text-[11px] font-medium text-zinc-500 mb-1">Progress</p>
                <ProgressBar pct={pct} />
                <p className="text-[11px] text-zinc-500 mt-1">
                  {pct}% · {doneChunks}/{a.chunks.length || 0} chunks done
                  {a.interrupts.length > 0 ? ` · ${a.interrupts.length} interrupts` : ""}
                </p>
                {a.interrupts.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-orange-300/80 mb-1">Extra work progress</p>
                    <ProgressBar pct={intPct} variant="orange" />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {intPct}% · {intDoneCount}/{a.interrupts.length} cleared
                    </p>
                  </div>
                )}
              </div>

              {allAssignmentTags(a).length > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-2">
                  <p className="text-[11px] font-medium text-zinc-500 mb-1 flex items-center gap-1">
                    <AtSign className="w-3 h-3 opacity-70" />
                    Mentions
                  </p>
                  <TagChipsRow tags={allAssignmentTags(a)} max={8} />
                </div>
              )}

              {a.chunks.length > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-2">
                  <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Steps</p>
                  <ul className="space-y-1 max-h-[88px] overflow-y-auto pr-0.5">
                    {a.chunks.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start justify-between gap-2 text-[11px] text-zinc-300 leading-tight"
                      >
                        <span className="truncate min-w-0">{c.title || "Untitled chunk"}</span>
                        <span className="shrink-0 text-zinc-500 text-[10px]">{CHUNK_STATUS_LABEL[c.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 border-t border-white/[0.06] pt-2">
                <p className="text-[11px] font-medium text-orange-300/90 mb-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Blocking
                </p>
                {a.interrupts.some((it) => it.blocks_target_id && it.blocks_target_kind) ? (
                  <div className="max-h-[72px] overflow-y-auto">
                    <BlockingLines a={a} />
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-600">Nothing linked yet — add interrupts and what they block.</p>
                )}
              </div>

              {a.interrupts.length > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-2 flex-1 min-h-0">
                  <p className="text-[11px] font-medium text-orange-300/90 mb-1.5">Extra work</p>
                  <ul className="space-y-2 max-h-[96px] overflow-y-auto">
                    {a.interrupts.map((it) => (
                      <li key={it.id} className="text-[11px] text-zinc-400 leading-snug">
                        <div className="flex gap-1.5">
                          <span className="text-amber-500/60 shrink-0">+</span>
                          <span className="line-clamp-2 min-w-0">{it.title || "Untitled"}</span>
                        </div>
                        {(it.tags || []).length > 0 && (
                          <div className="mt-1 ml-4">
                            <TagChipsRow tags={it.tags} max={4} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="border-t border-white/[0.06] p-2 flex gap-2 bg-black/15">
              <button
                type="button"
                onClick={() => setExpandId(open ? null : a.id)}
                className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/[0.08] text-zinc-100 hover:bg-white/[0.12] transition-colors"
              >
                {open ? "Collapse" : "Expand"}
              </button>
              <button
                type="button"
                onClick={() => removeAssignment(a.id)}
                className="px-3 py-2 text-xs rounded-xl text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 mx-auto" />
              </button>
            </div>
            {open && (
              <div className="border-t border-white/[0.06] p-4 bg-black/25 max-h-[70vh] overflow-y-auto">
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
