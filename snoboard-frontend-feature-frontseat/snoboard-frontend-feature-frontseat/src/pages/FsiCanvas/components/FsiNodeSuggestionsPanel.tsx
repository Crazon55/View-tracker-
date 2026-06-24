import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FsiNodeRecord, FsiStudy } from "../lib/fsiNodeSchemas";
import { colorForNodeType } from "../lib/fsiNodeSchemas";
import { getSuggestedNodeTypes } from "../lib/fsiStudyTemplates";

export const FSI_NODE_SUGGESTION_MIME = "application/fsi-node-suggestion";

export type NodeSuggestionPayload = {
  nodeType: string;
};

type Props = {
  study: FsiStudy;
  canvasNodes: FsiNodeRecord[];
  canEdit: boolean;
  onAddSuggestion: (nodeType: string) => void;
  onDeleteNode: (nodeId: string) => void;
};

function startSuggestionDrag(e: React.DragEvent, nodeType: string) {
  const payload: NodeSuggestionPayload = { nodeType };
  e.dataTransfer.setData(FSI_NODE_SUGGESTION_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

export default function FsiNodeSuggestionsPanel({
  study,
  canvasNodes,
  canEdit,
  onAddSuggestion,
  onDeleteNode,
}: Props) {
  const suggestions = getSuggestedNodeTypes(study.study_type);

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
            Drag onto canvas
          </div>
          <div className="space-y-2">
            {suggestions.map((nodeType) => (
              <div
                key={nodeType}
                draggable={canEdit}
                onDragStart={(e) => canEdit && startSuggestionDrag(e, nodeType)}
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
                    onClick={() => onAddSuggestion(nodeType)}
                    title="Add to canvas"
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
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              On canvas ({canvasNodes.length})
            </div>
            <div className="space-y-2">
              {canvasNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
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
                      onClick={() => onDeleteNode(node.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
