export const COMPACT_NODE_WIDTH = 200;
export const COMPACT_NODE_HEIGHT = 80;
/** Collapsed accordion header height (Written Hook / Performance / Link). */
export const DROPDOWN_COLLAPSED_HEIGHT = 44;
export const LINK_NODE_WIDTH = COMPACT_NODE_WIDTH;
export const LINK_NODE_HEIGHT = COMPACT_NODE_HEIGHT;
export const DEFAULT_EXPANDED_WIDTH = 320;
export const DEFAULT_EXPANDED_HEIGHT = 240;

export function isNodeUiExpanded(payload: Record<string, unknown> | undefined): boolean {
  return payload?.ui_expanded === true;
}

export function nodeCardWidth(payload: Record<string, unknown> | undefined, expanded: boolean): number {
  if (!expanded) return COMPACT_NODE_WIDTH;
  const w = Number(payload?.card_width);
  return Number.isFinite(w) && w >= COMPACT_NODE_WIDTH ? w : DEFAULT_EXPANDED_WIDTH;
}

export function nodeCardHeight(payload: Record<string, unknown> | undefined, expanded: boolean): number {
  if (!expanded) return COMPACT_NODE_HEIGHT;
  const h = Number(payload?.card_height);
  return Number.isFinite(h) && h >= COMPACT_NODE_HEIGHT ? h : DEFAULT_EXPANDED_HEIGHT;
}

export function parseSlidesContent(payload: Record<string, unknown> | undefined): string[] {
  const raw = payload?.slides_content;
  if (Array.isArray(raw) && raw.length > 0) return raw.map((s) => String(s));
  return [""];
}

export const NODE_TYPE_LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-wide text-black";
/** Title/field chrome — draggable unless focused (focus adds nodrag in the node). */
export const NODE_FIELD_INPUT_CLASS =
  "nowheel rounded bg-transparent px-1.5 py-1 text-sm font-semibold leading-snug text-black caret-black outline-none placeholder:text-black/40 hover:bg-black/5 focus:bg-white focus:ring-2 focus:ring-sky-500";
export const NODE_TITLE_INPUT_CLASS = `mt-2.5 w-full ${NODE_FIELD_INPUT_CLASS}`;
export const NODE_TITLE_EMPTY_CLASS =
  "mt-2.5 px-1.5 py-1 text-sm font-semibold leading-snug text-black/40";
export const NODE_TITLE_DISPLAY_CLASS =
  "mt-2.5 px-1.5 py-1 text-sm font-semibold leading-snug text-black line-clamp-2";
export const NODE_TITLE_BOX_CLASS =
  "w-full rounded border border-black/15 bg-black/10 px-2 py-1.5 text-sm font-semibold leading-snug text-black";
export const NODE_BODY_BOX_CLASS =
  "w-full flex-1 resize-none rounded border border-black/15 bg-black/10 px-2 py-1.5 text-xs leading-relaxed text-black placeholder:text-black/40 focus:border-black/30 focus:outline-none";
export const NODE_FIELD_FOCUSED_DRAG_LOCK = "nodrag nopan";

/** True when the title is unset or still the legacy default (same as node type). */
export function isUnsetNodeTitle(title: string, nodeType: string): boolean {
  const trimmed = title.trim();
  return !trimmed || trimmed === nodeType;
}
