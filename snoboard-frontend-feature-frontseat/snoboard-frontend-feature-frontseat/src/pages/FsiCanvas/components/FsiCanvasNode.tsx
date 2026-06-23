import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";

function FsiCanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-md border-2 border-emerald-600 bg-emerald-500 shadow-lg ${
        selected ? "ring-2 ring-white/50" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-emerald-800 !bg-white" />
      <div className="px-3 py-2.5 text-center">
        <div className="text-sm font-bold leading-tight text-emerald-950">{nodeData.label}</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900/70">
          {nodeData.nodeType}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-emerald-800 !bg-white" />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
