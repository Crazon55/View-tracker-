/** Weekly workboard for AI / Design / Ops / Leadership / Video / Content — types only. */

export type WorkboardRoleId =
  | "ai_dev"
  | "graphic_designer"
  | "ops_manager"
  | "boss_man"
  | "video_editor"
  | "content_creator";

export const WORKBOARD_ROLES: { id: WorkboardRoleId; label: string; short: string }[] = [
  { id: "ai_dev", label: "AI Developer", short: "AI Dev" },
  { id: "graphic_designer", label: "Graphic Designer", short: "Design" },
  { id: "ops_manager", label: "Ops Manager", short: "Ops" },
  { id: "boss_man", label: "Boss Man", short: "Lead" },
  { id: "video_editor", label: "Video Editor", short: "Video" },
  { id: "content_creator", label: "Content Creator", short: "Content" },
];

/** Label for app `user_roles.role` / assignment `role_id` (extend WORKBOARD_ROLES when adding roles). */
export function workboardRoleLabel(roleId: string | null | undefined): string | null {
  if (!roleId) return null;
  const hit = WORKBOARD_ROLES.find((r) => r.id === roleId);
  if (hit) return hit.label;
  return roleId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Secondary line under the name in @mention menu (role · email). */
export function workboardMentionSubtitle(
  roleId: string | null | undefined,
  email: string | null | undefined,
  opts?: { isContentStrategist?: boolean },
): string | null {
  const parts: string[] = [];
  const rl = workboardRoleLabel(roleId);
  if (rl) parts.push(rl);
  if (email?.trim()) parts.push(email.trim());
  if (parts.length) return parts.join(" · ");
  if (opts?.isContentStrategist) return "Content strategist";
  return null;
}

/**
 * Quick @mentions for who assigned work or needs visibility (Notion-style).
 * Edit this list for your team — first names or display names work best.
 */
export const WORKBOARD_MENTION_PEOPLE: string[] = [
  "Om",
  "Priyanka",
  "Koushik",
  "Manager",
];

export function mentionFromName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return n.startsWith("@") ? n : `@${n}`;
}

export type ChunkStatus = "not_started" | "in_progress" | "completed";

export const CHUNK_STATUS_LABEL: Record<ChunkStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export type WorkboardChunk = {
  id: string;
  title: string;
  status: ChunkStatus;
  sort_order: number;
  /** @mentions / #tickets for this step */
  tags: string[];
  /** ISO date (YYYY-MM-DD) when this chunk was marked completed; cleared on unmark */
  completed_at?: string;
};

/** A top-level “main task” for the week: its own title, due date, steps, and completion. */
export type WorkboardPrimaryTask = {
  id: string;
  title: string;
  due_date: string;
  /** First due date this task was created with (used for "X days" shift badge when dragged). */
  origin_due_date?: string;
  /** Manual completion; all steps being done also shows as completed in the UI. */
  completed: boolean;
  sort_order: number;
  chunks: WorkboardChunk[];
};

export type WorkboardInterrupt = {
  id: string;
  title: string;
  status: ChunkStatus;
  note: string;
  /** ISO date (YYYY-MM-DD) when this interrupt was created (manual rows) */
  created_at?: string;
  /** What this interrupt blocks: chunk id, or a primary-task id (kind main) */
  blocks_target_id: string | null;
  blocks_target_kind: "chunk" | "main" | null;
  /** Free-form tags, e.g. #13, raised-by-om, @koushik */
  tags: string[];
  /** When set, this row is mirrored from the Tickets board (bidirectional sync). */
  source_ticket_id?: string;
  /** ISO date (YYYY-MM-DD) for week-grid column placement (usually ticket creation date). */
  ticket_anchor_date?: string;
};

export type MainAssignment = {
  id: string;
  role_id: WorkboardRoleId;
  week_start: string;
  description: string;
  /** Shippable main lines; each has its own deadline and step list. */
  primary_tasks: WorkboardPrimaryTask[];
  interrupts: WorkboardInterrupt[];
  tags: string[];
};

export type WorkboardStore = {
  version: 1;
  assignments: MainAssignment[];
};

export function getMondayISO(d: Date = new Date()): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function fmtWeekRange(weekStart: string): string {
  const end = addDaysISO(weekStart, 6);
  const a = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const b = new Date(end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

export function rollupPercent(chunks: WorkboardChunk[]): number {
  if (!chunks.length) return 0;
  const done = chunks.filter((c) => c.status === "completed").length;
  return Math.round((done / chunks.length) * 100);
}

/** All step rows across every primary task (for tags, global rollup). */
export function flattenAssignmentChunks(a: MainAssignment): WorkboardChunk[] {
  return a.primary_tasks.flatMap((p) => p.chunks);
}

export function assignmentRollupPercent(a: MainAssignment): number {
  return rollupPercent(flattenAssignmentChunks(a));
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeChunk(c: WorkboardChunk): WorkboardChunk {
  return {
    ...c,
    tags: Array.isArray(c.tags) ? c.tags : [],
  };
}

/** True when all steps in the primary task are completed (0 steps = not “fully done” for this rule). */
export function primaryTaskAllStepsDone(pt: WorkboardPrimaryTask): boolean {
  if (pt.chunks.length === 0) return false;
  return pt.chunks.every((c) => c.status === "completed");
}

/** @internal Legacy JSON may still have title/due_date/chunks on the root assignment. */
type LegacyMainAssignment = MainAssignment & {
  title?: string;
  due_date?: string;
  chunks?: WorkboardChunk[];
};

/** Ensure tags and primary_tasks exist; migrate old single main-line shape. */
export function normalizeAssignments(list: MainAssignment[]): MainAssignment[] {
  return (list as LegacyMainAssignment[]).map((a) => {
    const weekStart = a.week_start || getMondayISO();
    let topTags = Array.isArray(a.tags) ? [...a.tags] : [];
    const legacy: LegacyMainAssignment = a;

    let primary_tasks: WorkboardPrimaryTask[] = [];
    if (Array.isArray(legacy.primary_tasks) && legacy.primary_tasks.length > 0) {
      primary_tasks = legacy.primary_tasks.map((pt, order) => {
        let ch = (pt.chunks || []).map((c) => normalizeChunk(c));
        if (ch.length > 0 && topTags.length > 0 && ch.every((c) => !c.tags.length)) {
          ch = ch.map((c, i) => (i === 0 ? { ...c, tags: [...topTags] } : c));
          topTags = [];
        }
        return {
          id: pt.id || newId(),
          title: typeof pt.title === "string" ? pt.title : "",
          due_date: typeof pt.due_date === "string" ? pt.due_date : addDaysISO(weekStart, 4),
          origin_due_date: typeof (pt as any).origin_due_date === "string"
            ? (pt as any).origin_due_date
            : (typeof pt.due_date === "string" ? pt.due_date : addDaysISO(weekStart, 4)),
          completed: Boolean(pt.completed),
          sort_order: typeof pt.sort_order === "number" ? pt.sort_order : order,
          chunks: ch,
        };
      });
    } else {
      const legacyChunks = (legacy.chunks || []).map((c) => normalizeChunk(c));
      let ch = legacyChunks;
      if (ch.length > 0 && topTags.length > 0 && ch.every((c) => !c.tags.length)) {
        ch = ch.map((c, i) => (i === 0 ? { ...c, tags: [...topTags] } : c));
        topTags = [];
      }
      primary_tasks = [
        {
          id: newId(),
          title: typeof legacy.title === "string" ? legacy.title : "",
          due_date: typeof legacy.due_date === "string" ? legacy.due_date : addDaysISO(weekStart, 4),
          origin_due_date: typeof legacy.due_date === "string" ? legacy.due_date : addDaysISO(weekStart, 4),
          completed: false,
          sort_order: 0,
          chunks: ch,
        },
      ];
    }

    const firstId = primary_tasks[0]?.id;

    const interrupts = (a.interrupts || []).map((i) => {
      let blocks_target_id = i.blocks_target_id;
      let blocks_target_kind = i.blocks_target_kind;
      if (blocks_target_kind === "main" && blocks_target_id === a.id && firstId) {
        blocks_target_id = firstId;
      }
      const wi = i as WorkboardInterrupt;
      const src = wi.source_ticket_id;
      const ta = wi.ticket_anchor_date;
      return {
        ...i,
        tags: Array.isArray(i.tags) ? i.tags : [],
        blocks_target_id,
        blocks_target_kind,
        ...(typeof src === "string" && src ? { source_ticket_id: src } : {}),
        ...(typeof ta === "string" && ta.trim() ? { ticket_anchor_date: ta.trim().slice(0, 10) } : {}),
      };
    });

    return {
      id: a.id,
      role_id: a.role_id,
      week_start: weekStart,
      description: a.description || "",
      primary_tasks,
      interrupts,
      tags: topTags,
    };
  });
}
