import { memo, useCallback, useEffect, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

export type FsiEdgeData = {
  canEdit?: boolean;
  labelNote?: string | null;
  onDelete?: (edgeId: string) => void;
  onLabelChange?: (edgeId: string, label: string) => void;
};

function FsiCanvasEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as FsiEdgeData;
  const canEdit = edgeData.canEdit ?? false;
  const onDelete = edgeData.onDelete;
  const onLabelChange = edgeData.onLabelChange;
  const [labelDraft, setLabelDraft] = useState(edgeData.labelNote ?? "");

  useEffect(() => {
    setLabelDraft(edgeData.labelNote ?? "");
  }, [edgeData.labelNote, id]);

  // Orthogonal (right-angle) routing like Miro — no diagonals, no bezier curves.
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
    offset: 16,
  });

  const commitLabel = useCallback(() => {
    const next = labelDraft.trim();
    const prev = (edgeData.labelNote ?? "").trim();
    if (next === prev) return;
    onLabelChange?.(id, next);
  }, [edgeData.labelNote, id, labelDraft, onLabelChange]);

  const displayLabel = (edgeData.labelNote ?? "").trim();

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={28}
        style={{
          stroke: selected ? "#d4d4d8" : "#a1a1aa",
          strokeWidth: selected ? 2.5 : 1.75,
        }}
      />
      {!selected && displayLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none rounded bg-zinc-900/90 px-1.5 py-0.5 text-[10px] text-zinc-400"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {canEdit && selected ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto flex flex-col items-center gap-1"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <input
              type="text"
              value={labelDraft}
              placeholder="Connection label"
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitLabel();
                  (e.target as HTMLInputElement).blur();
                }
                if ((e.key === "Backspace" || e.key === "Delete") && !labelDraft) {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete?.(id);
                }
              }}
              className="w-36 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg focus:border-emerald-600 focus:outline-none"
            />
            {onDelete ? (
              <button
                type="button"
                title="Delete connection"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
                className="flex items-center gap-1 rounded-md border border-red-900/60 bg-zinc-900 px-2 py-1 text-xs font-medium text-red-400 shadow-lg hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default memo(FsiCanvasEdgeComponent);
