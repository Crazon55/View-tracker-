import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FsiNodeRecord, FsiStudy } from "../lib/fsiNodeSchemas";
import { colorForNodeType } from "../lib/fsiNodeSchemas";
import { getSuggestedNodeTypes } from "../lib/fsiStudyTemplates";
import { isNoteNode } from "../lib/fsiHierarchy";
import { NOTE_COLOR, NOTE_TEMPLATES } from "../lib/fsiNoteTemplates";

export const FSI_NODE_SUGGESTION_MIME = "application/fsi-node-suggestion";
export const FSI_NOTE_SUGGESTION_MIME = "application/fsi-note-suggestion";

export type NodeSuggestionPayload = {
  nodeType: string;
};

export type NoteSuggestionPayload = {
  noteKey: string;
};

type Props = {
  study: FsiStudy;
  canvasNodes: FsiNodeRecord[];
  focusedNodeId: string | null;
  canEdit: boolean;
  onAddSuggestion: (nodeType: string) => void;
  onAddNote: (noteKey: string) => void;
  onFocusNode: (node: FsiNodeRecord) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteSelected?: () => void;
  selectedCount?: number;
};

function startNodeDrag(e: React.DragEvent, nodeType: string) {
  const payload: NodeSuggestionPayload = { nodeType };
  e.dataTransfer.setData(FSI_NODE_SUGGESTION_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

function startNoteDrag(e: React.DragEvent, noteKey: string) {
  const payload: NoteSuggestionPayload = { noteKey };
  e.dataTransfer.setData(FSI_NOTE_SUGGESTION_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

function notePreview(node: FsiNodeRecord): string {
  const line = (node.raw_body_text || "Note").split("\n")[0];
  return line.length > 36 ? `${line.slice(0, 36)}…` : line;
}

export default function FsiNodeSuggestionsPanel({
  study,
  canvasNodes,
  focusedNodeId,
  canEdit,
  onAddSuggestion,
  onAddNote,
  onFocusNode,
  onDeleteNode,
  onDeleteSelected,
  selectedCount = 0,
}: Props) {
  const suggestions = getSuggestedNodeTypes(study.study_type).filter(
    (t) => t !== "Strategist Note",
  );
  const typedNodes = canvasNodes.filter((n) => !isNoteNode(n));
  const notes = canvasNodes.filter(isNoteNode);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Suggested nodes for
        </div>
        <div className="mt-0.5 text-sm font-semibold text-white">{study.study_type}</div>
        <div className="truncate text-xs text-zinc-500">{study.target_account}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <section>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Study nodes ({suggestions.length})
          </div>
          <p className="mb-2 text-[10px] text-zinc-600">Typed blocks — drag or use +.</p>
          <div className="space-y-2">
            {suggestions.map((nodeType) => (
              <div
                key={nodeType}
                draggable={canEdit}
                onDragStart={(e) => canEdit && startNodeDrag(e, nodeType)}
                className={`flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 ${
                  canEdit
                    ? "cursor-grab active:cursor-grabbing hover:border-emerald-600/50"
                    : "opacity-60"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForNodeType(nodeType) }}
                />
                <span className="min-w-0 flex-1 text-sm text-zinc-200">{nodeType}</span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-emerald-400 hover:text-emerald-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSuggestion(nodeType);
                    }}
                    title="Add at canvas center"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Quick notes ({NOTE_TEMPLATES.length})
          </div>
          <p className="mb-2 text-[10px] text-zinc-600">Post IDs, views, URLs — separate from study nodes.</p>
          <div className="space-y-2">
            {NOTE_TEMPLATES.map((t) => (
              <div
                key={t.key}
                draggable={canEdit}
                onDragStart={(e) => canEdit && startNoteDrag(e, t.key)}
                className={`flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 ${
                  canEdit
                    ? "cursor-grab active:cursor-grabbing hover:border-amber-600/50"
                    : "opacity-60"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: NOTE_COLOR }} />
                <span className="min-w-0 flex-1 text-sm text-zinc-200">{t.label}</span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-amber-400 hover:text-amber-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddNote(t.key);
                    }}
                    title="Add at canvas center"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        {canvasNodes.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                On canvas ({canvasNodes.length})
              </div>
              {canEdit && selectedCount > 1 && onDeleteSelected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                  onClick={onDeleteSelected}
                >
                  Delete {selectedCount}
                </Button>
              )}
            </div>
            <p className="mb-2 text-[10px] text-zinc-600">Click a row to jump to that item on the canvas.</p>

            {typedNodes.length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="text-[10px] font-medium uppercase text-zinc-600">Nodes</div>
                {typedNodes.map((node) => {
                  const isFocused = focusedNodeId === node.id;
                  return (
                    <div
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onFocusNode(node)}
                      onKeyDown={(e) => e.key === "Enter" && onFocusNode(node)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                        isFocused
                          ? "border-emerald-600/60 bg-emerald-950/30"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorForNodeType(node.node_type) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-200">{node.display_title}</div>
                        <div className="truncate text-[10px] text-zinc-500">{node.node_type}</div>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNode(node.id);
                          }}
                          title="Delete node"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {notes.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase text-zinc-600">Notes</div>
                {notes.map((node) => {
                  const isFocused = focusedNodeId === node.id;
                  return (
                    <div
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onFocusNode(node)}
                      onKeyDown={(e) => e.key === "Enter" && onFocusNode(node)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                        isFocused
                          ? "border-amber-600/60 bg-amber-950/30"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: NOTE_COLOR }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-200">{notePreview(node)}</div>
                        <div className="truncate text-[10px] text-zinc-500">Note</div>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNode(node.id);
                          }}
                          title="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
