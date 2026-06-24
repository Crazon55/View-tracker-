import { memo, useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";
import type { FsiFieldNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { FSI_PLACED_FIELD_DRAG_MIME } from "./FsiPropertyPalette";

function FsiFieldNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiFieldNodeData;
  const { fieldDef, value, canEdit, onFieldChange } = nodeData;
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = useCallback(
    (next: string) => {
      setLocal(next);
      onFieldChange?.(nodeData.fsiNode.id, next);
    },
    [nodeData.fsiNode.id, onFieldChange],
  );

  const onGripDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;
      e.stopPropagation();
      e.dataTransfer.setData(
        FSI_PLACED_FIELD_DRAG_MIME,
        JSON.stringify({ nodeId: nodeData.fsiNode.id, label: fieldDef.label }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [canEdit, nodeData.fsiNode.id, fieldDef.label],
  );

  const inputClass =
    "nodrag nopan w-full rounded border border-emerald-900/50 bg-emerald-950/40 px-2 py-1 text-xs text-white placeholder:text-emerald-200/40 focus:border-emerald-500/60 focus:outline-none";

  return (
    <div
      className={`min-w-[200px] max-w-[220px] rounded-md border-2 bg-emerald-500 shadow-md ${
        selected ? "ring-2 ring-white/40" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-emerald-800 !bg-white" />
      <div className="flex items-center gap-1.5 border-b border-emerald-600/40 px-2 py-1.5">
        {canEdit && (
          <span
            draggable
            onDragStart={onGripDragStart}
            className="cursor-grab text-emerald-950/50 hover:text-emerald-950/80"
            title="Drag back to inspector to remove"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-950/80">
          {fieldDef.label}
        </div>
      </div>
      <div className="px-2.5 py-2">
        {fieldDef.inputType === "textarea" ? (
          <textarea
            rows={fieldDef.rows ?? 2}
            value={local}
            disabled={!canEdit}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder="…"
            className={`${inputClass} mt-1 resize-none`}
          />
        ) : fieldDef.inputType === "select" ? (
          <select
            value={local || "Average"}
            disabled={!canEdit}
            onChange={(e) => commit(e.target.value)}
            className={`${inputClass} mt-1`}
          >
            {(fieldDef.selectOptions ?? PERFORMANCE_LABELS).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={fieldDef.inputType === "number" ? "number" : "text"}
            value={local}
            disabled={!canEdit}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder="…"
            className={`${inputClass} mt-1`}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-emerald-800 !bg-white" />
    </div>
  );
}

export default memo(FsiFieldNodeComponent);
