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
import { FSI_FIELD_DRAG_MIME, type FieldDragPayload } from "./FsiPropertyPalette";

const nodeTypes = { fsiNode: FsiCanvasNode, fsiFieldNode: FsiFieldNode };

type FlowInnerProps = {
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
  canEdit: boolean;
  fitTrigger?: number;
  onNodeSelect: (node: FsiNodeRecord | null) => void;
  onParentSelect: (node: FsiNodeRecord) => void;
  onPaneDoubleClick: (x: number, y: number, screenX: number, screenY: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onFieldChange: (nodeId: string, value: string) => void;
  onFieldDrop: (field: FieldDragPayload) => void;
  selectedNodeId: string | null;
  activeParentId: string | null;
};

function FlowInner({
  nodes: dbNodes,
  connections,
  canEdit,
  fitTrigger = 0,
  onNodeSelect,
  onParentSelect,
  onPaneDoubleClick,
  onNodeDragStop,
  onConnect,
  onEdgeDelete,
  onNodeDelete,
  onFieldChange,
  onFieldDrop,
  selectedNodeId,
  activeParentId,
}: FlowInnerProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const onFieldChangeRef = useRef(onFieldChange);
  onFieldChangeRef.current = onFieldChange;
  const didInitialFit = useRef(false);

  const stableFieldChange = useCallback((nodeId: string, value: string) => {
    onFieldChangeRef.current(nodeId, value);
  }, []);

  const structureSignature = useMemo(
    () =>
      JSON.stringify({
        n: dbNodes.map((n) => ({
          id: n.id,
          pid: n.parent_node_id,
          t: n.display_title,
          type: n.node_type,
          p: n.structured_payload,
        })),
        c: connections.map((c) => ({ id: c.id, s: c.source_node_id, t: c.target_node_id })),
      }),
    [dbNodes, connections],
  );

  const positionSignature = useMemo(
    () => dbNodes.map((n) => `${n.id}:${n.canvas_x}:${n.canvas_y}`).join("|"),
    [dbNodes],
  );

  const flowGraph = useMemo(
    () =>
      graphToFlow(dbNodes, connections, {
        canEdit,
        onFieldChange: stableFieldChange,
        activeParentId,
      }),
    [structureSignature, positionSignature, canEdit, stableFieldChange, activeParentId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowGraph.edges);

  useEffect(() => {
    setNodes((current) =>
      flowGraph.nodes.map((next) => {
        const cur = current.find((c) => c.id === next.id);
        if (cur?.dragging) return cur;
        return next;
      }),
    );
    setEdges(flowGraph.edges);
  }, [flowGraph, setNodes, setEdges]);

  useEffect(() => {
    if (!didInitialFit.current && flowGraph.nodes.length > 0) {
      didInitialFit.current = true;
      requestAnimationFrame(() => fitView({ padding: 0.25, duration: 200 }));
    }
  }, [flowGraph.nodes.length, fitView]);

  useEffect(() => {
    if (fitTrigger > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.25, duration: 300 }));
    }
  }, [fitTrigger, fitView]);

  useEffect(() => {
    if (!activeParentId || flowGraph.nodes.length === 0) return;
    requestAnimationFrame(() =>
      fitView({
        nodes: flowGraph.nodes.map((n) => ({ id: n.id })),
        padding: 0.35,
        duration: 280,
      }),
    );
  }, [activeParentId, flowGraph.nodes.length, fitView]);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      const sourceNode = dbNodes.find((n) => n.id === params.source);
      const targetNode = dbNodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;
      if (isFieldNode(sourceNode) && isFieldNode(targetNode)) return;
      onConnect(params.source, params.target);
    },
    [canEdit, dbNodes, onConnect],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as FsiNodeData | { fsiNode: FsiNodeRecord };
      onNodeSelect(data.fsiNode);
      if (isParentNode(data.fsiNode)) onParentSelect(data.fsiNode);
    },
    [onNodeSelect, onParentSelect],
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
      onNodeDragStop(node.id, node.position.x, node.position.y);
    },
    [canEdit, onNodeDragStop],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(FSI_FIELD_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;
      const raw = e.dataTransfer.getData(FSI_FIELD_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      try {
        const field = JSON.parse(raw) as FieldDragPayload;
        onFieldDrop(field);
      } catch {
        /* ignore malformed drag payload */
      }
    },
    [canEdit, onFieldDrop, screenToFlowPosition],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!canEdit) return;
      deleted.forEach((edge) => onEdgeDelete(edge.id));
    },
    [canEdit, onEdgeDelete],
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!canEdit) return;
      deleted.forEach((node) => onNodeDelete(node.id));
    },
    [canEdit, onNodeDelete],
  );

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        connectable: true,
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
      onPaneDoubleClick={handlePaneDoubleClick}
      onNodeDragStop={handleNodeDragStop}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onEdgesDelete={handleEdgesDelete}
      onNodesDelete={handleNodesDelete}
      nodeTypes={nodeTypes}
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
