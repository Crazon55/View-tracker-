import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

export type FsiEdgeData = {
  canEdit?: boolean;
  onDelete?: (edgeId: string) => void;
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

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={24}
        style={{
          stroke: selected ? "#d4d4d8" : "#71717a",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      {canEdit && selected && onDelete ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
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
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default memo(FsiCanvasEdgeComponent);
