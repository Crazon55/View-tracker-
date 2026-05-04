import type { Ticket } from "@/services/api";
import type { ChunkStatus, WorkboardInterrupt } from "@/lib/workboardTypes";
import { newId } from "@/lib/workboardTypes";

export function mapTicketStatusToChunk(status: string): ChunkStatus {
  const v = (status || "").toLowerCase();
  if (v === "resolved") return "completed";
  if (v === "in_progress") return "in_progress";
  return "not_started";
}

export function mapChunkStatusToTicket(s: ChunkStatus): "not_started" | "in_progress" | "resolved" {
  if (s === "completed") return "resolved";
  if (s === "in_progress") return "in_progress";
  return "not_started";
}

/**
 * Replaces ticket-backed interrupts while preserving manual (non-synced) rows.
 * Pass the full ticket list (or any subset); sorted newest-first; created date in note.
 */
export function mergeAssignedTicketsIntoInterrupts(
  existing: WorkboardInterrupt[],
  tickets: Ticket[],
): WorkboardInterrupt[] {
  const manual = existing.filter((x) => !x.source_ticket_id);
  const prevByTicket = new Map(
    existing.filter((x) => x.source_ticket_id).map((x) => [x.source_ticket_id!, x]),
  );

  const sorted = [...tickets].sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );

  const fromTickets: WorkboardInterrupt[] = sorted.map((t) => {
    const prev = prevByTicket.get(t.id);
    const title =
      (t.title?.trim() ||
        (t.description?.trim() ? t.description.trim().slice(0, 140) : "") ||
        `Ticket #${t.ticket_number ?? "?"}`) ||
      "Ticket";
    const created = (t.created_at || "").slice(0, 10);
    const ticket_anchor_date =
      prev && prev.source_ticket_id === t.id && prev.ticket_anchor_date?.trim()
        ? prev.ticket_anchor_date.trim().slice(0, 10)
        : created || undefined;
    const defaultNote = created ? `Ticket · added ${created}` : "Synced from Tickets";
    const note =
      prev?.note?.trim() &&
      prev.source_ticket_id === t.id &&
      !/^Ticket · added\b/i.test(prev.note.trim())
        ? prev.note
        : defaultNote;

    return {
      id: prev?.id ?? newId(),
      title,
      status: mapTicketStatusToChunk(String(t.status)),
      note,
      blocks_target_id: null,
      blocks_target_kind: null,
      tags: Array.isArray(prev?.tags) && prev.tags.length ? prev.tags : [`#ticket-${t.id}`],
      source_ticket_id: t.id,
      ...(ticket_anchor_date ? { ticket_anchor_date } : {}),
    };
  });

  return [...manual, ...fromTickets];
}
