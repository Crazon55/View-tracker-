import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type OnSelectionChangeFunc,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FsiCanvasNode from "./FsiCanvasNode";
import type { FsiConnectionRecord, FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { graphToFlow, type FsiNodeData } from "../lib/fsiFlowAdapter";
import {
  FSI_NODE_SUGGESTION_MIME,
  type NodeSuggestionPayload,
} from "./FsiNodeSuggestionsPanel";

const nodeTypes = { fsiNode: FsiCanvasNode };

export type FsiFlowCanvasHandle = {
  getViewportCenter: () => { x: number; y: number };
  focusNode: (nodeId: string) => void;
};

type FlowInnerProps = {
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
  canEdit: boolean;
  fitTrigger?: number;
  focusNodeId?: string | null;
  selectedNodeId: string | null;
  boxSelectMode: boolean;
  multiSelectedIds: string[];
  onNodeSelect: (node: FsiNodeRecord | null) => void;
  onPaneClick?: () => void;
  onSelectionChange: OnSelectionChangeFunc;
  onPaneDoubleClick: (x: number, y: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onSuggestionDrop: (payload: NodeSuggestionPayload, x: number, y: number) => void;
  onTitleChange: (nodeId: string, title: string) => void;
  onBodyChange: (nodeId: string, body: string) => void;
  onPayloadChange: (nodeId: string, key: string, value: string) => void;
};

const FlowInner = forwardRef<FsiFlowCanvasHandle, FlowInnerProps>(function FlowInner(
  {
    nodes: dbNodes,
    connections,
    canEdit,
    fitTrigger = 0,
    focusNodeId,
    selectedNodeId,
    boxSelectMode,
    multiSelectedIds,
    onNodeSelect,
    onPaneClick,
    onSelectionChange,
    onPaneDoubleClick,
    onNodeDragStop,
    onConnect,
    onEdgeDelete,
    onNodeDelete,
    onSuggestionDrop,
    onTitleChange,
    onBodyChange,
    onPayloadChange,
  },
  ref,
) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);
  const didInitialFit = useRef(false);

  useImperativeHandle(ref, () => ({
    getViewportCenter: () => {
      const el = paneRef.current;
      if (!el) return { x: 200, y: 200 };
      const rect = el.getBoundingClientRect();
      return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    },
    focusNode: (nodeId: string) => {
      requestAnimationFrame(() =>
        fitView({ nodes: [{ id: nodeId }], padding: 0.55, duration: 350, maxZoom: 1.4 }),
      );
    },
  }));

  const onTitleChangeRef = useRef(onTitleChange);
  const onBodyChangeRef = useRef(onBodyChange);
  const onPayloadChangeRef = useRef(onPayloadChange);
  onTitleChangeRef.current = onTitleChange;
  onBodyChangeRef.current = onBodyChange;
  onPayloadChangeRef.current = onPayloadChange;

  const stableTitleChange = useCallback((id: string, t: string) => {
    onTitleChangeRef.current(id, t);
  }, []);
  const stableBodyChange = useCallback((id: string, b: string) => {
    onBodyChangeRef.current(id, b);
  }, []);
  const stablePayloadChange = useCallback((id: string, k: string, v: string) => {
    onPayloadChangeRef.current(id, k, v);
  }, []);

  const structureSignature = useMemo(
    () =>
      JSON.stringify({
        n: dbNodes.map((n) => ({
          id: n.id,
          t: n.display_title,
          type: n.node_type,
          p: n.structured_payload,
          b: n.raw_body_text,
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
        onTitleChange: stableTitleChange,
        onBodyChange: stableBodyChange,
        onPayloadChange: stablePayloadChange,
      }),
    [structureSignature, positionSignature, canEdit, stableTitleChange, stableBodyChange, stablePayloadChange],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowGraph.edges);

  const multiSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

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
    if (!focusNodeId) return;
    requestAnimationFrame(() =>
      fitView({ nodes: [{ id: focusNodeId }], padding: 0.55, duration: 350, maxZoom: 1.4 }),
    );
  }, [focusNodeId, fitView]);

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      onConnect(params.source, params.target);
    },
    [canEdit, onConnect],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as FsiNodeData;
      onNodeSelect(data.fsiNode);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
    onPaneClick?.();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
  }, [onNodeSelect, onPaneClick, setNodes]);

  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      onNodeSelect(null);
      onPaneClick?.();
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      if (!canEdit) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPaneDoubleClick(pos.x, pos.y);
    },
    [canEdit, onPaneClick, onPaneDoubleClick, onNodeSelect, screenToFlowPosition, setNodes],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!canEdit) return;
      onNodeDragStop(node.id, node.position.x, node.position.y);
    },
    [canEdit, onNodeDragStop],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(FSI_NODE_SUGGESTION_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit) return;
      const raw = e.dataTransfer.getData(FSI_NODE_SUGGESTION_MIME);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const payload = JSON.parse(raw) as NodeSuggestionPayload;
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        onSuggestionDrop(payload, pos.x, pos.y);
      } catch {
        /* ignore */
      }
    },
    [canEdit, onSuggestionDrop, screenToFlowPosition],
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
        selected: n.id === selectedNodeId || multiSet.has(n.id),
        connectable: true,
      })),
    [nodes, selectedNodeId, multiSet],
  );

  return (
    <div ref={paneRef} className="h-full w-full" onDragOver={handleDragOver}>
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
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        selectionOnDrag={boxSelectMode}
        panOnDrag={boxSelectMode ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
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
    </div>
  );
});

type FsiFlowCanvasProps = Omit<FlowInnerProps, "onSelectionChange"> & {
  onSelectionChange?: OnSelectionChangeFunc;
};

const FsiFlowCanvas = forwardRef<FsiFlowCanvasHandle, FsiFlowCanvasProps>(function FsiFlowCanvas(
  { onSelectionChange, ...props },
  ref,
) {
  const noopSelection: OnSelectionChangeFunc = useCallback(() => {}, []);
  return (
    <ReactFlowProvider>
      <FlowInner ref={ref} {...props} onSelectionChange={onSelectionChange ?? noopSelection} />
    </ReactFlowProvider>
  );
});

export default FsiFlowCanvas;
