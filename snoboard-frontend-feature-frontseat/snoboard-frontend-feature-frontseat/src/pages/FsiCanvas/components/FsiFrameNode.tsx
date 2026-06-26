import { memo, useCallback, useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";

function FsiFrameNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
  const { fsiNode, canEdit, onTitleChange } = nodeData;
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

  const editing = selected && canEdit;

  return (
    <div
      className={`rounded-lg border-2 border-dashed bg-zinc-500/5 ${
        selected ? "border-zinc-400 ring-1 ring-zinc-400/40" : "border-zinc-500/50"
      }`}
      style={{ width, height, minWidth: 200, minHeight: 160 }}
    >
      <div className="flex items-center gap-2 border-b border-dashed border-zinc-500/40 px-3 py-2">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            className="nodrag nopan w-full bg-transparent text-sm font-semibold text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
            placeholder="Frame name"
          />
        ) : (
          <span className="text-sm font-semibold text-zinc-400">{title || "Frame"}</span>
        )}
      </div>
    </div>
  );
}

export default memo(FsiFrameNodeComponent);
