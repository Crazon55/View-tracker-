import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  SelectionMode,
  ConnectionMode,
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
  useUpdateNodeInternals,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FsiCanvasNode from "./FsiCanvasNode";
import FsiCanvasEdge from "./FsiCanvasEdge";
import FsiMiroGrid from "./FsiMiroGrid";
import FsiFrameNode from "./FsiFrameNode";
import { FSI_WHITEBOARD_TOOL_MIME, type WhiteboardToolPayload } from "./FsiLeftToolbar";
import { paletteForCanvasTheme, type FsiCanvasTheme } from "../lib/fsiCanvasTheme";
import { cn } from "@/lib/utils";
import type { FsiConnectionRecord, FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { graphToFlow, type FsiNodeData } from "../lib/fsiFlowAdapter";
import { loadSavedViewport, saveViewport } from "../lib/fsiViewportStorage";
import {
  FSI_NODE_SUGGESTION_MIME,
  FSI_NOTE_SUGGESTION_MIME,
  type NodeSuggestionPayload,
  type NoteSuggestionPayload,
} from "./FsiNodeSuggestionsPanel";
import { clipboardImageFiles } from "../lib/fsiScreenshotNode";
import { isFrameNode } from "../lib/fsiWhiteboardTypes";
import { isSameConnectionEndpoints } from "../lib/fsiConnectionUtils";
import {
  clientPointFromConnectEvent,
  refineConnectionHandlesFromPointers,
} from "../lib/fsiConnectPointer";

const nodeTypes = { fsiNode: FsiCanvasNode, fsiFrame: FsiFrameNode };
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
  onPaneDoubleClick: (flowX: number, flowY: number, screenX: number, screenY: number) => void;
  onNodeDragStart: (nodeId: string, x: number, y: number) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onConnect: (
    source: string,
    target: string,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void;
  onEdgeDelete: (edgeId: string) => void;
  onEdgeLabelChange: (edgeId: string, label: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onSuggestionDrop: (payload: NodeSuggestionPayload, x: number, y: number) => void;
  onNoteDrop: (payload: NoteSuggestionPayload, x: number, y: number) => void;
  onScreenshotDrop: (files: File[], x: number, y: number) => void;
  onWhiteboardDrop?: (nodeType: string, x: number, y: number) => void;
  onTitleChange: (nodeId: string, title: string) => void;
  onBodyChange: (nodeId: string, body: string) => void;
  onPayloadChange: (nodeId: string, key: string, value: string) => void;
  onScreenshotsChange: (nodeId: string, screenshots: string[]) => void;
  canvasTheme?: FsiCanvasTheme;
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
    onEdgeLabelChange,
    onNodeDelete,
    onSuggestionDrop,
    onNoteDrop,
    onScreenshotDrop,
    onWhiteboardDrop,
    onTitleChange,
    onBodyChange,
    onPayloadChange,
    onScreenshotsChange,
    canvasTheme = "dark",
  },
  ref,
) {
  const themePalette = paletteForCanvasTheme(canvasTheme);
  const { screenToFlowPosition, fitView, setViewport, getViewport, setCenter, getNode } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const paneRef = useRef<HTMLDivElement>(null);
  const dropLockRef = useRef(false);
  const lastPointerRef = useRef({ x: 200, y: 200 });
  const viewportReadyRef = useRef(false);
  const saveViewportTimer = useRef<number | null>(null);
  const connectPointerRef = useRef<{
    start: XYPosition | null;
    end: XYPosition | null;
    sourceHandleId: string | null;
  }>({
    start: null,
    end: null,
    sourceHandleId: null,
  });

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

  const onEdgeLabelChangeRef = useRef(onEdgeLabelChange);
  onEdgeLabelChangeRef.current = onEdgeLabelChange;
  const stableEdgeLabelChange = useCallback((id: string, label: string) => {
    onEdgeLabelChangeRef.current(id, label);
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
        c: connections.map((c) => ({
          id: c.id,
          s: c.source_node_id,
          t: c.target_node_id,
          l: c.edge_label_note,
          sh: c.source_handle,
          th: c.target_handle,
        })),
      }),
    [dbNodes, connections],
  );

  const positionSignature = useMemo(
    () => dbNodes.map((n) => `${n.id}:${n.canvas_x}:${n.canvas_y}`).join("|"),
    [dbNodes],
  );

  const connectionSignature = useMemo(
    () =>
      connections
        .map(
          (c) =>
            `${c.id}:${c.source_node_id}:${c.target_node_id}:${c.edge_label_note ?? ""}:${c.source_handle ?? ""}:${c.target_handle ?? ""}`,
        )
        .join("|"),
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
        onEdgeLabelChange: stableEdgeLabelChange,
        onScreenshotsChange: stableScreenshotsChange,
      }),
    [structureSignature, positionSignature, canEdit, stableTitleChange, stableBodyChange, stablePayloadChange, stableEdgeDelete, stableEdgeLabelChange, stableScreenshotsChange],
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
  }, [connectionSignature, positionSignature, flowEdges, setEdges]);

  useEffect(() => {
    if (fitTrigger > 0) {
      requestAnimationFrame(() => {
        void fitView({ padding: 0.25, duration: 300 }).then(() => {
          persistViewport(getViewport());
        });
      });
    }
  }, [fitTrigger, fitView, getViewport, persistViewport]);

  useEffect(() => {
    for (const n of flowGraph.nodes) {
      updateNodeInternals(n.id);
    }
  }, [connectionSignature, structureSignature, flowGraph.nodes, updateNodeInternals]);

  const handleMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      schedulePersistViewport(viewport);
    },
    [schedulePersistViewport],
  );

  const getAbsoluteFlowPosition = useCallback(
    (node: Node) => {
      let x = node.position.x;
      let y = node.position.y;
      let parentId = node.parentId;
      while (parentId) {
        const parent = getNode(parentId);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        parentId = parent.parentId;
      }
      return { x, y };
    },
    [getNode],
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!canEdit || !params.source || !params.target) return;
      if (params.source === params.target) return;

      const sourceDb = dbNodes.find((n) => n.id === params.source);
      const targetDb = dbNodes.find((n) => n.id === params.target);
      if (!sourceDb || !targetDb) return;

      const sourceRf = getNode(params.source);
      const targetRf = getNode(params.target);
      const sourceAbs = sourceRf
        ? getAbsoluteFlowPosition(sourceRf)
        : { x: sourceDb.canvas_x ?? 0, y: sourceDb.canvas_y ?? 0 };
      const targetAbs = targetRf
        ? getAbsoluteFlowPosition(targetRf)
        : { x: targetDb.canvas_x ?? 0, y: targetDb.canvas_y ?? 0 };

      const { sourceHandle, targetHandle } = refineConnectionHandlesFromPointers({
        sourceDb,
        targetDb,
        sourceAbs,
        targetAbs,
        startPointer: connectPointerRef.current.start,
        endPointer: connectPointerRef.current.end ?? lastPointerRef.current,
        sourceHandleId: connectPointerRef.current.sourceHandleId ?? params.sourceHandle,
        targetHandleId: params.targetHandle,
      });
      connectPointerRef.current = { start: null, end: null, sourceHandleId: null };

      const endpoints = {
        source: params.source,
        target: params.target,
        sourceHandle,
        targetHandle,
      };
      setEdges((eds) => {
        if (eds.some((e) => isSameConnectionEndpoints(endpoints, e))) {
          return eds;
        }
        return addEdge(
          {
            ...params,
            sourceHandle,
            targetHandle,
            type: "fsiEdge",
            selectable: true,
            focusable: true,
            data: { canEdit, onDelete: stableEdgeDelete, onLabelChange: stableEdgeLabelChange },
          },
          eds,
        );
      });
      onConnect(params.source, params.target, sourceHandle, targetHandle);
    },
    [canEdit, dbNodes, getAbsoluteFlowPosition, getNode, onConnect, setEdges, stableEdgeDelete, stableEdgeLabelChange],
  );

  const handleConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: { handleId?: string | null }) => {
      const pt = clientPointFromConnectEvent(event);
      connectPointerRef.current = {
        start: screenToFlowPosition(pt),
        end: null,
        sourceHandleId: params.handleId ?? null,
      };
    },
    [screenToFlowPosition],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const pt = clientPointFromConnectEvent(event);
      connectPointerRef.current.end = screenToFlowPosition(pt);
    },
    [screenToFlowPosition],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!canEdit) return false;
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const sourceNode = dbNodes.find((n) => n.id === connection.source);
      const targetNode = dbNodes.find((n) => n.id === connection.target);
      if (sourceNode && isFrameNode(sourceNode)) return false;
      if (targetNode && isFrameNode(targetNode)) return false;
      return true;
    },
    [canEdit, dbNodes],
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
      onPaneDoubleClick(pos.x, pos.y, e.clientX, e.clientY);
    },
    [canEdit, clearEdgeSelection, onPaneClick, onPaneDoubleClick, onNodeSelect, screenToFlowPosition, setNodes],
  );

  const handleNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const abs = getAbsoluteFlowPosition(node);
      onNodeDragStart(node.id, abs.x, abs.y);
    },
    [getAbsoluteFlowPosition, onNodeDragStart],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!canEdit) return;
      const abs = getAbsoluteFlowPosition(node);
      onNodeDragStop(node.id, abs.x, abs.y);
    },
    [canEdit, getAbsoluteFlowPosition, onNodeDragStop],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(FSI_NODE_SUGGESTION_MIME) ||
      e.dataTransfer.types.includes(FSI_NOTE_SUGGESTION_MIME) ||
      e.dataTransfer.types.includes(FSI_WHITEBOARD_TOOL_MIME) ||
      Array.from(e.dataTransfer.types).includes("Files")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handlePaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      lastPointerRef.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    },
    [screenToFlowPosition],
  );

  const handlePanePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!canEdit) return;
      const files = clipboardImageFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      onScreenshotDrop(files, lastPointerRef.current.x, lastPointerRef.current.y);
    },
    [canEdit, onScreenshotDrop],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit || dropLockRef.current) return;

      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const droppedImages = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (droppedImages.length > 0) {
        onScreenshotDrop(droppedImages, pos.x, pos.y);
        return;
      }

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
      if (raw) {
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
        return;
      }

      const toolRaw = e.dataTransfer.getData(FSI_WHITEBOARD_TOOL_MIME);
      if (toolRaw && onWhiteboardDrop) {
        try {
          const payload = JSON.parse(toolRaw) as WhiteboardToolPayload;
          dropLockRef.current = true;
          onWhiteboardDrop(payload.nodeType, pos.x, pos.y);
          window.setTimeout(() => {
            dropLockRef.current = false;
          }, 600);
        } catch {
          /* ignore */
        }
      }
    },
    [canEdit, onNoteDrop, onScreenshotDrop, onSuggestionDrop, onWhiteboardDrop, screenToFlowPosition],
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
        connectable: canEdit,
        data: n.data as FsiNodeData,
      })),
    [nodes, selectedNodeId, multiSet, canEdit],
  );

  const miniMapNodeColor = useCallback((n: Node) => {
    const d = n.data as FsiNodeData | undefined;
    return d?.color ?? "#22c55e";
  }, []);

  return (
    <div
      ref={paneRef}
      className="relative h-full w-full overflow-hidden outline-none"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseMove={handlePaneMouseMove}
      onPaste={handlePanePaste}
    >
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Strict}
        connectOnClick={false}
        connectionRadius={12}
        nodesConnectable={canEdit}
        elementsSelectable={canEdit}
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
          data: { canEdit, onDelete: stableEdgeDelete, onLabelChange: stableEdgeLabelChange },
        }}
        minZoom={0.08}
        maxZoom={2.5}
        className={cn(themePalette.canvasBgClass, "fsi-flow-canvas")}
      >
        <FsiMiroGrid theme={canvasTheme} />
        <Controls className={themePalette.controlsClass} />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={2}
          maskColor={themePalette.minimapMask}
          style={{ width: 160, height: 120 }}
          className={themePalette.minimapClass}
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
