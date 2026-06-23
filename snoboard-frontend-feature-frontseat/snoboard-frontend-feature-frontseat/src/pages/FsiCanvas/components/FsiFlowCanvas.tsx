import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
import FsiFieldNode from "./FsiFieldNode";
import type { FsiConnectionRecord, FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { graphToFlow, type FsiNodeData } from "../lib/fsiFlowAdapter";
import { isFieldNode, isParentNode } from "../lib/fsiHierarchy";

const nodeTypes = { fsiNode: FsiCanvasNode, fsiFieldNode: FsiFieldNode };

type FlowInnerProps = {
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
  canEdit: boolean;
  onNodeSelect: (node: FsiNodeRecord | null) => void;
  onPaneDoubleClick: (x: number, y: number, screenX: number, screenY: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onFieldChange: (nodeId: string, value: string) => void;
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
  onNodeDelete,
  onFieldChange,
  selectedNodeId,
}: FlowInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;

  const stableFieldChange = useCallback((nodeId: string, value: string) => {
    onFieldChangeRef.current(nodeId, value);
  }, []);

  const dbSignature = useMemo(
    () =>
      JSON.stringify({
        n: dbNodes.map((n) => ({
          id: n.id,
          pid: n.parent_node_id,
          x: n.canvas_x,
          y: n.canvas_y,
          t: n.display_title,
          type: n.node_type,
          p: n.structured_payload,
        })),
        c: connections.map((c) => ({ id: c.id, s: c.source_node_id, t: c.target_node_id })),
      }),
    [dbNodes, connections],
  );

  const flowGraph = useMemo(
    () =>
      graphToFlow(dbNodes, connections, {
        canEdit,
        onFieldChange: stableFieldChange,
      }),
    [dbSignature, canEdit, stableFieldChange],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowGraph.edges);

  useEffect(() => {
    setNodes(flowGraph.nodes);
    setEdges(flowGraph.edges);
  }, [flowGraph, setNodes, setEdges]);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      const sourceNode = dbNodes.find((n) => n.id === params.source);
      const targetNode = dbNodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode || isFieldNode(sourceNode) || isFieldNode(targetNode)) return;
      onConnect(params.source, params.target);
    },
    [canEdit, dbNodes, onConnect],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as FsiNodeData | { fsiNode: FsiNodeRecord };
      onNodeSelect(data.fsiNode);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect]);

  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canEdit) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPaneDoubleClick(pos.x, pos.y, e.clientX, e.clientY);
    },
    [canEdit, onPaneDoubleClick, screenToFlowPosition],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!canEdit) return;
      const data = node.data as FsiNodeData;
      if (isFieldNode(data.fsiNode)) return;
      onNodeDragStop(node.id, node.position.x, node.position.y);
    },
    [canEdit, onNodeDragStop],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!canEdit) return;
      deleted.forEach((edge) => {
        if (!edge.id.startsWith("tree-")) onEdgeDelete(edge.id);
      });
    },
    [canEdit, onEdgeDelete],
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!canEdit) return;
      deleted.forEach((node) => {
        const data = node.data as FsiNodeData;
        if (isParentNode(data.fsiNode)) onNodeDelete(node.id);
      });
    },
    [canEdit, onNodeDelete],
  );

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => {
        const fsiNode = (n.data as { fsiNode: FsiNodeRecord }).fsiNode;
        return {
          ...n,
          selected: n.id === selectedNodeId,
          connectable: isParentNode(fsiNode),
        };
      }),
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
      onPaneDoubleClick={handlePaneDoubleClick}
      onNodeDragStop={handleNodeDragStop}
      onEdgesDelete={handleEdgesDelete}
      onNodesDelete={handleNodesDelete}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
      defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#71717a", strokeWidth: 2 } }}
      className="bg-zinc-950 fsi-flow-canvas"
    >
      <Background id="fsi-grid-coarse" variant={BackgroundVariant.Dots} gap={48} size={3} color="#3f3f46" />
      <Background id="fsi-grid-fine" variant={BackgroundVariant.Dots} gap={24} size={2} color="#52525b" />
      <Controls className="!bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-white" />
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as FsiNodeData | undefined;
          return d?.color ?? "#22c55e";
        }}
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
