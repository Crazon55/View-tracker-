import { memo, useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";

function FsiCanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
  const { fsiNode, canEdit, isNote, fieldDefs, onTitleChange, onBodyChange, onPayloadChange } =
    nodeData;

  const [title, setTitle] = useState(fsiNode.display_title);
  const [body, setBody] = useState(fsiNode.raw_body_text ?? "");
  const payload = fsiNode.structured_payload ?? {};

  useEffect(() => {
    setTitle(fsiNode.display_title);
    setBody(fsiNode.raw_body_text ?? "");
  }, [fsiNode.display_title, fsiNode.raw_body_text]);

  const commitTitle = useCallback(
    (next: string) => {
      setTitle(next);
      onTitleChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onTitleChange],
  );

  const commitBody = useCallback(
    (next: string) => {
      setBody(next);
      onBodyChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onBodyChange],
  );

  const commitField = useCallback(
    (key: string, value: string) => {
      onPayloadChange?.(fsiNode.id, key, value);
    },
    [fsiNode.id, onPayloadChange],
  );

  const inputClass =
    "nodrag nopan w-full rounded border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-emerald-700 focus:outline-none";

  const expanded = selected && canEdit;
  const noteInputClass =
    "nodrag nopan w-full rounded-md border border-amber-900/30 bg-amber-950/25 px-2.5 py-2 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-amber-800 focus:outline-none";

  return (
    <div
      className={`min-w-[200px] max-w-[280px] rounded-md border-2 shadow-lg ${
        selected ? "ring-2 ring-white/50" : ""
      }`}
      style={{ borderColor: nodeData.color, backgroundColor: nodeData.color }}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-emerald-900 !bg-white" />

      {isNote ? (
        <>
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-950">Note</div>
          </div>
          <div className="px-3 pb-3">
            {expanded ? (
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={(e) => commitBody(e.target.value)}
                placeholder="post_id, views, url…"
                className={`${noteInputClass} resize-none`}
              />
            ) : (
              <div className={`${noteInputClass} min-h-[3rem] whitespace-pre-wrap`}>
                {body || "Empty note"}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-2.5">
            {expanded ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => commitTitle(e.target.value)}
                className={`${inputClass} mb-1 text-sm font-bold`}
              />
            ) : (
              <div className="text-sm font-bold leading-tight text-emerald-950">{title}</div>
            )}
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-950/70">
              {nodeData.nodeType}
            </div>
          </div>

          {expanded && fieldDefs.length > 0 && (
            <div className="max-h-48 space-y-2 overflow-y-auto border-t border-emerald-900/30 px-3 pb-3 pt-2">
              {fieldDefs.slice(0, 8).map((def) => {
                const val = String(payload[def.key] ?? "");
                return (
                  <div key={def.key}>
                    <label className="mb-0.5 block text-[9px] font-semibold uppercase text-emerald-950/60">
                      {def.label}
                    </label>
                    {def.inputType === "textarea" ? (
                      <textarea
                        rows={def.rows ?? 2}
                        value={val}
                        onChange={(e) => commitField(def.key, e.target.value)}
                        className={`${inputClass} resize-none`}
                      />
                    ) : def.inputType === "select" ? (
                      <select
                        value={val || "Average"}
                        onChange={(e) => commitField(def.key, e.target.value)}
                        className={inputClass}
                      >
                        {(def.selectOptions ?? PERFORMANCE_LABELS).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={def.inputType === "number" ? "number" : "text"}
                        value={val}
                        onChange={(e) => commitField(def.key, e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-emerald-900 !bg-white" />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
