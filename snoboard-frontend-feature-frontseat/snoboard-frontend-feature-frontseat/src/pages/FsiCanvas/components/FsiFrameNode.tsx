import { memo, useCallback, useEffect, useState } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { X } from "lucide-react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";

function FsiFrameNodeComponent({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const nodeData = data as FsiNodeData;
  const { fsiNode, canEdit, onTitleChange, onRemoveFrame } = nodeData;
  const payload = fsiNode.structured_payload ?? {};
  const width = Number(payload.frame_width) || 520;
  const height = Number(payload.frame_height) || 360;

  const [title, setTitle] = useState(fsiNode.display_title);

  useEffect(() => {
    setTitle(fsiNode.display_title);
  }, [fsiNode.display_title]);

  const commitTitle = useCallback(
    (next: string) => {
      setTitle(next);
      onTitleChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onTitleChange],
  );

  const selectFrame = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
  }, [id, setNodes]);

  const editing = selected && canEdit;

  return (
    <div
      className={`rounded-lg border-2 border-dashed bg-zinc-500/5 ${
        selected ? "border-zinc-400 ring-1 ring-zinc-400/40" : "border-zinc-500/50"
      }`}
      style={{ width, height, minWidth: 200, minHeight: 160 }}
    >
      <div
        className="group relative z-10 flex items-center gap-2 border-b border-dashed border-zinc-500/40 px-3 py-2"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, input")) return;
          selectFrame();
        }}
      >
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            className="nodrag nopan min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
            placeholder="Frame name"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-400">
            {title || "Frame"}
          </span>
        )}
        {canEdit && onRemoveFrame ? (
          <button
            type="button"
            title="Remove frame (keep nodes inside)"
            className="nodrag nopan flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-100 transition hover:bg-zinc-700/60 hover:text-zinc-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFrame(fsiNode.id);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(FsiFrameNodeComponent);
