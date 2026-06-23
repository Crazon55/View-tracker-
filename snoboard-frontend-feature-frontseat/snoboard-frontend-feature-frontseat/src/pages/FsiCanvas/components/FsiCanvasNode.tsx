import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { previewLines } from "../lib/fsiFlowAdapter";

function FsiCanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
  const lines = previewLines(nodeData.fsiNode);

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-lg border bg-zinc-950/95 shadow-lg backdrop-blur ${
        selected ? "border-white ring-2 ring-white/30" : "border-zinc-700"
      }`}
      style={{ borderTopColor: nodeData.color, borderTopWidth: 3 }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-zinc-400" />
      <div className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">{nodeData.nodeType}</div>
        <div className="mt-0.5 text-sm font-semibold text-white leading-tight">{nodeData.label}</div>
        {lines.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {lines.slice(0, 3).map((line, i) => (
              <div key={i} className="text-xs text-zinc-400 truncate">{line}</div>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-zinc-400" />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
