import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useInView } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkboardMentionCandidates, getWorkboardWeek, getTickets, patchTicket, saveWorkboardWeek } from "@/services/api";
import type { Ticket } from "@/services/api";
import { toast } from "sonner";
import {
  WORKBOARD_ROLES,
  CHUNK_STATUS_LABEL,
  type WorkboardRoleId,
  type MainAssignment,
  type WorkboardChunk,
  type WorkboardInterrupt,
  type WorkboardPrimaryTask,
  type ChunkStatus,
  getMondayISO,
  addDaysISO,
  fmtWeekRange,
  rollupPercent,
  assignmentRollupPercent,
  flattenAssignmentChunks,
  primaryTaskAllStepsDone,
  newId,
  normalizeAssignments,
  mentionFromName,
  workboardMentionSubtitle,
} from "@/lib/workboardTypes";
import { mapChunkStatusToTicket, mergeAssignedTicketsIntoInterrupts } from "@/lib/ticketWorkboardSync";
import type { WorkboardMentionPerson } from "@/services/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Plus, Trash2, Link2, AtSign, User, UserCircle2, GripVertical, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "fsboard-weekly-workboard-v1";

const MY_WORKBOARD_ROLE_STORAGE = "fsboard-workboard-my-role-v1";

/** One-time (and re-openable) picker labels — map to workboard `role_id` columns. */
const WORKBOARD_SELF_PICK: { id: WorkboardRoleId; label: string }[] = [
  { id: "ai_dev", label: "AI Developer" },
  { id: "graphic_designer", label: "Graphic Designer" },
  { id: "video_editor", label: "TCO / Video Editor" },
  { id: "content_creator", label: "TCO Content Writer / Creator" },
  { id: "ops_manager", label: "Ops Manager" },
  { id: "boss_man", label: "Manager / Boss Man" },
];

function normalizeWorkboardEmail(email: string) {
  return email.trim().toLowerCase();
}

function myWorkboardRoleKey(email: string) {
  return `${MY_WORKBOARD_ROLE_STORAGE}:${normalizeWorkboardEmail(email)}`;
}

type PersistedWorkboardV1 = {
  version: 1;
  assignments: MainAssignment[];
  self_role?: { email: string; role_id: WorkboardRoleId };
};

function readPersistedWorkboardBlob(): PersistedWorkboardV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.version === 1 && Array.isArray(p.assignments)) {
      return p as PersistedWorkboardV1;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Read from dedicated key, then from embedded `self_role` in the workboard JSON (same bucket as assignments). */
function readMyWorkboardRoleFromSources(email: string | undefined): WorkboardRoleId | null {
  if (!email || typeof window === "undefined") return null;
  const e = normalizeWorkboardEmail(email);
  try {
    const direct = localStorage.getItem(myWorkboardRoleKey(e));
    if (direct && WORKBOARD_ROLES.some((r) => r.id === direct)) {
      return direct as WorkboardRoleId;
    }
  } catch {
    /* ignore */
  }
  try {
    const blob = readPersistedWorkboardBlob();
    const sr = blob?.self_role;
    if (sr && normalizeWorkboardEmail(sr.email) === e && WORKBOARD_ROLES.some((r) => r.id === sr.role_id)) {
      return sr.role_id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeMyWorkboardRolePersistent(email: string, id: WorkboardRoleId, currentAssignments: MainAssignment[]) {
  if (typeof window === "undefined") return;
  const e = normalizeWorkboardEmail(email);
  try {
    localStorage.setItem(myWorkboardRoleKey(e), id);
    const next: PersistedWorkboardV1 = {
      version: 1,
      assignments: normalizeAssignments(currentAssignments),
      self_role: { email: e, role_id: id },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Greeting-pill glass (App top bar): minimal tint, heavy blur — not gray slabs */
const BENTO_SURFACE =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.55),0_0_100px_-40px_rgba(124,58,237,0.18)]";

function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, {
    once: true,
    amount: 0.12,
    margin: "0px 0px -12% 0px",
  });
  return (
    <motion.div
      ref={ref}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{
        duration: 0.55,
        delay: inView ? delay : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function useAutoGrowTextArea(maxHeightPx: number = 320) {
  return useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    // Reset then grow to fit content
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${next}px`;
  }, [maxHeightPx]);
}

const GLASS_INPUT =
  "border border-white/10 bg-white/[0.03] backdrop-blur-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/35 focus:border-violet-500/25";

const GLASS_TEXTAREA =
  "border border-white/10 bg-white/[0.03] backdrop-blur-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/35 focus:border-violet-500/25 leading-relaxed overflow-y-auto";

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
  try {
    const existing = readPersistedWorkboardBlob();
    const self_role = existing?.self_role;
    const payload: PersistedWorkboardV1 = { version: 1, assignments, ...(self_role ? { self_role } : {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function roleLabel(id: WorkboardRoleId) {
  return WORKBOARD_ROLES.find((r) => r.id === id)?.label ?? id;
}

function roleShort(id: WorkboardRoleId) {
  return WORKBOARD_ROLES.find((r) => r.id === id)?.short ?? id;
}

const STATUS_OPTIONS: ChunkStatus[] = ["not_started", "in_progress", "completed"];

function findChunkInAssignment(a: MainAssignment, chunkId: string): WorkboardChunk | undefined {
  for (const pt of a.primary_tasks) {
    const c = pt.chunks.find((x) => x.id === chunkId);
    if (c) return c;
  }
  return undefined;
}

/** Human label for what an interrupt is blocking (main vs chunk title). */
function blockTargetLabel(a: MainAssignment, kind: "main" | "chunk" | null, targetId: string | null): string {
  if (!kind || !targetId) return "";
  if (kind === "main") {
    const pt = a.primary_tasks.find((p) => p.id === targetId);
    return `main: ${pt?.title || "(untitled)"}`;
  }
  const ch = findChunkInAssignment(a, targetId);
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
  a.primary_tasks.forEach((pt) =>
    pt.chunks.forEach((c) => (c.tags || []).forEach((t) => t && set.add(t))),
  );
  a.interrupts.forEach((i) => (i.tags || []).forEach((t) => t && set.add(t)));
  return [...set];
}

/** List card title line + a single due line (range when multiple). */
function listCardMainSummary(a: MainAssignment): { headline: string; dueLine: string } {
  const pts = a.primary_tasks;
  if (pts.length === 0) return { headline: "Add a main task", dueLine: "" };
  if (pts.length === 1) {
    return {
      headline: pts[0].title || "Untitled main task",
      dueLine: `Due ${fmtDateDMY(pts[0].due_date)}`,
    };
  }
  const firstTwo = pts
    .map((p) => p.title || "Untitled")
    .slice(0, 2)
    .join(" · ");
  const more = pts.length > 2 ? ` +${pts.length - 2} more` : "";
  const dates = [...pts].map((p) => p.due_date).sort();
  const dueLine =
    dates[0] === dates[dates.length - 1]
      ? `Due ${fmtDateDMY(dates[0])}`
      : `Due ${fmtDateDMY(dates[0])} – ${fmtDateDMY(dates[dates.length - 1])}`;
  return { headline: firstTwo + more, dueLine };
}

function TagField({
  tags,
  onChange,
  placeholder,
  compact,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Tighter layout for step rows */
  compact?: boolean;
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
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const person = isPersonMentionTag(t);
            return (
              <span
                key={t}
                className={`inline-flex items-center gap-0.5 pl-2.5 pr-1 py-0.5 rounded-full max-w-full border ${compact ? "text-[11px]" : "text-[12px]"
                  } ${person
                    ? "bg-violet-500/15 text-violet-100 border-violet-400/30"
                    : "bg-white/[0.06] text-zinc-200 border-white/10"
                  }`}
              >
                {person ? <AtSign className="w-3 h-3 shrink-0 opacity-70" /> : null}
                <span className="truncate max-w-[200px]" title={t}>
                  {person ? t.slice(1) : t}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  className={`shrink-0 px-1 rounded-full text-sm leading-none opacity-60 hover:opacity-100 ${person ? "hover:bg-violet-500/25" : "hover:bg-white/10"
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
          className={cn("w-full rounded-xl", GLASS_INPUT, compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5 text-sm")}
          role="combobox"
          aria-expanded={Boolean(mentionMenu)}
          aria-controls={mentionMenu ? `${mentionListId}-listbox` : undefined}
          aria-autocomplete="list"
        />
        {mentionMenu ? (
          <ul
            id={`${mentionListId}-listbox`}
            role="listbox"
            className="absolute z-[200] left-0 right-0 bottom-full mb-1.5 max-h-[min(320px,50vh)] overflow-y-auto rounded-xl border border-zinc-700/90 bg-zinc-950/95 py-1.5 shadow-[0_-24px_60px_rgba(0,0,0,0.85),0_0_48px_-12px_rgba(109,40,217,0.2)] backdrop-blur-xl backdrop-saturate-150 [isolation:isolate]"
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
                      className={`mx-1 flex w-[calc(100%-0.5rem)] items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${idx === mentionHighlight
                          ? "bg-violet-500/30 text-white"
                          : "text-zinc-100 hover:bg-white/10"
                        }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickMention(person);
                      }}
                      onMouseEnter={() => setMentionHighlight(idx)}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-300/80">
                        <User className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium leading-tight">{person.display}</span>
                        {sub ? (
                          <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-400">{sub}</span>
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
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] max-w-[170px] truncate border ${person
                ? "bg-violet-500/12 text-violet-100/95 border-violet-400/25"
                : "bg-white/[0.06] text-zinc-300 border-white/10"
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
          <DragScrollText text={line} className="text-orange-200/85" />
        </li>
      ))}
    </ul>
  );
}

function DragScrollText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);

  return (
    <div
      ref={ref}
      className={cn("min-w-0 flex-1 overflow-x-auto whitespace-nowrap select-none cursor-grab", className)}
      title={text}
      style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" as any }}
      onMouseDown={(e) => {
        if (!ref.current) return;
        dragging.current = true;
        startX.current = e.clientX;
        startScrollLeft.current = ref.current.scrollLeft;
        ref.current.style.cursor = "grabbing";
      }}
      onMouseMove={(e) => {
        if (!dragging.current || !ref.current) return;
        const dx = e.clientX - startX.current;
        ref.current.scrollLeft = startScrollLeft.current - dx;
      }}
      onMouseUp={() => {
        dragging.current = false;
        if (ref.current) ref.current.style.cursor = "grab";
      }}
      onMouseLeave={() => {
        dragging.current = false;
        if (ref.current) ref.current.style.cursor = "grab";
      }}
    >
      {text}
    </div>
  );
}

export default function WeeklyWorkboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => getMondayISO());
  const [view, setView] = useState<"list" | "gallery">("list");
  // Default to week view so cards don't look "empty" when nothing is due today.
  const [dateFilter, setDateFilter] = useState<"week" | "today">("week");
  const [roleFilter, setRoleFilter] = useState<WorkboardRoleId | "all">("all");
  const [assignments, setAssignments] = useState<MainAssignment[]>([]);
  const lastSaveOkAtRef = useRef<number | null>(null);
  const [myWorkboardRole, setMyWorkboardRole] = useState<WorkboardRoleId | null>(null);
  const [myRoleDialogOpen, setMyRoleDialogOpen] = useState(false);
  const [myRoleDialogForced, setMyRoleDialogForced] = useState(false);
  const hydratedWeekStartRef = useRef<string | null>(null);

  const workboardQ = useQuery({
    queryKey: ["weekly-workboard", weekStart],
    queryFn: () => getWorkboardWeek(weekStart),
    staleTime: 10_000,
  });

  /** Same list as the Tickets page — all tickets sync to AI Developer extra work (no assignee filter). */
  const { data: allTickets = [] } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => getTickets(),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const mergeByRole = useCallback((baseRows: MainAssignment[], incoming: MainAssignment[]) => {
    const m = new Map<string, MainAssignment>();
    baseRows.forEach((a) => m.set(a.role_id, a));
    incoming.forEach((a) => m.set(a.role_id, a));
    return normalizeAssignments(Array.from(m.values()) as any);
  }, []);

  const saveMut = useMutation({
    mutationFn: async (rows: MainAssignment[]) => {
      // Merge with latest server state so one person's save doesn't wipe others.
      let serverRows: MainAssignment[] = [];
      try {
        const cur = await getWorkboardWeek(weekStart);
        const raw = Array.isArray(cur.assignments) ? cur.assignments : [];
        serverRows = normalizeAssignments(raw as any);
      } catch {
        serverRows = [];
      }
      const merged = mergeByRole(serverRows, rows);
      return saveWorkboardWeek(weekStart, merged);
    },
    onSuccess: () => {
      lastSaveOkAtRef.current = Date.now();
    },
    onError: () => {
      toast.error("Could not save workboard (shared).");
    },
  });

  useEffect(() => {
    if (!user?.email) return;
    const saved = readMyWorkboardRoleFromSources(user.email);
    if (saved) {
      setMyWorkboardRole(saved);
      setMyRoleDialogOpen(false);
      setMyRoleDialogForced(false);
    } else {
      setMyWorkboardRole(null);
      setMyRoleDialogForced(true);
      setMyRoleDialogOpen(true);
    }
  }, [user?.email]);

  const applyMyWorkboardRole = (id: WorkboardRoleId) => {
    if (!user?.email) return;
    writeMyWorkboardRolePersistent(user.email, id, assignments);
    setMyWorkboardRole(id);
    setMyRoleDialogForced(false);
    setMyRoleDialogOpen(false);
  };

  useEffect(() => {
    // Hydrate from server; fall back to local if server not ready.
    if (workboardQ.data?.week_start === weekStart) {
      const rows = Array.isArray(workboardQ.data.assignments) ? workboardQ.data.assignments : [];
      const serverRows = normalizeAssignments(rows as any);
      const localWeek = loadStore().filter((a) => a.week_start === weekStart);

      // If the server has no data yet but this device has local tasks for the week,
      // publish the local version so the team can see it.
      if (serverRows.length === 0 && localWeek.length > 0) {
        const localNormalized = normalizeAssignments(localWeek as any);
        setAssignments(localNormalized);
        hydratedWeekStartRef.current = weekStart;
        // Fire-and-forget publish (the debounced save also covers it, but this is immediate)
        saveMut.mutate(localNormalized);
        return;
      }

      setAssignments(serverRows);
      hydratedWeekStartRef.current = weekStart;
      return;
    }
    if (workboardQ.isError) {
      setAssignments(loadStore().filter((a) => a.week_start === weekStart));
      hydratedWeekStartRef.current = weekStart;
    }
  }, [workboardQ.data?.week_start, workboardQ.data?.assignments, workboardQ.isError, weekStart]);

  /** Mirror all Tickets into AI Developer → Extra work & blockers (bidirectional via updateInterrupt). */
  useEffect(() => {
    if (hydratedWeekStartRef.current !== weekStart) return;
    if (workboardQ.isLoading) return;

    setAssignments((prev) => {
      const aiIdx = prev.findIndex((a) => a.week_start === weekStart && a.role_id === "ai_dev");
      if (aiIdx < 0) {
        if (!allTickets.length) return prev;
        const interrupts = mergeAssignedTicketsIntoInterrupts([], allTickets as Ticket[]);
        return [
          ...prev,
          {
            id: newId(),
            role_id: "ai_dev",
            week_start: weekStart,
            description: "",
            primary_tasks: [],
            interrupts,
            tags: [],
          },
        ];
      }
      const ai = prev[aiIdx];
      const nextInts = mergeAssignedTicketsIntoInterrupts(ai.interrupts, allTickets as Ticket[]);
      if (JSON.stringify(nextInts) === JSON.stringify(ai.interrupts)) return prev;
      const copy = [...prev];
      copy[aiIdx] = { ...ai, interrupts: nextInts };
      return copy;
    });
  }, [weekStart, allTickets, workboardQ.isLoading]);

  // Persist locally (offline fallback) and to server (shared).
  useEffect(() => {
    if (!weekStart) return;
    // Critical: avoid saving previous week data into the next week while the
    // new week is still hydrating (this is what made data "disappear" on week switch).
    if (hydratedWeekStartRef.current !== weekStart) return;

    // Extra guard: only persist if this assignment list belongs to the active week.
    if (assignments.some((a) => a.week_start !== weekStart)) return;

    // Merge into local store blob (keeps other weeks)
    const existing = loadStore().filter((a) => a.week_start !== weekStart);
    saveStore([...existing, ...assignments]);

    // Debounced save to server
    const t = setTimeout(() => {
      // Avoid pushing empty initial state while query is still loading
      if (workboardQ.isLoading) return;
      // If we haven't loaded the server data yet, don't overwrite it with empty.
      const serverLen = Array.isArray(workboardQ.data?.assignments) ? workboardQ.data!.assignments.length : 0;
      if (assignments.length === 0 && serverLen > 0) return;
      saveMut.mutate(assignments);
    }, 600);
    return () => clearTimeout(t);
  }, [assignments, weekStart]);

  const weekAssignments = useMemo(() => {
    const today = todayISO();
    return assignments
      .filter((a) => (roleFilter === "all" ? true : a.role_id === roleFilter))
      .map((a) => {
        if (dateFilter !== "today") return a;
        const keep = a.primary_tasks.filter((pt) => {
          const dueToday = String(pt.due_date || "").slice(0, 10) === today;
          const completedSomethingToday = (pt.chunks || []).some((c) => c.completed_at === today);
          return dueToday || completedSomethingToday;
        });
        return {
          ...a,
          primary_tasks: keep,
        };
      })
      .filter((a) => dateFilter !== "today" || a.primary_tasks.length > 0 || a.interrupts.length > 0);
  }, [assignments, dateFilter, roleFilter]);

  /** Week list columns need full `primary_tasks` for each day; `weekAssignments` may slice by “today” and breaks patches. */
  const weekGridAssignments = useMemo(() => {
    return assignments
      .filter((a) => a.week_start === weekStart)
      .filter((a) => roleFilter === "all" || a.role_id === roleFilter);
  }, [assignments, weekStart, roleFilter]);

  /** Week grid: all departments for this week (ignore role toolbar) — ticket-by-day + editors must still see AI Dev. */
  const weekGridAssignmentsAllRoles = useMemo(
    () => assignments.filter((a) => a.week_start === weekStart),
    [assignments, weekStart],
  );

  const byRole = useMemo(() => {
    const m = new Map<WorkboardRoleId, MainAssignment>();
    weekAssignments.forEach((a) => m.set(a.role_id, a));
    return m;
  }, [weekAssignments]);

  const removeAssignment = useCallback((id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAssignment = useCallback(
    (role_id: WorkboardRoleId) => {
      setAssignments((prev) => {
        if (prev.some((a) => a.week_start === weekStart && a.role_id === role_id)) {
          return prev;
        }
        const id = newId();
        return [
          ...prev,
          {
            id,
            role_id,
            week_start: weekStart,
            description: "",
            primary_tasks: [],
            interrupts: [],
            tags: [],
          },
        ];
      });
    },
    [weekStart],
  );

  const patchPrimaryTask = useCallback((assignmentId: string, taskId: string, patch: Partial<WorkboardPrimaryTask>) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return {
          ...a,
          primary_tasks: a.primary_tasks.map((p) => (p.id === taskId ? { ...p, ...patch } : p)),
        };
      })
    );
  }, []);

  const addPrimaryTask = useCallback((assignmentId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        const n = a.primary_tasks.length;
        return {
          ...a,
          primary_tasks: [
            ...a.primary_tasks,
            {
              id: newId(),
              title: "",
              due_date: a.week_start,
              completed: false,
              sort_order: n,
              chunks: [],
            },
          ],
        };
      })
    );
  }, []);

  const removePrimaryTask = useCallback((assignmentId: string, taskId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return { ...a, primary_tasks: a.primary_tasks.filter((p) => p.id !== taskId) };
      })
    );
  }, []);

  const updateChunk = useCallback(
    (assignmentId: string, primaryTaskId: string, chunkId: string, patch: Partial<WorkboardChunk>) => {
      const enriched: Partial<WorkboardChunk> = { ...patch };
      if ("status" in patch) {
        if (patch.status === "completed") {
          const d = new Date();
          enriched.completed_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        } else {
          enriched.completed_at = undefined;
        }
      }
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          return {
            ...a,
            primary_tasks: a.primary_tasks.map((pt) => {
              if (pt.id !== primaryTaskId) return pt;
              const nextChunks = pt.chunks.map((c) => (c.id === chunkId ? { ...c, ...enriched } : c));
              const allDone = nextChunks.length > 0 && nextChunks.every((c) => c.status === "completed");
              return { ...pt, chunks: nextChunks, completed: allDone };
            }),
          };
        })
      );
    },
    []
  );

  const addChunk = useCallback((assignmentId: string, primaryTaskId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return {
          ...a,
          primary_tasks: a.primary_tasks.map((pt) => {
            if (pt.id !== primaryTaskId) return pt;
            const n = pt.chunks.length;
            return {
              ...pt,
              completed: false,
              chunks: [
                ...pt.chunks,
                { id: newId(), title: "", status: "not_started", sort_order: n, tags: [] },
              ],
            };
          }),
        };
      })
    );
  }, []);

  const removeChunk = useCallback((assignmentId: string, primaryTaskId: string, chunkId: string) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== assignmentId) return a;
        return {
          ...a,
          primary_tasks: a.primary_tasks.map((pt) => {
            if (pt.id !== primaryTaskId) return pt;
            const next = pt.chunks.filter((c) => c.id !== chunkId);
            const allDone = next.length > 0 && next.every((c) => c.status === "completed");
            return { ...pt, chunks: next, completed: allDone };
          }),
        };
      })
    );
  }, []);

  const updateInterrupt = useCallback(
    (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => {
      let ticketId: string | null = null;
      const ticketPatch: Record<string, unknown> = {};
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          return {
            ...a,
            interrupts: a.interrupts.map((x) => {
              if (x.id !== intId) return x;
              const merged = { ...x, ...patch };
              if (merged.source_ticket_id) {
                ticketId = merged.source_ticket_id;
                if ("status" in patch) ticketPatch.status = mapChunkStatusToTicket(merged.status);
                if ("title" in patch) ticketPatch.title = merged.title;
              }
              return merged;
            }),
          };
        })
      );
      if (ticketId && Object.keys(ticketPatch).length > 0) {
        patchTicket(ticketId, ticketPatch as any)
          .then(() => queryClient.invalidateQueries({ queryKey: ["tickets"] }))
          .catch(() => toast.error("Could not sync change to ticket"));
      }
    },
    [queryClient]
  );

  const addInterrupt = useCallback((assignmentId: string) => {
    const created_at = todayISO();
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
              created_at,
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
      className="min-h-screen text-zinc-100 bg-black"
      style={{
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
        backgroundImage:
          "radial-gradient(ellipse 130% 90% at 50% -20%, rgba(109, 40, 217, 0.28), transparent 52%), radial-gradient(ellipse 90% 70% at 100% 0%, rgba(124, 58, 237, 0.12), transparent 42%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(91, 33, 182, 0.1), transparent 45%)",
      }}
    >
      <Dialog
        open={myRoleDialogOpen}
        onOpenChange={(o) => {
          if (o) {
            setMyRoleDialogOpen(true);
            return;
          }
          if (myRoleDialogForced) return;
          setMyRoleDialogOpen(false);
        }}
      >
        <DialogContent
          className={cn(
            "sm:max-w-md border border-white/10 bg-zinc-950/98 text-zinc-100 backdrop-blur-2xl",
            myRoleDialogForced && "[&>button]:hidden",
          )}
          onPointerDownOutside={(e) => {
            if (myRoleDialogForced) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (myRoleDialogForced) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Which workboard card is yours?</DialogTitle>
            <DialogDescription className="text-zinc-400 text-[15px] leading-relaxed">
              We use this to enlarge your role column (like a bento “hero” tile). This is stored for your account on this
              device and we won’t ask again. To change it later, use <span className="text-zinc-300">My card</span> in the
              toolbar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-1">
            {WORKBOARD_SELF_PICK.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => applyMyWorkboardRole(row.id)}
                className={cn(
                  "w-full text-left rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  myWorkboardRole === row.id
                    ? "border-violet-500/60 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-violet-500/35 hover:bg-violet-500/10",
                )}
              >
                {row.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="pl-[70px] pr-6 pt-8 pb-12 max-w-[min(100%,1520px)] mx-auto">
        <ScrollReveal delay={0.05}>
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div
              className={`flex items-center gap-0.5 ${BENTO_SURFACE} p-1`}
            >
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
                className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-violet-500/15 transition-colors"
                aria-label="Previous week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 text-sm font-medium text-white min-w-[200px] text-center tabular-nums">
                {fmtWeekRange(weekStart)}
              </span>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
                className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-violet-500/15 transition-colors"
                aria-label="Next week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(getMondayISO())}
                className="ml-0.5 mr-1 px-3 py-2 text-xs font-semibold rounded-xl border border-violet-500/35 bg-violet-600/25 text-white hover:bg-violet-600/45 transition-colors shadow-[0_0_24px_-6px_rgba(124,58,237,0.5)]"
              >
                This week
              </button>
            </div>

            <div className={`inline-flex ${BENTO_SURFACE} p-1`}>
              <button
                type="button"
                onClick={() => setDateFilter("week")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  dateFilter === "week"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/35"
                    : "text-zinc-400 hover:text-white hover:bg-violet-500/10"
                }`}
              >
                This week
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  dateFilter === "today"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/35"
                    : "text-zinc-400 hover:text-white hover:bg-violet-500/10"
                }`}
              >
                Today
              </button>
            </div>

            <div className={cn(BENTO_SURFACE, "p-1")}>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="h-10 rounded-xl bg-zinc-950 px-3 text-sm text-white outline-none border border-white/10 focus:border-violet-500/40"
                title="Filter by role"
              >
                <option value="all" className="bg-zinc-950 text-white">All roles</option>
                {WORKBOARD_ROLES.map((r) => (
                  <option key={r.id} value={r.id} className="bg-zinc-950 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={`inline-flex ${BENTO_SURFACE} p-1`}>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${view === "list"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/35"
                    : "text-zinc-400 hover:text-white hover:bg-violet-500/10"
                  }`}
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button
                type="button"
                onClick={() => setView("gallery")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${view === "gallery"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/35"
                    : "text-zinc-400 hover:text-white hover:bg-violet-500/10"
                  }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Gallery
              </button>
            </div>
            {user?.email && (
              <div className={`${BENTO_SURFACE} p-1 flex items-center`}>
                <button
                  type="button"
                  onClick={() => {
                    setMyRoleDialogForced(false);
                    setMyRoleDialogOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl text-zinc-300 hover:text-white hover:bg-violet-500/10 transition-colors"
                  title="Change which bento card is yours"
                >
                  <UserCircle2 className="w-4 h-4 text-violet-300/80" />
                  <span className="hidden sm:inline max-w-[200px] truncate">
                    My card:{" "}
                    {myWorkboardRole
                      ? WORKBOARD_SELF_PICK.find((p) => p.id === myWorkboardRole)?.label ||
                      roleLabel(myWorkboardRole)
                      : "Set role"}
                  </span>
                  <span className="sm:hidden">My card</span>
                </button>
              </div>
            )}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          {view === "gallery" ? (
            <GalleryView
              byRole={byRole}
              myWorkboardRole={myWorkboardRole}
              addAssignment={addAssignment}
              removeAssignment={removeAssignment}
              patchAssignment={patchAssignment}
              patchPrimaryTask={patchPrimaryTask}
              addPrimaryTask={addPrimaryTask}
              removePrimaryTask={removePrimaryTask}
              addChunk={addChunk}
              removeChunk={removeChunk}
              updateChunk={updateChunk}
              addInterrupt={addInterrupt}
              removeInterrupt={removeInterrupt}
              updateInterrupt={updateInterrupt}
            />
          ) : (
            <WeekGridListView
              weekStart={weekStart}
              weekAssignments={weekGridAssignments}
              weekAssignmentsAllRoles={weekGridAssignmentsAllRoles}
              myWorkboardRole={myWorkboardRole}
              addAssignment={addAssignment}
              removeAssignment={removeAssignment}
              patchAssignment={patchAssignment}
              patchPrimaryTask={patchPrimaryTask}
              addPrimaryTask={addPrimaryTask}
              removePrimaryTask={removePrimaryTask}
              addChunk={addChunk}
              removeChunk={removeChunk}
              updateChunk={updateChunk}
              addInterrupt={addInterrupt}
              removeInterrupt={removeInterrupt}
              updateInterrupt={updateInterrupt}
            />
          )}
        </ScrollReveal>
      </div>
    </div>
  );
}

function interruptRollupPercent(interrupts: WorkboardInterrupt[]): number {
  if (!interrupts.length) return 0;
  const done = interrupts.filter((i) => i.status === "completed").length;
  return Math.round((done / interrupts.length) * 100);
}

function MiniRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const arc = (pct / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={pct === 100 ? "#a78bfa" : "#8b5cf6"}
            strokeWidth={stroke}
            strokeDasharray={`${arc} ${circ - arc}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white leading-none">{pct}%</span>
      </div>
    </div>
  );
}

function ProgressBar({ pct, variant = "violet" }: { pct: number; variant?: "violet" | "orange" }) {
  return (
    <div className="h-2 rounded-full border border-white/[0.06] bg-white/[0.04] backdrop-blur-sm overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          variant === "orange"
            ? "bg-gradient-to-r from-orange-500 to-amber-400/90"
            : "bg-gradient-to-r from-violet-500 to-violet-400/85",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChunkStatusSelect({
  value,
  onChange,
  accent = "violet",
}: {
  value: ChunkStatus;
  onChange: (v: ChunkStatus) => void;
  /** Ring color when focused (chunks vs interrupts). */
  accent?: "violet" | "orange";
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ChunkStatus)}>
      <SelectTrigger
        className={cn(
          "h-9 w-[min(100%,11rem)] shrink-0 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 shadow-none backdrop-blur-md",
          "focus:ring-2 data-[state=open]:ring-2",
          accent === "orange"
            ? "focus:ring-orange-500/30 data-[state=open]:ring-orange-500/30"
            : "focus:ring-violet-500/30 data-[state=open]:ring-violet-500/30",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="z-[200] border border-white/10 bg-black/55 text-zinc-100 shadow-xl backdrop-blur-2xl"
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
      <SelectTrigger className="h-8 min-w-[160px] max-w-[min(100%,280px)] rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 shadow-none backdrop-blur-md focus:ring-2 focus:ring-orange-500/25 data-[state=open]:ring-2 data-[state=open]:ring-orange-500/25">
        <SelectValue placeholder="Nothing linked" />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="z-[200] max-h-72 border border-white/10 bg-black/55 text-zinc-100 shadow-xl backdrop-blur-2xl"
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
  patchPrimaryTask,
  addPrimaryTask,
  removePrimaryTask,
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
  patchPrimaryTask: (assignmentId: string, taskId: string, patch: Partial<WorkboardPrimaryTask>) => void;
  addPrimaryTask: (assignmentId: string) => void;
  removePrimaryTask: (assignmentId: string, taskId: string) => void;
  addChunk: (assignmentId: string, primaryTaskId: string) => void;
  removeChunk: (assignmentId: string, primaryTaskId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, primaryTaskId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const autoGrow220 = useAutoGrowTextArea(220);
  const intPct = interruptRollupPercent(a.interrupts);
  const intDoneCount = a.interrupts.filter((i) => i.status === "completed").length;
  const intTotal = a.interrupts.length;
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [openExtras, setOpenExtras] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenExtras((prev) => {
      const next = { ...prev };
      const isFirstHydrate = Object.keys(prev).length === 0;
      const newlyAdded = a.interrupts.filter((it) => next[it.id] === undefined);
      let changed = false;

      for (const it of a.interrupts) {
        if (next[it.id] === undefined) {
          // Default: collapsed on load. If user just added an item in-session, auto-open it.
          next[it.id] = isFirstHydrate ? false : newlyAdded.some((x) => x.id === it.id);
          changed = true;
        }
      }

      // Drop removed ids
      for (const id of Object.keys(next)) {
        if (!a.interrupts.some((it) => it.id === id)) {
          delete next[id];
          changed = true;
        }
      }

      if (!isFirstHydrate && newlyAdded.length > 0) {
        setExtrasOpen(true);
      }
      return changed ? next : prev;
    });
  }, [a.interrupts]);
  const blockOptions: { id: string; kind: "main" | "chunk"; label: string }[] = [
    ...a.primary_tasks.map((pt) => ({
      id: pt.id,
      kind: "main" as const,
      label: `Main: ${pt.title || "(untitled)"}`,
    })),
    ...a.primary_tasks.flatMap((pt) =>
      pt.chunks.map((c) => ({ id: c.id, kind: "chunk" as const, label: `Chunk: ${c.title || "…"}` })),
    ),
  ];

  const shellClass = embedBelowListHeader
    ? `${compact ? "p-4" : "p-5"}`
    : `${BENTO_SURFACE} ${compact ? "p-4" : "p-6"}`;

  const primarySorted = useMemo(
    () => [...a.primary_tasks].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)),
    [a.primary_tasks],
  );

  const [openMainTasks, setOpenMainTasks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenMainTasks((prev) => {
      const next: Record<string, boolean> = { ...prev };
      const isFirstHydrate = Object.keys(prev).length === 0;
      const newlyAdded = primarySorted.filter((pt) => next[pt.id] === undefined);
      primarySorted.forEach((pt) => {
        if (next[pt.id] === undefined) {
          // Default: collapsed on load. If user just added a task in-session, auto-open it.
          next[pt.id] = isFirstHydrate ? false : newlyAdded.some((x) => x.id === pt.id);
        }
      });
      // Drop removed ids
      Object.keys(next).forEach((id) => {
        if (!primarySorted.some((pt) => pt.id === id)) delete next[id];
      });
      return next;
    });
  }, [primarySorted]);

  return (
    <div className={shellClass}>
      {!embedBelowListHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <span className="text-xs font-medium text-violet-300/90">{roleLabel(a.role_id)}</span>
            <p className="text-sm text-zinc-400 mt-1">Main tasks — add as many as you need for this week.</p>
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

      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Main tasks</h3>
        <button
          type="button"
          onClick={() => addPrimaryTask(a.id)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-violet-500/30 bg-violet-600/20 text-violet-200 hover:bg-violet-600/40 hover:text-white transition-colors"
          title="Add main task"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5 mb-5">
        {primarySorted.map((pt, idx) => {
          const ptPct = rollupPercent(pt.chunks);
          const lineDone = pt.completed || primaryTaskAllStepsDone(pt);
          const stepsTotal = pt.chunks.length;
          const stepsDone = pt.chunks.filter((c) => c.status === "completed").length;
          const isOpen = openMainTasks[pt.id] === true;
          return (
            <div
              key={pt.id}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4 space-y-3 backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenMainTasks((p) => {
                    const cur = p[pt.id] ?? false;
                    return { ...p, [pt.id]: !cur };
                  })
                }
                className="w-full flex items-start gap-2 text-left"
              >
                <span className="mt-0.5 text-zinc-500 shrink-0">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-zinc-500 shrink-0">Main task {idx + 1}</span>
                    <span className="text-[11px] text-zinc-600">·</span>
                    <span className="text-[11px] text-zinc-400">
                      Steps {stepsDone}/{stepsTotal || 0}
                    </span>
                    {stepsTotal > 0 && (
                      <span className="text-[11px] text-zinc-600">· {ptPct}%</span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                          stepsTotal > 0 && stepsDone === stepsTotal
                            ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
                            : "bg-white/[0.05] text-zinc-300 border-white/10",
                        )}
                      >
                        {stepsTotal > 0 && stepsDone === stepsTotal ? "Done" : "In progress"}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-white/90 line-clamp-2">
                    {pt.title?.trim() ? pt.title.trim() : "Untitled main task"}
                  </div>
                </div>
              </button>

              {isOpen && (
                <>
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      className="mt-2.5 h-4 w-4 rounded border-white/20 bg-zinc-900 text-violet-500 focus:ring-violet-500/40"
                      checked={lineDone}
                      onChange={(e) => {
                        if (e.target.checked) {
                          patchPrimaryTask(a.id, pt.id, { completed: true });
                        } else {
                          patchPrimaryTask(a.id, pt.id, { completed: false });
                          if (primaryTaskAllStepsDone(pt) && pt.chunks.length) {
                            const first = pt.chunks[0];
                            updateChunk(a.id, pt.id, first.id, { status: "in_progress" });
                          }
                        }
                      }}
                      title="Mark this main task done"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500">Title</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePrimaryTask(a.id, pt.id);
                          }}
                          className="p-1 rounded-lg text-zinc-600 hover:text-red-400 ml-auto"
                          title="Remove this main task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={pt.title}
                        onChange={(e) => patchPrimaryTask(a.id, pt.id, { title: e.target.value })}
                        placeholder="What you’re shipping this week…"
                        rows={1}
                        ref={autoGrow220}
                        onInput={(e) => autoGrow220(e.currentTarget)}
                        className={cn(
                          "w-full rounded-xl px-3 py-2.5 text-sm resize-none",
                          GLASS_TEXTAREA,
                          lineDone && "line-through decoration-wavy decoration-zinc-400/80 text-zinc-400",
                        )}
                        style={{ scrollbarGutter: "stable" as any }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 pl-0 sm:pl-7">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Due date</label>
                  <input
                    type="date"
                    value={pt.due_date}
                    onChange={(e) => patchPrimaryTask(a.id, pt.id, { due_date: e.target.value })}
                    className={cn("mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm", GLASS_INPUT)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Progress from steps</label>
                  <div className="mt-2">
                    <ProgressBar pct={ptPct} />
                    <p className="text-xs text-zinc-500 mt-1">
                      {ptPct}% — {pt.chunks.filter((c) => c.status === "completed").length}/{pt.chunks.length || 0} chunks
                      done
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-zinc-400">Steps (this main task)</h4>
                  <button
                    type="button"
                    onClick={() => addChunk(a.id, pt.id)}
                    className="flex items-center gap-1 text-sm font-medium text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-4 h-4" />
                    Add step
                  </button>
                </div>
                {pt.chunks.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-1">Split this deliverable into phases (design, build, review…).</p>
                ) : (
                  <ul className="space-y-2">
                    {pt.chunks.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                      >
                        <div className="space-y-2">
                          <textarea
                            value={c.title}
                            onChange={(e) => updateChunk(a.id, pt.id, c.id, { title: e.target.value })}
                            placeholder="Step name"
                            rows={1}
                            ref={autoGrow220}
                            onInput={(e) => autoGrow220(e.currentTarget)}
                            className={cn("w-full rounded-lg px-2.5 py-1.5 text-sm resize-none", GLASS_TEXTAREA)}
                            style={{ scrollbarGutter: "stable" as any }}
                          />
                          <div className="flex items-center gap-2">
                            <ChunkStatusSelect
                              value={c.status}
                              onChange={(v) => updateChunk(a.id, pt.id, c.id, { status: v })}
                            />
                            <div className="flex-1" />
                            <button
                              type="button"
                              onClick={() => removeChunk(a.id, pt.id, c.id)}
                              className="p-1.5 text-zinc-600 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-zinc-500 flex items-center gap-1">
                            <AtSign className="w-3 h-3 opacity-60" />
                            Mentions for this step
                          </label>
                          <div className="mt-1">
                            <TagField
                              compact
                              tags={c.tags || []}
                              onChange={(tags) => updateChunk(a.id, pt.id, c.id, { tags })}
                              placeholder="@who · #ticket — Enter"
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-5">
        <label className="text-xs font-medium text-zinc-500">Brief from manager</label>
        <textarea
          value={a.description}
          onChange={(e) => patchAssignment(a.id, { description: e.target.value })}
          rows={compact ? 2 : 3}
          ref={autoGrow220}
          onInput={(e) => autoGrow220(e.currentTarget)}
          placeholder="Context, links, expectations…"
          className={cn("mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm resize-none max-h-[220px]", GLASS_TEXTAREA)}
          style={{ scrollbarGutter: "stable" as any }}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <button
            type="button"
            onClick={() => setExtrasOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            {extrasOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRightIcon className="w-4 h-4 text-zinc-500" />}
            <span className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-orange-300/70" />
              Extra work &amp; blockers
              {intTotal > 0 && (
                <span className="text-[11px] text-zinc-500">
                  · {intDoneCount}/{intTotal} done
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { addInterrupt(a.id); setExtrasOpen(true); }}
            className="flex items-center gap-1 text-sm font-medium text-orange-300/90 hover:text-orange-200"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        </div>
        {!extrasOpen ? (
          <p className="text-sm text-zinc-500 py-2">
            {intTotal === 0 ? "No extra work yet." : "Collapsed — expand to view and edit blockers."}
          </p>
        ) : (
          <>
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
                  <li
                    key={it.id}
                    className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] backdrop-blur-md p-3 space-y-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
                  >
                <button
                  type="button"
                  onClick={() =>
                    setOpenExtras((p) => {
                      const cur = p[it.id] ?? true;
                      return { ...p, [it.id]: !cur };
                    })
                  }
                  className="w-full flex items-start gap-2 text-left"
                >
                  <span className="mt-0.5 text-zinc-500 shrink-0">
                    {(openExtras[it.id] !== false) ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-orange-300/80 shrink-0">Extra</span>
                      {it.source_ticket_id && (
                        <>
                          <span className="text-[11px] text-zinc-600">·</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400/90">Tickets</span>
                        </>
                      )}
                      <span className="text-[11px] text-zinc-600">·</span>
                      <span className="text-[11px] text-zinc-400">{CHUNK_STATUS_LABEL[it.status]}</span>
                      <div className="ml-auto text-[11px] text-zinc-500 line-clamp-1">
                        {it.blocks_target_id && it.blocks_target_kind ? `Blocks: ${blockTargetLabel(a, it.blocks_target_kind, it.blocks_target_id)}` : "Blocks: —"}
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-medium text-white/90 line-clamp-2">
                      {it.title?.trim() ? it.title.trim() : "Untitled extra work"}
                    </div>
                  </div>
                </button>

                {(openExtras[it.id] !== false) && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <textarea
                        value={it.title}
                        onChange={(e) => updateInterrupt(a.id, it.id, { title: e.target.value })}
                        placeholder="What came up?"
                        rows={1}
                        ref={autoGrow220}
                        onInput={(e) => autoGrow220(e.currentTarget)}
                        className="flex-1 min-w-[160px] rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur-sm px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        style={{ scrollbarGutter: "stable" as any }}
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
                      ref={autoGrow220}
                      onInput={(e) => autoGrow220(e.currentTarget)}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur-sm px-2.5 py-1.5 text-sm text-zinc-100 resize-none max-h-[220px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      style={{ scrollbarGutter: "stable" as any }}
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
                  </div>
                )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmtDateDMY(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function WeekGridListView({
  weekStart,
  weekAssignments,
  weekAssignmentsAllRoles,
  myWorkboardRole,
  addAssignment,
  removeAssignment,
  patchAssignment,
  patchPrimaryTask,
  addPrimaryTask,
  removePrimaryTask,
  addChunk,
  removeChunk,
  updateChunk,
  addInterrupt,
  removeInterrupt,
  updateInterrupt,
}: {
  weekStart: string;
  /** Full tasks for this week (same week + role toolbar filter only). Not sliced by “today”. */
  weekAssignments: MainAssignment[];
  /** Same week, all departments — used for ticket cards by day and department editors when the toolbar hides a role. */
  weekAssignmentsAllRoles: MainAssignment[];
  myWorkboardRole: WorkboardRoleId | null;
  addAssignment: (role_id: WorkboardRoleId) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, patch: Partial<MainAssignment>) => void;
  patchPrimaryTask: (assignmentId: string, taskId: string, patch: Partial<WorkboardPrimaryTask>) => void;
  addPrimaryTask: (assignmentId: string) => void;
  removePrimaryTask: (assignmentId: string, taskId: string) => void;
  addChunk: (assignmentId: string, primaryTaskId: string) => void;
  removeChunk: (assignmentId: string, primaryTaskId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, primaryTaskId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart]);
  const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  const daySub = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const diffDays = (a: string, b: string) => {
    const da = new Date(a + "T12:00:00").getTime();
    const db = new Date(b + "T12:00:00").getTime();
    if (!isFinite(da) || !isFinite(db)) return 0;
    return Math.round((da - db) / 86400000);
  };

  const byRole = useMemo(() => {
    const m = new Map<WorkboardRoleId, MainAssignment>();
    weekAssignments.forEach((a) => m.set(a.role_id, a));
    return m;
  }, [weekAssignments]);

  const aiDevAssignment = useMemo(
    () => weekAssignmentsAllRoles.find((a) => a.role_id === "ai_dev"),
    [weekAssignmentsAllRoles],
  );

  const [openRole, setOpenRole] = useState<Record<string, boolean>>({});
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  /** Large create dialog: title + steps for a chosen day. */
  const [createDraft, setCreateDraft] = useState<{
    dayIso: string;
    role: WorkboardRoleId;
    title: string;
    stepLines: string[];
  } | null>(null);
  /** Which task cards show steps (key: assignmentId:taskId). */
  const [expandedDayTasks, setExpandedDayTasks] = useState<Record<string, boolean>>({});
  /** If user adds a card before the department row exists, finish after `addAssignment` creates it. */
  const pendingDayCardRef = useRef<{
    dayIso: string;
    role: WorkboardRoleId;
    title: string;
    chunkTitles: string[];
  } | null>(null);
  const commitDialogBusyRef = useRef(false);

  type DragPayload =
    | { kind: "task"; assignmentId: string; taskId: string; fromDay: string }
    | { kind: "chunk"; assignmentId: string; taskId: string; chunkId: string; fromDay: string };
  const dragRef = useRef<DragPayload | null>(null);

  const missingRoles = WORKBOARD_ROLES.filter((r) => !weekAssignments.some((a) => a.role_id === r.id));

  useEffect(() => {
    const p = pendingDayCardRef.current;
    if (!p) return;
    const a = byRole.get(p.role);
    if (!a) return;
    const title = p.title.trim();
    if (!title) {
      pendingDayCardRef.current = null;
      return;
    }
    const chunks: WorkboardChunk[] = p.chunkTitles.map((tit, i) => ({
      id: newId(),
      title: tit,
      status: "not_started",
      sort_order: i,
      tags: [],
    }));
    const n = a.primary_tasks.length;
    patchAssignment(a.id, {
      primary_tasks: [
        ...a.primary_tasks,
        {
          id: newId(),
          title,
          due_date: p.dayIso,
          origin_due_date: p.dayIso,
          completed: false,
          sort_order: n,
          chunks,
        } as any,
      ],
    } as any);
    pendingDayCardRef.current = null;
    toast.success("Card added");
  }, [weekAssignments, byRole, patchAssignment]);

  const openAddTaskDialog = (dIso: string) => {
    setCreateDraft({
      dayIso: dIso,
      role: myWorkboardRole ?? "ai_dev",
      title: "",
      stepLines: [""],
    });
  };

  const closeAddTaskDialog = () => setCreateDraft(null);

  const commitNewTaskFromDialog = () => {
    if (!createDraft || commitDialogBusyRef.current) return;
    const { dayIso, role, title, stepLines } = createDraft;
    const t = title.trim();
    if (!t) {
      toast.message("Add a title first");
      return;
    }
    commitDialogBusyRef.current = true;
    try {
      const chunkTitles = stepLines.map((s) => s.trim()).filter(Boolean);
      const chunks: WorkboardChunk[] = chunkTitles.map((tit, i) => ({
        id: newId(),
        title: tit,
        status: "not_started" as const,
        sort_order: i,
        tags: [],
      }));
      const a = byRole.get(role);
      if (!a) {
        pendingDayCardRef.current = { dayIso, role, title: t, chunkTitles };
        addAssignment(role);
        toast.message("Creating department card…");
        closeAddTaskDialog();
        return;
      }
      const n = a.primary_tasks.length;
      patchAssignment(a.id, {
        primary_tasks: [
          ...a.primary_tasks,
          {
            id: newId(),
            title: t,
            due_date: dayIso,
            origin_due_date: dayIso,
            completed: false,
            sort_order: n,
            chunks,
          } as any,
        ],
      } as any);
      toast.success("Card added");
      closeAddTaskDialog();
    } finally {
      commitDialogBusyRef.current = false;
    }
  };

  return (
    <div className="space-y-5">
      {missingRoles.length > 0 && (
        <div className={cn(BENTO_SURFACE, "border-dashed p-5")}>
          <p className="text-sm text-zinc-500 mb-3">Add a department card:</p>
          <div className="flex flex-wrap gap-2">
            {missingRoles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addAssignment(r.id)}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-violet-500/25 bg-violet-600/15 text-zinc-100 hover:bg-violet-600 hover:text-white hover:border-violet-500/50 transition-colors shadow-[0_0_20px_-8px_rgba(124,58,237,0.4)]"
              >
                + {r.short}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={cn(BENTO_SURFACE, "p-4")}>
        <div className="text-sm font-semibold text-white tabular-nums">{fmtWeekRange(weekStart)}</div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((dIso) => (
            <div
              key={dIso}
              className={cn(
                "rounded-2xl border bg-black/35 backdrop-blur-xl p-3 min-h-[240px] flex flex-col",
                dragOverDay === dIso ? "border-violet-500/35 shadow-[0_0_26px_-10px_rgba(124,58,237,0.55)]" : "border-white/10",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDay(dIso);
              }}
              onDragLeave={() => setDragOverDay((cur) => (cur === dIso ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDay(null);
                const payload = dragRef.current;
                dragRef.current = null;
                if (!payload) return;
                // Only handle cross-day moves.
                if (payload.fromDay === dIso) return;
                const a = weekAssignments.find((x) => x.id === payload.assignmentId);
                const pt = a?.primary_tasks?.find((x) => x.id === payload.taskId);
                if (!a || !pt) return;
                if (payload.kind === "task") {
                  const origin = (pt as any).origin_due_date || pt.due_date;
                  patchPrimaryTask(payload.assignmentId, payload.taskId, {
                    due_date: dIso,
                    origin_due_date: origin,
                  } as any);
                  return;
                }
                const ch = pt.chunks?.find((c) => c.id === payload.chunkId);
                if (!ch) return;
                const origin = (ch as any).origin_scheduled_for || (ch as any).scheduled_for || pt.due_date;
                updateChunk(payload.assignmentId, payload.taskId, payload.chunkId, {
                  scheduled_for: dIso,
                  origin_scheduled_for: origin,
                } as any);
              }}
            >
              <div className="mb-2 shrink-0">
                <div className="text-[11px] font-black text-white">{dayLabel(dIso)}</div>
                <div className="text-[11px] text-zinc-500">{daySub(dIso)}</div>
              </div>

              <div className="flex flex-col flex-1 min-h-0 gap-2">
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5 [scrollbar-gutter:stable]">
                  {(() => {
                    const tasksForDay: { a: MainAssignment; pt: WorkboardPrimaryTask }[] = [];
                    const stepMovesForDay: { a: MainAssignment; pt: WorkboardPrimaryTask; c: WorkboardChunk }[] = [];
                    for (const a of weekAssignments) {
                      for (const pt of a.primary_tasks || []) {
                        if (String(pt.due_date || "").slice(0, 10) !== dIso) continue;
                        /** Hide legacy placeholder rows (empty title + no steps) so they don’t appear on Fri by mistake. */
                        const hasContent =
                          Boolean(pt.title?.trim()) || (pt.chunks?.length ?? 0) > 0;
                        if (!hasContent) continue;
                        tasksForDay.push({ a, pt });
                      }
                    }
                    for (const a of weekAssignments) {
                      for (const pt of a.primary_tasks || []) {
                        const ptDay = String(pt.due_date || "").slice(0, 10);
                        for (const c of pt.chunks || []) {
                          const cDay = String((c as any).scheduled_for || ptDay || "").slice(0, 10);
                          if (!cDay || cDay !== dIso) continue;
                          // Only show in this "moved steps" lane when it doesn't naturally belong to the task's day.
                          if (ptDay === dIso && !(c as any).scheduled_for) continue;
                          if (ptDay === dIso && (c as any).scheduled_for === dIso) continue;
                          stepMovesForDay.push({ a, pt, c });
                        }
                      }
                    }
                    tasksForDay.sort((x, y) => {
                      const rs = roleShort(x.a.role_id).localeCompare(roleShort(y.a.role_id));
                      if (rs !== 0) return rs;
                      return (x.pt.title || "").localeCompare(y.pt.title || "");
                    });
                    stepMovesForDay.sort((x, y) => {
                      const rs = roleShort(x.a.role_id).localeCompare(roleShort(y.a.role_id));
                      if (rs !== 0) return rs;
                      const ts = (x.pt.title || "").localeCompare(y.pt.title || "");
                      if (ts !== 0) return ts;
                      return (x.c.title || "").localeCompare(y.c.title || "");
                    });

                    const weekEnd = addDaysISO(weekStart, 6);
                    const extrasForDay: WorkboardInterrupt[] = [];
                    if (aiDevAssignment) {
                      for (const it of aiDevAssignment.interrupts || []) {
                        // Ticket-backed: use ticket_anchor_date.
                        if (it.source_ticket_id && it.ticket_anchor_date) {
                          const anchor = String(it.ticket_anchor_date).slice(0, 10);
                          if (anchor < weekStart || anchor > weekEnd) continue;
                          if (anchor !== dIso) continue;
                          extrasForDay.push(it);
                          continue;
                        }
                        // Manual extras: show on the day they were created.
                        const created = String((it as any).created_at || "").slice(0, 10);
                        if (!created) continue;
                        if (created < weekStart || created > weekEnd) continue;
                        if (created !== dIso) continue;
                        extrasForDay.push(it);
                      }
                      extrasForDay.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                    }

                    if (tasksForDay.length === 0 && extrasForDay.length === 0) {
                      return (
                        <p className="text-[11px] text-zinc-600 py-1 px-0.5">No tasks — add one below.</p>
                      );
                    }

                    return (
                      <>
                        {tasksForDay.map(({ a, pt }) => {
                          const expandKey = `${a.id}:${pt.id}`;
                          const stepsOpen = expandedDayTasks[expandKey] === true;
                          const origin = (pt as any).origin_due_date || pt.due_date;
                          const delta = diffDays(pt.due_date, origin);
                          return (
                            <div
                              key={expandKey}
                              className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden"
                            >
                              <div className="flex items-stretch gap-0">
                                <div
                                  className="shrink-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 border-r border-white/[0.06] bg-black/20"
                                  draggable
                                  onDragStart={() => {
                                    dragRef.current = { kind: "task", assignmentId: a.id, taskId: pt.id, fromDay: dIso };
                                  }}
                                  onDragEnd={() => {
                                    dragRef.current = null;
                                    setDragOverDay(null);
                                  }}
                                  title="Drag to another day"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDayTasks((p) => ({ ...p, [expandKey]: !stepsOpen }))
                                  }
                                  className={cn(
                                    "flex-1 min-w-0 text-left px-2.5 py-2.5 flex items-start gap-2",
                                    "hover:bg-white/[0.06] transition-colors",
                                  )}
                                >
                                  <span className="mt-0.5 text-zinc-500 shrink-0">
                                    {stepsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="text-[12px] font-semibold text-white line-clamp-2 block">
                                      {pt.title?.trim() ? pt.title.trim() : "Untitled main task"}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                      <span className="text-[10px] font-medium text-violet-300/90">{roleShort(a.role_id)}</span>
                                      {!!delta && (
                                        <span className="text-[10px] text-zinc-500">
                                          · moved <span className="text-violet-200/90">{Math.abs(delta)}d</span>
                                        </span>
                                      )}
                                    </span>
                                  </span>
                                </button>
                              </div>
                              {stepsOpen && (
                                <div className="px-3 pb-3 pt-0 border-t border-white/[0.06] bg-black/25">
                                  {pt.chunks?.length ? (
                                    <ul className="mt-2 space-y-1.5">
                                      {pt.chunks
                                        .filter((c) => {
                                          const cDay = String((c as any).scheduled_for || pt.due_date || "").slice(0, 10);
                                          return cDay === dIso;
                                        })
                                        .map((c) => (
                                        <li
                                          key={c.id}
                                          className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5"
                                        >
                                          <div
                                            draggable
                                            onDragStart={() => {
                                              dragRef.current = { kind: "chunk", assignmentId: a.id, taskId: pt.id, chunkId: c.id, fromDay: dIso };
                                            }}
                                            onDragEnd={() => {
                                              dragRef.current = null;
                                              setDragOverDay(null);
                                            }}
                                            title="Drag step to another day"
                                            className="shrink-0 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 pt-0.5"
                                          >
                                            <GripVertical className="w-3.5 h-3.5" />
                                          </div>
                                          <span className="text-[11px] text-zinc-200 min-w-0">
                                            {c.title?.trim() ? c.title.trim() : "Untitled step"}
                                          </span>
                                          <span className="text-[10px] text-zinc-500 shrink-0">{CHUNK_STATUS_LABEL[c.status]}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="mt-2 text-[11px] text-zinc-500">No steps yet.</p>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setOpenRole((p) => ({ ...p, [`editor:${a.id}`]: true }))}
                                    className="mt-2 text-[11px] text-violet-300 hover:text-violet-200"
                                  >
                                    Edit in department →
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {stepMovesForDay.length > 0 && (
                          <div className={cn("space-y-2", tasksForDay.length > 0 && "pt-1 mt-1 border-t border-white/[0.08]")}>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-200/80 px-0.5">
                              Steps moved here
                            </div>
                            <div className="space-y-1.5">
                              {stepMovesForDay.map(({ a, pt, c }) => (
                                <div
                                  key={`${a.id}:${pt.id}:${c.id}`}
                                  className="rounded-xl border border-violet-500/20 bg-violet-600/[0.06] px-2.5 py-2 flex items-start gap-2"
                                >
                                  <div
                                    draggable
                                    onDragStart={() => {
                                      dragRef.current = {
                                        kind: "chunk",
                                        assignmentId: a.id,
                                        taskId: pt.id,
                                        chunkId: c.id,
                                        fromDay: dIso,
                                      };
                                    }}
                                    onDragEnd={() => {
                                      dragRef.current = null;
                                      setDragOverDay(null);
                                    }}
                                    title="Drag step to another day"
                                    className="shrink-0 cursor-grab active:cursor-grabbing text-violet-200/50 hover:text-violet-200 pt-0.5"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] text-white/90 line-clamp-2">
                                      {c.title?.trim() ? c.title.trim() : "Untitled step"}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-zinc-500 line-clamp-1">
                                      {roleShort(a.role_id)} · {pt.title?.trim() ? pt.title.trim() : "Main task"}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-zinc-500 shrink-0">{CHUNK_STATUS_LABEL[c.status]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {extrasForDay.length > 0 && aiDevAssignment && (
                          <div
                            className={cn(
                              "space-y-2",
                              tasksForDay.length > 0 && "pt-1 mt-1 border-t border-white/[0.08]",
                            )}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-300/90 px-0.5">
                              Added today · AI Dev (tickets + extras)
                            </div>
                            {extrasForDay.map((it) => {
                              const expandKey = `tix:${aiDevAssignment.id}:${it.id}`;
                              const detailOpen = expandedDayTasks[expandKey] === true;
                              return (
                                <div
                                  key={expandKey}
                                  className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] to-transparent overflow-hidden"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedDayTasks((p) => ({ ...p, [expandKey]: !detailOpen }))
                                    }
                                    className={cn(
                                      "w-full text-left px-2.5 py-2.5 flex items-start gap-2",
                                      "hover:bg-orange-500/[0.08] transition-colors",
                                    )}
                                  >
                                    <span className="mt-0.5 text-orange-400/80 shrink-0">
                                      {detailOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="text-[12px] font-semibold text-white line-clamp-2 block">
                                        {it.title?.trim() ? it.title.trim() : (it.source_ticket_id ? "Ticket" : "Extra")}
                                      </span>
                                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                        <span className="text-[10px] font-medium text-violet-300/90">
                                          {it.source_ticket_id ? "Tickets" : "Extra"}
                                        </span>
                                        <span className="text-[10px] text-zinc-500">·</span>
                                        <span className="text-[10px] text-orange-200/90">{CHUNK_STATUS_LABEL[it.status]}</span>
                                      </span>
                                    </span>
                                  </button>
                                  {detailOpen && (
                                    <div className="px-3 pb-3 pt-0 border-t border-orange-500/20 bg-black/20">
                                      {it.note?.trim() ? (
                                        <p className="mt-2 text-[11px] text-zinc-300 whitespace-pre-wrap">{it.note.trim()}</p>
                                      ) : (
                                        <p className="mt-2 text-[11px] text-zinc-500">No extra notes.</p>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOpenRole((p) => ({
                                            ...p,
                                            [`editor:${aiDevAssignment.id}`]: true,
                                          }))
                                        }
                                        className="mt-2 text-[11px] text-orange-300 hover:text-orange-200"
                                      >
                                        Edit in AI Developer →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="shrink-0 pt-2 mt-auto border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => openAddTaskDialog(dIso)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-[11px] font-medium transition-colors",
                      "border border-dashed border-white/12 bg-transparent text-zinc-500 hover:text-zinc-200 hover:border-violet-500/30 hover:bg-violet-500/[0.06]",
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    New card
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={createDraft !== null}
        onOpenChange={(o) => {
          if (!o) closeAddTaskDialog();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[min(90vh,720px)] overflow-y-auto border border-white/10 bg-zinc-950/98 text-zinc-100 backdrop-blur-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">
              New card
              {createDraft && (
                <span className="text-zinc-500 font-normal text-base">
                  {" "}
                  · {dayLabel(createDraft.dayIso)} {daySub(createDraft.dayIso)}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a title and optional steps. Cards in the week view show the title; open a card to see its steps.
            </DialogDescription>
          </DialogHeader>

          {createDraft && (
            <div className="space-y-5 pt-1">
              <div>
                <label className="text-xs font-medium text-zinc-500" htmlFor="wb-create-role">
                  Department
                </label>
                <select
                  id="wb-create-role"
                  value={createDraft.role}
                  onChange={(e) =>
                    setCreateDraft((d) =>
                      d ? { ...d, role: e.target.value as WorkboardRoleId } : d,
                    )
                  }
                  className={cn("mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm", GLASS_INPUT)}
                >
                  {WORKBOARD_ROLES.map((r) => (
                    <option key={r.id} value={r.id} className="bg-zinc-950 text-white">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500" htmlFor="wb-create-title">
                  Title
                </label>
                <textarea
                  id="wb-create-title"
                  value={createDraft.title}
                  onChange={(e) =>
                    setCreateDraft((d) => (d ? { ...d, title: e.target.value } : d))
                  }
                  placeholder="What needs to ship?"
                  rows={4}
                  className={cn("mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm resize-y min-h-[100px]", GLASS_TEXTAREA)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-zinc-500">Steps</label>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateDraft((d) => (d ? { ...d, stepLines: [...d.stepLines, ""] } : d))
                    }
                    className="text-xs font-medium text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add step
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {createDraft.stepLines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={line}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCreateDraft((d) => {
                            if (!d) return d;
                            const next = [...d.stepLines];
                            next[i] = v;
                            return { ...d, stepLines: next };
                          });
                        }}
                        placeholder={i === 0 ? "First step (optional)" : `Step ${i + 1}`}
                        className={cn("flex-1 min-w-0 rounded-xl px-3 py-2 text-sm", GLASS_INPUT)}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCreateDraft((d) => {
                            if (!d) return d;
                            const next = d.stepLines.filter((_, j) => j !== i);
                            return { ...d, stepLines: next.length ? next : [""] };
                          })
                        }
                        className="shrink-0 p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                        title="Remove step"
                        aria-label="Remove step"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={closeAddTaskDialog}
                  className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitNewTaskFromDialog}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-600/25"
                >
                  Add card
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden editors (opened by per-role edit buttons) */}
      <div className="hidden">
        {weekAssignmentsAllRoles.map((a) => (
          <Dialog key={a.id} open={openRole[`editor:${a.id}`] === true} onOpenChange={(o) => setOpenRole((p) => ({ ...p, [`editor:${a.id}`]: o }))}>
            <DialogContent className="max-w-3xl max-h-[min(90vh,820px)] overflow-hidden border border-white/10 bg-zinc-950/95 text-zinc-100 backdrop-blur-2xl flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-white">{roleLabel(a.role_id)}</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Edit main tasks, steps, and blockers for this department.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto pr-0.5 [scrollbar-gutter:stable] touch-pan-y">
                <AssignmentEditor
                  a={a}
                  removeAssignment={removeAssignment}
                  patchAssignment={patchAssignment}
                  patchPrimaryTask={patchPrimaryTask}
                  addPrimaryTask={addPrimaryTask}
                  removePrimaryTask={removePrimaryTask}
                  addChunk={addChunk}
                  removeChunk={removeChunk}
                  updateChunk={updateChunk}
                  addInterrupt={addInterrupt}
                  removeInterrupt={removeInterrupt}
                  updateInterrupt={updateInterrupt}
                />
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </div>
  );
}

function GalleryView({
  byRole,
  myWorkboardRole,
  addAssignment,
  removeAssignment,
  patchAssignment,
  patchPrimaryTask,
  addPrimaryTask,
  removePrimaryTask,
  addChunk,
  removeChunk,
  updateChunk,
  addInterrupt,
  removeInterrupt,
  updateInterrupt,
}: {
  byRole: Map<WorkboardRoleId, MainAssignment>;
  myWorkboardRole: WorkboardRoleId | null;
  addAssignment: (role_id: WorkboardRoleId) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, patch: Partial<MainAssignment>) => void;
  patchPrimaryTask: (assignmentId: string, taskId: string, patch: Partial<WorkboardPrimaryTask>) => void;
  addPrimaryTask: (assignmentId: string) => void;
  removePrimaryTask: (assignmentId: string, taskId: string) => void;
  addChunk: (assignmentId: string, primaryTaskId: string) => void;
  removeChunk: (assignmentId: string, primaryTaskId: string, chunkId: string) => void;
  updateChunk: (assignmentId: string, primaryTaskId: string, chunkId: string, patch: Partial<WorkboardChunk>) => void;
  addInterrupt: (assignmentId: string) => void;
  removeInterrupt: (assignmentId: string, intId: string) => void;
  updateInterrupt: (assignmentId: string, intId: string, patch: Partial<WorkboardInterrupt>) => void;
}) {
  const [expandId, setExpandId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {WORKBOARD_ROLES.map((r) => {
        const a = byRole.get(r.id);
        const isFeaturedSlot = myWorkboardRole !== null && r.id === myWorkboardRole;
        if (!a) {
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => addAssignment(r.id)}
              className={cn(
                BENTO_SURFACE,
                "border-2 border-dashed min-h-[160px] flex flex-col justify-center p-6 text-left",
                "hover:border-violet-400/50 hover:bg-violet-500/[0.08] hover:shadow-[0_0_40px_-12px_rgba(124,58,237,0.35)] transition-colors",
                isFeaturedSlot && "ring-2 ring-violet-500/30",
              )}
            >
              <span className="text-sm font-medium text-zinc-200">{r.label}</span>
              <span className="text-xs text-zinc-500 mt-2">Add this week’s focus</span>
            </button>
          );
        }
        const { headline, dueLine } = listCardMainSummary(a);
        const flatC = flattenAssignmentChunks(a);
        const pct = assignmentRollupPercent(a);
        const intPct = interruptRollupPercent(a.interrupts);
        const intDoneCount = a.interrupts.filter((i) => i.status === "completed").length;
        const open = expandId === a.id;
        const doneChunks = flatC.filter((c) => c.status === "completed").length;
        const galleryDoneToday = flatC.filter((c) => c.completed_at === todayISO()).length;
        return (
          <div
            key={a.id}
            className={cn(
              BENTO_SURFACE,
              "overflow-hidden flex flex-col min-h-0",
              // When expanded, constrain height so the editor scrolls smoothly inside.
              open && "max-h-[min(86vh,920px)]",
              isFeaturedSlot && "ring-2 ring-violet-500/45 shadow-[0_0_50px_-14px_rgba(124,58,237,0.4)]",
            )}
          >
            <div className={cn("p-4 flex flex-col", open ? "flex-none" : "flex-1 min-h-0")}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-violet-300/90 flex items-center flex-wrap gap-1.5">
                  {roleShort(r.id)}
                  {isFeaturedSlot && (
                    <span className="text-[9px] font-bold uppercase text-violet-200/95 px-1.5 py-0.5 rounded bg-violet-500/30 border border-violet-400/35">
                      You
                    </span>
                  )}
                </span>
                {dueLine && <span className="text-[11px] text-zinc-500 text-right line-clamp-1">{dueLine}</span>}
              </div>
              <p className="text-[11px] font-medium text-zinc-500 mb-1">Assigned</p>
              <h2 className="text-sm font-medium text-white line-clamp-3 min-h-[2.75rem] leading-snug">
                {headline}
              </h2>
              <div className="mt-3 flex items-start gap-3">
                <MiniRing pct={pct} size={52} />
                <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                  <div className="flex flex-wrap gap-1">
                    {galleryDoneToday > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />{galleryDoneToday} today
                      </span>
                    )}
                    {doneChunks > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-200 border border-violet-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />{doneChunks} done
                      </span>
                    )}
                    {(() => {
                      const active = flatC.filter(c => c.status === "in_progress").length; return active > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-200 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />{active} active
                        </span>
                      ) : null;
                    })()}
                    {flatC.length === 0 && <span className="text-[10px] text-zinc-600">No steps</span>}
                  </div>
                  {a.interrupts.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/[0.05]">
                        <div className="h-full bg-orange-500/70 rounded-full transition-all" style={{ width: `${intPct}%` }} />
                      </div>
                      <span className="text-[10px] text-orange-300/70 shrink-0">{intDoneCount}/{a.interrupts.length} extras</span>
                    </div>
                  )}
                </div>
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

              {a.primary_tasks.some((p) => p.chunks.length > 0) && (
                <div className="mt-3 border-t border-white/[0.06] pt-2">
                  <p className="text-[11px] font-medium text-zinc-500 mb-1.5">Steps</p>
                  <div className="pr-0.5 space-y-2">
                    {a.primary_tasks.map(
                      (pt) =>
                        pt.chunks.length > 0 && (
                          <div key={pt.id}>
                            <p className="text-[10px] text-violet-300/60 mb-0.5 truncate" title={pt.title}>
                              {pt.title || "Main task"}
                            </p>
                            <ul className="space-y-1">
                              {pt.chunks.map((c) => (
                                <li key={c.id} className="text-[11px] text-zinc-300 leading-tight">
                                  <div className="flex items-start justify-between gap-2">
                                    <DragScrollText text={c.title || "Untitled chunk"} className="text-zinc-300 text-[11px]" />
                                    <span className="shrink-0 text-zinc-500 text-[10px]">
                                      {CHUNK_STATUS_LABEL[c.status]}
                                    </span>
                                  </div>
                                  {(c.tags || []).length > 0 && (
                                    <div className="mt-1 pl-0">
                                      <TagChipsRow tags={c.tags} max={4} />
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ),
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 border-t border-white/[0.06] pt-2">
                <p className="text-[11px] font-medium text-orange-300/90 mb-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Blocking
                </p>
                {a.interrupts.some((it) => it.blocks_target_id && it.blocks_target_kind) ? (
                  <div>
                    <BlockingLines a={a} />
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-600">Nothing linked yet — add interrupts and what they block.</p>
                )}
              </div>

              {a.interrupts.length > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-2 flex-1 min-h-0">
                  <p className="text-[11px] font-medium text-orange-300/90 mb-1.5">Extra work</p>
                  <ul className="space-y-2">
                    {a.interrupts.map((it) => {
                      const done = it.status === "completed";
                      return (
                        <li
                          key={it.id}
                          className={cn(
                            "text-[11px] leading-snug rounded-lg border px-2 py-1.5 -mx-0.5 transition-colors",
                            done
                              ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                              : "border-orange-500/15 bg-orange-500/[0.04]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex gap-1.5 min-w-0 flex-1">
                              {done ? (
                                <CheckCircle2
                                  className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5"
                                  aria-hidden
                                />
                              ) : (
                                <span className="text-amber-500/70 shrink-0 mt-0.5">+</span>
                              )}
                              <DragScrollText
                                text={it.title || "Untitled"}
                                className={cn(
                                  "text-[11px]",
                                  done ? "text-emerald-100/95" : "text-zinc-300",
                                )}
                              />
                            </div>
                            <span
                              className={cn(
                                "shrink-0 text-[10px] font-medium tabular-nums",
                                done ? "text-emerald-400/95" : "text-orange-200/85",
                              )}
                            >
                              {CHUNK_STATUS_LABEL[it.status]}
                            </span>
                          </div>
                          {(it.tags || []).length > 0 && (
                            <div className={cn("mt-1.5", done ? "ml-5" : "ml-4")}>
                              <TagChipsRow tags={it.tags} max={4} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className="border-t border-white/10 p-2 flex gap-2 bg-black/40 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setExpandId(open ? null : a.id)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-violet-500/20 bg-violet-600/20 text-white hover:bg-violet-600 hover:border-violet-400/40 transition-colors shadow-[0_0_28px_-8px_rgba(124,58,237,0.45)]"
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
              <div className="border-t border-white/10 p-4 bg-black/45 backdrop-blur-2xl flex-1 min-h-0 overflow-y-auto overscroll-y-auto [scrollbar-gutter:stable] touch-pan-y">
                <AssignmentEditor
                  a={a}
                  compact
                  removeAssignment={removeAssignment}
                  patchAssignment={patchAssignment}
                  patchPrimaryTask={patchPrimaryTask}
                  addPrimaryTask={addPrimaryTask}
                  removePrimaryTask={removePrimaryTask}
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
