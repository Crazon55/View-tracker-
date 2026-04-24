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
};

export type WorkboardInterrupt = {
  id: string;
  title: string;
  status: ChunkStatus;
  note: string;
  /** What this interrupt blocks: chunk id or main assignment id */
  blocks_target_id: string | null;
  blocks_target_kind: "chunk" | "main" | null;
};

export type MainAssignment = {
  id: string;
  role_id: WorkboardRoleId;
  week_start: string;
  title: string;
  description: string;
  due_date: string;
  chunks: WorkboardChunk[];
  interrupts: WorkboardInterrupt[];
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

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
