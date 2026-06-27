/** Embed handle ids in edge_label_note when DB columns are missing (legacy Supabase). */

const META_RE = /^\[\[fsi:(\{.*?\})\]\](?:\n([\s\S]*))?$/;

export type EmbeddedHandles = {
  sourceHandle?: string;
  targetHandle?: string;
  userLabel?: string;
};

export function embedHandlesInEdgeLabelNote(
  note: string | null | undefined,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): string | null {
  if (!sourceHandle && !targetHandle) {
    return note?.trim() ? note.trim() : null;
  }
  const userLabel = userVisibleEdgeLabel(note);
  const meta = JSON.stringify({ sh: sourceHandle ?? null, th: targetHandle ?? null });
  return userLabel ? `[[fsi:${meta}]]\n${userLabel}` : `[[fsi:${meta}]]`;
}

export function parseEmbeddedHandles(note: string | null | undefined): EmbeddedHandles {
  if (!note?.trim()) return {};
  const m = META_RE.exec(note.trim());
  if (!m) return { userLabel: note.trim() };
  try {
    const parsed = JSON.parse(m[1]!) as { sh?: string | null; th?: string | null };
    const userLabel = (m[2] ?? "").trim();
    return {
      sourceHandle: parsed.sh ?? undefined,
      targetHandle: parsed.th ?? undefined,
      userLabel: userLabel || undefined,
    };
  } catch {
    return { userLabel: note.trim() };
  }
}

export function userVisibleEdgeLabel(note: string | null | undefined): string | undefined {
  if (!note?.trim()) return undefined;
  const { userLabel } = parseEmbeddedHandles(note);
  return userLabel;
}
