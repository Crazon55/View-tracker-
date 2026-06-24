import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type EdgeChange,
  type OnSelectionChangeFunc,
  type Viewport,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FsiCanvasNode from "./FsiCanvasNode";
import FsiCanvasEdge from "./FsiCanvasEdge";
import type { FsiConnectionRecord, FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { graphToFlow, type FsiNodeData } from "../lib/fsiFlowAdapter";
import { loadSavedViewport, saveViewport } from "../lib/fsiViewportStorage";
import {
  FSI_NODE_SUGGESTION_MIME,
  FSI_NOTE_SUGGESTION_MIME,
  type NodeSuggestionPayload,
  type NoteSuggestionPayload,
} from "./FsiNodeSuggestionsPanel";

const nodeTypes = { fsiNode: FsiCanvasNode };
const edgeTypes = { fsiEdge: FsiCanvasEdge };

export type FsiFlowCanvasHandle = {
  getViewportCenter: () => { x: number; y: number };
  focusNode: (nodeId: string) => void;
  fitAll: () => void;
};

type FlowInnerProps = {
  studyId: string;
  nodes: FsiNodeRecord[];
  connections: FsiConnectionRecord[];
  canEdit: boolean;
  fitTrigger?: number;
  selectedNodeId: string | null;
  boxSelectMode: boolean;
  multiSelectedIds: string[];
  onNodeSelect: (node: FsiNodeRecord | null) => void;
  onPaneClick?: () => void;
  onSelectionChange: OnSelectionChangeFunc;
  onPaneDoubleClick: (x: number, y: number) => void;
  onNodeDragStart: (nodeId: string, x: number, y: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onSuggestionDrop: (payload: NodeSuggestionPayload, x: number, y: number) => void;
  onNoteDrop: (payload: NoteSuggestionPayload, x: number, y: number) => void;
  onTitleChange: (nodeId: string, title: string) => void;
  onBodyChange: (nodeId: string, body: string) => void;
  onPayloadChange: (nodeId: string, key: string, value: string) => void;
  onScreenshotsChange: (nodeId: string, screenshots: string[]) => void;
};

const FlowInner = forwardRef<FsiFlowCanvasHandle, FlowInnerProps>(function FlowInner(
  {
    studyId,
    nodes: dbNodes,
    connections,
    canEdit,
    fitTrigger = 0,
    selectedNodeId,
    boxSelectMode,
    multiSelectedIds,
    onNodeSelect,
    onPaneClick,
    onSelectionChange,
    onPaneDoubleClick,
    onNodeDragStart,
    onNodeDragStop,
    onConnect,
    onEdgeDelete,
    onNodeDelete,
    onSuggestionDrop,
    onNoteDrop,
    onTitleChange,
    onBodyChange,
    onPayloadChange,
    onScreenshotsChange,
  },
  ref,
) {
  const { screenToFlowPosition, fitView, setViewport, getViewport, setCenter } = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);
  const dropLockRef = useRef(false);
  const viewportReadyRef = useRef(false);
  const saveViewportTimer = useRef<number | null>(null);

  const persistViewport = useCallback(
    (viewport: Viewport) => {
      saveViewport(studyId, { x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [studyId],
  );

  const schedulePersistViewport = useCallback(
    (viewport: Viewport) => {
      if (saveViewportTimer.current) window.clearTimeout(saveViewportTimer.current);
      saveViewportTimer.current = window.setTimeout(() => {
        persistViewport(viewport);
      }, 200);
    },
    [persistViewport],
  );

  const flowCenterFromViewport = useCallback(() => {
    const pane = paneRef.current?.querySelector(".react-flow__pane") as HTMLElement | null;
    if (!pane) return { x: 200, y: 200 };
    const { x, y, zoom } = getViewport();
    const rect = pane.getBoundingClientRect();
    return {
      x: (rect.width / 2 - x) / zoom,
      y: (rect.height / 2 - y) / zoom,
    };
  }, [getViewport]);

  useImperativeHandle(ref, () => ({
    getViewportCenter: () => flowCenterFromViewport(),
    focusNode: (nodeId: string) => {
      const target = dbNodes.find((n) => n.id === nodeId);
      if (!target) return;
      const cx = (target.canvas_x ?? 0) + 120;
      const cy = (target.canvas_y ?? 0) + 50;
      void setCenter(cx, cy, { zoom: getViewport().zoom, duration: 280 });
    },
    fitAll: () => {
      requestAnimationFrame(() => {
        void fitView({ padding: 0.25, duration: 300 }).then(() => {
          persistViewport(getViewport());
        });
      });
    },
  }));

  const savedViewport = useMemo(() => loadSavedViewport(studyId), [studyId]);

  useEffect(() => {
    if (viewportReadyRef.current) return;
    viewportReadyRef.current = true;

    requestAnimationFrame(() => {
      if (savedViewport) {
        void setViewport(savedViewport, { duration: 0 });
        return;
      }
      if (dbNodes.length > 0) {
        void fitView({ padding: 0.25, duration: 0 }).then(() => {
          persistViewport(getViewport());
        });
      }
    });
  }, [studyId, savedViewport, dbNodes.length, fitView, setViewport, getViewport, persistViewport]);

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

  const onScreenshotsChangeRef = useRef(onScreenshotsChange);
  onScreenshotsChangeRef.current = onScreenshotsChange;
  const stableScreenshotsChange = useCallback((id: string, screenshots: string[]) => {
    onScreenshotsChangeRef.current(id, screenshots);
  }, []);

  const onEdgeDeleteRef = useRef(onEdgeDelete);
  onEdgeDeleteRef.current = onEdgeDelete;
  const stableEdgeDelete = useCallback((id: string) => {
    onEdgeDeleteRef.current(id);
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

  const connectionSignature = useMemo(
    () => connections.map((c) => `${c.id}:${c.source_node_id}:${c.target_node_id}`).join("|"),
    [connections],
  );

  const flowGraph = useMemo(
    () =>
      graphToFlow(dbNodes, connections, {
        canEdit,
        onTitleChange: stableTitleChange,
        onBodyChange: stableBodyChange,
        onPayloadChange: stablePayloadChange,
        onEdgeDelete: stableEdgeDelete,
        onScreenshotsChange: stableScreenshotsChange,
      }),
    [structureSignature, positionSignature, canEdit, stableTitleChange, stableBodyChange, stablePayloadChange, stableEdgeDelete, stableScreenshotsChange],
  );

  const flowEdges = flowGraph.edges;

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes.filter((c) => c.type !== "remove"));
    },
    [onEdgesChange],
  );

  const multiSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  useEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return flowGraph.nodes.map((next) => {
        const cur = byId.get(next.id);
        if (cur?.dragging) return cur;
        if (
          cur &&
          cur.position.x === next.position.x &&
          cur.position.y === next.position.y &&
          cur.type === next.type
        ) {
          return { ...cur, data: next.data, selected: cur.selected };
        }
        return next;
      });
    });
  }, [structureSignature, positionSignature, flowGraph.nodes, setNodes]);

  useEffect(() => {
    setEdges((current) => {
      const byId = new Map(current.map((e) => [e.id, e]));
      return flowEdges.map((next) => {
        const cur = byId.get(next.id);
        if (cur) return { ...next, selected: cur.selected };
        return next;
      });
    });
  }, [connectionSignature, flowEdges, setEdges]);

  useEffect(() => {
    if (fitTrigger > 0) {
      requestAnimationFrame(() => {
        void fitView({ padding: 0.25, duration: 300 }).then(() => {
          persistViewport(getViewport());
        });
      });
    }
  }, [fitTrigger, fitView, getViewport, persistViewport]);

  const handleMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      schedulePersistViewport(viewport);
    },
    [schedulePersistViewport],
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      setEdges((eds) => {
        if (eds.some((e) => e.source === params.source && e.target === params.target)) {
          return eds;
        }
        return addEdge(
          {
            ...params,
            type: "fsiEdge",
            selectable: true,
            focusable: true,
            data: { canEdit, onDelete: stableEdgeDelete },
          },
          eds,
        );
      });
      onConnect(params.source, params.target);
    },
    [canEdit, onConnect, setEdges, stableEdgeDelete],
  );

  const clearEdgeSelection = useCallback(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      clearEdgeSelection();
      const data = node.data as FsiNodeData;
      onNodeSelect(data.fsiNode);
    },
    [clearEdgeSelection, onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
    onPaneClick?.();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    clearEdgeSelection();
  }, [onNodeSelect, onPaneClick, setNodes, clearEdgeSelection]);

  const handlePaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      onNodeSelect(null);
      onPaneClick?.();
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
      clearEdgeSelection();
      if (!canEdit) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPaneDoubleClick(pos.x, pos.y);
    },
    [canEdit, clearEdgeSelection, onPaneClick, onPaneDoubleClick, onNodeSelect, screenToFlowPosition, setNodes],
  );

  const handleNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeDragStart(node.id, node.position.x, node.position.y);
    },
    [onNodeDragStart],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!canEdit) return;
      onNodeDragStop(node.id, node.position.x, node.position.y);
    },
    [canEdit, onNodeDragStop],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(FSI_NODE_SUGGESTION_MIME) ||
      e.dataTransfer.types.includes(FSI_NOTE_SUGGESTION_MIME)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit || dropLockRef.current) return;

      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const noteRaw = e.dataTransfer.getData(FSI_NOTE_SUGGESTION_MIME);
      if (noteRaw) {
        try {
          const payload = JSON.parse(noteRaw) as NoteSuggestionPayload;
          dropLockRef.current = true;
          onNoteDrop(payload, pos.x, pos.y);
          window.setTimeout(() => {
            dropLockRef.current = false;
          }, 600);
        } catch {
          /* ignore */
        }
        return;
      }

      const raw = e.dataTransfer.getData(FSI_NODE_SUGGESTION_MIME);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as NodeSuggestionPayload;
        dropLockRef.current = true;
        onSuggestionDrop(payload, pos.x, pos.y);
        window.setTimeout(() => {
          dropLockRef.current = false;
        }, 600);
      } catch {
        /* ignore */
      }
    },
    [canEdit, onNoteDrop, onSuggestionDrop, screenToFlowPosition],
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, _edge: Edge) => {
      onNodeSelect(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    },
    [onNodeSelect, setNodes],
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

  const miniMapNodeColor = useCallback((n: Node) => {
    const d = n.data as FsiNodeData | undefined;
    return d?.color ?? "#22c55e";
  }, []);

  return (
    <div ref={paneRef} className="relative h-full w-full overflow-hidden" onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onPaneDoubleClick={handlePaneDoubleClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onDragOver={handleDragOver}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        edgesFocusable
        selectionOnDrag={boxSelectMode}
        panOnDrag={boxSelectMode ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        defaultEdgeOptions={{
          type: "fsiEdge",
          selectable: true,
          focusable: true,
          data: { canEdit, onDelete: stableEdgeDelete },
        }}
        minZoom={0.08}
        maxZoom={2.5}
        className="bg-zinc-950 fsi-flow-canvas"
      >
        <Background id="fsi-grid-coarse" variant={BackgroundVariant.Dots} gap={48} size={3} color="#3f3f46" />
        <Background id="fsi-grid-fine" variant={BackgroundVariant.Dots} gap={24} size={2} color="#52525b" />
        <Controls className="!z-20 !bg-zinc-900 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-white" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={2}
          maskColor="rgba(0,0,0,0.55)"
          style={{ width: 160, height: 120 }}
          className="!z-20 !rounded-md !border !border-zinc-600 !bg-zinc-900/95 !shadow-lg"
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
