import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FsiCanvasNode from "./FsiCanvasNode";
import type { FsiConnectionRecord, FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { graphToFlow, type FsiNodeData } from "../lib/fsiFlowAdapter";

const nodeTypes = { fsiNode: FsiCanvasNode };

type FlowInnerProps = {
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
  canEdit: boolean;
  onNodeSelect: (node: FsiNodeRecord | null) => void;
  onPaneDoubleClick: (x: number, y: number, screenX: number, screenY: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  selectedNodeId: string | null;
};

function FlowInner({
  nodes: dbNodes,
  connections,
  canEdit,
  onNodeSelect,
  onPaneDoubleClick,
  onNodeDragStop,
  onConnect,
  onEdgeDelete,
  selectedNodeId,
}: FlowInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const initial = useMemo(() => graphToFlow(dbNodes, connections), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const dbSignature = useMemo(
    () =>
      JSON.stringify({
        n: dbNodes.map((n) => ({ id: n.id, x: n.canvas_x, y: n.canvas_y, u: n.updated_at, t: n.display_title })),
        c: connections.map((c) => c.id),
      }),
    [dbNodes, connections],
  );

  useEffect(() => {
    const next = graphToFlow(dbNodes, connections);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [dbSignature, dbNodes, connections, setNodes, setEdges]);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      onConnect(params.source, params.target);
    },
    [canEdit, onConnect],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<FsiNodeData>) => {
      onNodeSelect(node.data.fsiNode);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canEdit) return;
      const target = e.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPaneDoubleClick(pos.x, pos.y, e.clientX, e.clientY);
    },
    [canEdit, onPaneDoubleClick, screenToFlowPosition],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node<FsiNodeData>) => {
      if (!canEdit) return;
      onNodeDragStop(node.id, node.position.x, node.position.y);
    },
    [canEdit, onNodeDragStop],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!canEdit) return;
      deleted.forEach((edge) => onEdgeDelete(edge.id));
    },
    [canEdit, onEdgeDelete],
  );

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    [nodes, selectedNodeId],
  );

  return (
    <ReactFlow
      nodes={styledNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onDoubleClick={handleDoubleClick}
      onNodeDragStop={handleNodeDragStop}
      onEdgesDelete={handleEdgesDelete}
      nodeTypes={nodeTypes}
      fitView
      deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
      className="bg-zinc-950"
    >
      <Background gap={20} size={1} color="#27272a" />
      <Controls className="!bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-white" />
      <MiniMap
        nodeColor={(n) => (n.data as FsiNodeData)?.color ?? "#64748b"}
        maskColor="rgba(0,0,0,0.6)"
        className="!bg-zinc-900 !border-zinc-700"
      />
    </ReactFlow>
  );
}

type Props = Omit<FlowInnerProps, "onPaneDoubleClick"> & {
  onPaneDoubleClick: (x: number, y: number, screenX: number, screenY: number) => void;
};

export default function FsiFlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
