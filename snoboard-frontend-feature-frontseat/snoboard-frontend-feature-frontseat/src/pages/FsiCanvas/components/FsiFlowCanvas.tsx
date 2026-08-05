import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  SelectionMode,
  PanOnScrollMode,
  ConnectionMode,
  ConnectionLineType,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeFunc,
  type Viewport,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import FsiCanvasNode from "./FsiCanvasNode";
import FsiCanvasEdge, { FsiConnectionLine } from "./FsiCanvasEdge";
import FsiMiroGrid from "./FsiMiroGrid";
import FsiFrameNode from "./FsiFrameNode";
import FsiSnapGuides from "./FsiSnapGuides";
import { computeSnapGuides, type SnapBox, type SnapLine } from "../lib/fsiSnapGuides";
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
import { boundsFromExtents, estimateNodeSize } from "../lib/fsiNodeBounds";
import { isSameConnectionEndpoints } from "../lib/fsiConnectionUtils";
import { findConnectTargetAtPointer } from "../lib/fsiConnectHitTest";
import {
  anchorHandlesFromConnection,
  clientPointFromConnectEvent,
} from "../lib/fsiConnectPointer";

const nodeTypes = { fsiNode: FsiCanvasNode, fsiFrame: FsiFrameNode };
const edgeTypes = { fsiEdge: FsiCanvasEdge };

const CANVAS_MIN_ZOOM = 0.08;
const CANVAS_MAX_ZOOM = 2.5;

/** Screen-space snap catch radius; divided by zoom so it feels the same at any zoom level. */
const SNAP_THRESHOLD_PX = 6;

/**
 * Physical mouse wheels report large, integer, single-axis deltas per notch;
 * trackpads report small/fractional deltas (and often move both axes at once)
 * as fingers glide. This tells the two apart so a bare mouse scroll can zoom
 * while a bare trackpad scroll keeps panning (panOnScroll handles that case).
 */
function isMouseWheelNotch(event: WheelEvent): boolean {
  if (event.deltaX !== 0) return false;
  if (event.deltaMode === 1) return true; // Firefox reports physical wheels in "line" units
  return Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 40;
}

export type FsiFlowCanvasHandle = {
  getViewportCenter: () => { x: number; y: number };
  focusNode: (nodeId: string) => void;
  fitAll: () => void;
  /** Move keyboard focus to the canvas pane (Backspace/Delete shortcuts). */
  focusCanvas: () => void;
  /** Select every canvas node (not frames). */
  selectAllNodes: () => void;
  /** Select specific nodes (clears prior selection). Retries until ids appear in flow. */
  selectNodeIds: (nodeIds: string[]) => void;
  /** Bounding box that covers all listed nodes using measured canvas sizes. */
  getBoundsForNodeIds: (nodeIds: string[]) => ReturnType<typeof boundsFromExtents> | null;
  /** Node ids currently selected on the canvas (live React Flow state). */
  getSelectedNodeIds: () => string[];
  /** Edge ids currently selected on the canvas. */
  getSelectedEdgeIds: () => string[];
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
  /** Absolute canvas positions for every node moved in this drag (multi-select aware). */
  onNodeDragStart: (moves: Array<{ id: string; x: number; y: number }>) => void;
  onNodeDragStop: (moves: Array<{ id: string; x: number; y: number }>) => void;
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
  onStructuredPayloadPatch: (nodeId: string, patch: Record<string, unknown>) => void;
  onScreenshotsChange: (nodeId: string, screenshots: string[]) => void;
  onRequestDuplicate?: (
    nodeId: string,
    corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  ) => void;
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
    onStructuredPayloadPatch,
    onScreenshotsChange,
    onRequestDuplicate,
    canvasTheme = "dark",
  },
  ref,
) {
  const themePalette = paletteForCanvasTheme(canvasTheme);
  const { screenToFlowPosition, fitView, setViewport, getViewport, setCenter, getNode, getNodes, getEdges } =
    useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const paneRef = useRef<HTMLDivElement>(null);
  const dropLockRef = useRef(false);
  const lastPointerRef = useRef({ x: 200, y: 200 });
  const viewportReadyRef = useRef(false);
  const saveViewportTimer = useRef<number | null>(null);
  const connectPointerRef = useRef<{
    sourceHandleId: string | null;
    startPointer: XYPosition | null;
    endPointer: XYPosition | null;
  }>({ sourceHandleId: null, startPointer: null, endPointer: null });
  const connectingRef = useRef(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const connectCompletedRef = useRef(false);
  const dragPositionLockRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** Select these ids once they appear in the flow (avoids rAF races with first drag). */
  const pendingSelectIdsRef = useRef<string[] | null>(null);
  const lastDragPersistAtRef = useRef(0);

  function positionsNearlyEqual(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  }

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
  const onStructuredPayloadPatchRef = useRef(onStructuredPayloadPatch);
  onTitleChangeRef.current = onTitleChange;
  onBodyChangeRef.current = onBodyChange;
  onPayloadChangeRef.current = onPayloadChange;
  onStructuredPayloadPatchRef.current = onStructuredPayloadPatch;

  const stableTitleChange = useCallback((id: string, t: string) => {
    onTitleChangeRef.current(id, t);
  }, []);
  const stableBodyChange = useCallback((id: string, b: string) => {
    onBodyChangeRef.current(id, b);
  }, []);
  const stablePayloadChange = useCallback((id: string, k: string, v: string) => {
    onPayloadChangeRef.current(id, k, v);
  }, []);
  const stableStructuredPayloadPatch = useCallback((id: string, patch: Record<string, unknown>) => {
    onStructuredPayloadPatchRef.current(id, patch);
  }, []);

  const onScreenshotsChangeRef = useRef(onScreenshotsChange);
  onScreenshotsChangeRef.current = onScreenshotsChange;
  const stableScreenshotsChange = useCallback((id: string, screenshots: string[]) => {
    onScreenshotsChangeRef.current(id, screenshots);
  }, []);

  const onRequestDuplicateRef = useRef(onRequestDuplicate);
  onRequestDuplicateRef.current = onRequestDuplicate;
  const stableRequestDuplicate = useCallback(
    (id: string, corner: "top-left" | "top-right" | "bottom-left" | "bottom-right") => {
      onRequestDuplicateRef.current?.(id, corner);
    },
    [],
  );

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
          parent: n.parent_node_id,
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
        onStructuredPayloadPatch: stableStructuredPayloadPatch,
        onEdgeDelete: stableEdgeDelete,
        onEdgeLabelChange: stableEdgeLabelChange,
        onScreenshotsChange: stableScreenshotsChange,
        onRequestDuplicate: stableRequestDuplicate,
      }),
    [structureSignature, positionSignature, canEdit, stableTitleChange, stableBodyChange, stablePayloadChange, stableStructuredPayloadPatch, stableEdgeDelete, stableEdgeLabelChange, stableScreenshotsChange, stableRequestDuplicate],
  );

  const flowEdges = flowGraph.edges;

  const [nodes, setNodes, onNodesChange] = useNodesState(flowGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      if (!changes.some((change) => change.type === "select")) return;
      queueMicrotask(() => {
        const selectedNodes = getNodes().filter(
          (node) => node.selected && node.type !== "fsiFrame",
        );
        const selectedEdges = getEdges().filter((edge) => edge.selected);
        onSelectionChange({ nodes: selectedNodes, edges: selectedEdges });
      });
    },
    [getEdges, getNodes, onNodesChange, onSelectionChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes.filter((c) => c.type !== "remove"));
    },
    [onEdgesChange],
  );

  useEffect(() => {
    const pendingSnapshot = pendingSelectIdsRef.current;
    const willSelect =
      !!pendingSnapshot &&
      pendingSnapshot.length > 0 &&
      pendingSnapshot.every((id) => flowGraph.nodes.some((n) => n.id === id));
    const pendingSet = willSelect ? new Set(pendingSnapshot!) : null;
    if (pendingSet) pendingSelectIdsRef.current = null;

    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return flowGraph.nodes.map((next) => {
        const cur = byId.get(next.id);
        if (cur?.dragging) return cur;
        const locked = dragPositionLockRef.current.get(next.id);
        const selected = pendingSet
          ? pendingSet.has(next.id) && next.type !== "fsiFrame"
          : (cur?.selected ?? false);
        if (locked && cur) {
          return { ...next, position: locked, data: next.data, selected };
        }
        if (
          cur &&
          positionsNearlyEqual(cur.position, next.position) &&
          cur.type === next.type &&
          cur.parentId === next.parentId
        ) {
          return { ...cur, data: next.data, selected };
        }
        return { ...next, selected };
      });
    });

    if (willSelect && pendingSnapshot) {
      queueMicrotask(() => {
        const idSet = new Set(pendingSnapshot);
        const selectedNodes = getNodes().filter((n) => idSet.has(n.id) && n.type !== "fsiFrame");
        if (selectedNodes.length > 0) {
          onSelectionChange({ nodes: selectedNodes, edges: [] });
          paneRef.current?.focus();
        }
      });
    }
  }, [structureSignature, positionSignature, flowGraph.nodes, setNodes, getNodes, onSelectionChange]);

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

  useImperativeHandle(
    ref,
    () => ({
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
      focusCanvas: () => {
        paneRef.current?.focus();
      },
      selectAllNodes: () => {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.type !== "fsiFrame",
          })),
        );
        queueMicrotask(() => {
          const selectedNodes = getNodes().filter((n) => n.selected && n.type !== "fsiFrame");
          onSelectionChange({ nodes: selectedNodes, edges: [] });
        });
      },
      selectNodeIds: (nodeIds: string[]) => {
        if (nodeIds.length === 0) return;
        pendingSelectIdsRef.current = nodeIds;
        const idSet = new Set(nodeIds);
        const current = getNodes();
        const allPresent = nodeIds.every((id) => current.some((n) => n.id === id));
        if (!allPresent) return;

        pendingSelectIdsRef.current = null;
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: idSet.has(n.id) && n.type !== "fsiFrame",
          })),
        );
        queueMicrotask(() => {
          const selectedNodes = getNodes().filter((n) => idSet.has(n.id) && n.type !== "fsiFrame");
          onSelectionChange({ nodes: selectedNodes, edges: [] });
          paneRef.current?.focus();
        });
      },
      getBoundsForNodeIds: (nodeIds: string[]) => {
        if (nodeIds.length === 0) return null;
        const dbById = new Map(dbNodes.map((n) => [n.id, n]));
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let count = 0;

        for (const id of nodeIds) {
          const dbNode = dbById.get(id);
          if (!dbNode || isFrameNode(dbNode)) continue;
          const flowNode = getNodes().find((n) => n.id === id);
          const abs = flowNode
            ? getAbsoluteFlowPosition(flowNode)
            : { x: dbNode.canvas_x ?? 0, y: dbNode.canvas_y ?? 0 };
          const estimated = estimateNodeSize(dbNode);
          const w = flowNode?.measured?.width ?? flowNode?.width ?? estimated.width;
          const h = flowNode?.measured?.height ?? flowNode?.height ?? estimated.height;
          minX = Math.min(minX, abs.x);
          minY = Math.min(minY, abs.y);
          maxX = Math.max(maxX, abs.x + w);
          maxY = Math.max(maxY, abs.y + h);
          count++;
        }

        if (count === 0) return null;
        return boundsFromExtents(minX, minY, maxX, maxY);
      },
      getSelectedNodeIds: () => {
        const fromFlow = getNodes()
          .filter((node) => node.selected && node.type !== "fsiFrame")
          .map((node) => node.id);
        if (fromFlow.length > 0) return fromFlow;
        if (multiSelectedIds.length > 0) {
          return multiSelectedIds.filter((id) => {
            const dbNode = dbNodes.find((n) => n.id === id);
            return dbNode && !isFrameNode(dbNode);
          });
        }
        if (selectedNodeId) {
          const dbNode = dbNodes.find((n) => n.id === selectedNodeId);
          if (dbNode && !isFrameNode(dbNode)) return [selectedNodeId];
        }
        return [];
      },
      getSelectedEdgeIds: () =>
        getEdges()
          .filter((edge) => edge.selected)
          .map((edge) => edge.id),
    }),
    [
      dbNodes,
      fitView,
      flowCenterFromViewport,
      getAbsoluteFlowPosition,
      getEdges,
      getNodes,
      getViewport,
      multiSelectedIds,
      persistViewport,
      selectedNodeId,
      setCenter,
      setNodes,
      onSelectionChange,
    ],
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

  const finalizeConnection = useCallback(
    (sourceId: string, targetId: string, sourceHandleId: string | null, targetHandleId: string | null) => {
      if (!canEdit || !sourceId || !targetId || sourceId === targetId) return;
      if (!sourceHandleId) return;

      const sourceNode = getNode(sourceId);
      const targetNode = getNode(targetId);
      if (!sourceNode || !targetNode) return;

      const sourceAbs = getAbsoluteFlowPosition(sourceNode);
      const targetAbs = getAbsoluteFlowPosition(targetNode);
      const ptr = connectPointerRef.current;

      const { sourceHandle, targetHandle } = anchorHandlesFromConnection({
        sourceNode,
        targetNode,
        sourceAbs,
        targetAbs,
        sourceHandleId,
        targetHandleId,
        sourcePointer: ptr.startPointer,
        targetPointer: ptr.endPointer ?? lastPointerRef.current,
      });

      connectPointerRef.current = { sourceHandleId: null, startPointer: null, endPointer: null };
      connectingRef.current = false;
      setIsConnecting(false);

      const endpoints = { source: sourceId, target: targetId, sourceHandle, targetHandle };
      setEdges((eds) => {
        if (eds.some((e) => isSameConnectionEndpoints(endpoints, e))) return eds;
        return addEdge(
          {
            source: sourceId,
            target: targetId,
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
      onConnect(sourceId, targetId, sourceHandle, targetHandle);
      requestAnimationFrame(() => {
        updateNodeInternals(sourceId);
        updateNodeInternals(targetId);
      });
    },
    [
      canEdit,
      getAbsoluteFlowPosition,
      getNode,
      onConnect,
      setEdges,
      stableEdgeDelete,
      stableEdgeLabelChange,
      updateNodeInternals,
    ],
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      connectCompletedRef.current = true;
      finalizeConnection(
        params.source,
        params.target,
        params.sourceHandle ?? connectPointerRef.current.sourceHandleId,
        params.targetHandle,
      );
    },
    [finalizeConnection],
  );

  const stopConnecting = useCallback(() => {
    connectingRef.current = false;
    setIsConnecting(false);
    connectPointerRef.current = { sourceHandleId: null, startPointer: null, endPointer: null };
  }, []);

  const handleConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: { handleId?: string | null }) => {
      connectCompletedRef.current = false;
      connectingRef.current = true;
      setIsConnecting(true);
      const pt = screenToFlowPosition(clientPointFromConnectEvent(event));
      connectPointerRef.current = {
        sourceHandleId: params.handleId ?? null,
        startPointer: pt,
        endPointer: null,
      };
    },
    [screenToFlowPosition],
  );

  const handleConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      state: {
        fromNode?: Node | null;
        fromHandle?: { id?: string | null } | null;
        toNode?: Node | null;
        toHandle?: { id?: string | null } | null;
      },
    ) => {
      const endPointer = screenToFlowPosition(clientPointFromConnectEvent(event));
      connectPointerRef.current.endPointer = endPointer;

      if (connectCompletedRef.current) {
        connectCompletedRef.current = false;
        stopConnecting();
        return;
      }

      if (!canEdit || !connectingRef.current) {
        stopConnecting();
        return;
      }

      const sourceId = state.fromNode?.id;
      const sourceHandleId = state.fromHandle?.id ?? connectPointerRef.current.sourceHandleId;
      if (!sourceId || !sourceHandleId) {
        stopConnecting();
        return;
      }

      let targetNode = state.toNode && state.toNode.id !== sourceId ? state.toNode : null;
      if (!targetNode) {
        const hit = findConnectTargetAtPointer(
          getNodes(),
          getAbsoluteFlowPosition,
          endPointer,
          sourceId,
        );
        if (hit) targetNode = hit.node;
      }

      if (!targetNode || targetNode.type === "fsiFrame") {
        stopConnecting();
        return;
      }

      const candidate = {
        source: sourceId,
        target: targetNode.id,
        sourceHandle: sourceHandleId,
        targetHandle: state.toHandle?.id ?? null,
      };
      if (!isValidConnection(candidate)) {
        stopConnecting();
        return;
      }

      connectCompletedRef.current = true;
      finalizeConnection(sourceId, targetNode.id, sourceHandleId, state.toHandle?.id ?? null);
    },
    [canEdit, finalizeConnection, getAbsoluteFlowPosition, getNodes, isValidConnection, screenToFlowPosition, stopConnecting],
  );

  const clearEdgeSelection = useCallback(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setEdges]);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      clearEdgeSelection();
      // Only steal focus to the pane (for keyboard shortcuts) when NOT clicking into
      // a text field — otherwise this blurs the field and kills the typing caret.
      const target = e.target as HTMLElement | null;
      const inField = !!target?.closest?.("input, textarea, select, [contenteditable='true']");
      if (!inField) paneRef.current?.focus();
      // Selection itself is driven by the node's own onPointerDownCapture; here we
      // just keep the workspace's selected-node state in sync.
      queueMicrotask(() => {
        const selectedNodes = getNodes().filter((n) => n.selected && n.type !== "fsiFrame");
        onSelectionChange({ nodes: selectedNodes, edges: [] });
      });
      const data = node.data as FsiNodeData;
      onNodeSelect(data.fsiNode);
    },
    [clearEdgeSelection, getNodes, onNodeSelect, onSelectionChange],
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
    (_: React.MouseEvent | React.TouchEvent, node: Node, dragged: Node[]) => {
      pendingSelectIdsRef.current = null;
      setSnapLines([]);
      const targets = dragged.length > 0 ? dragged : [node];
      onNodeDragStart(
        targets.map((n) => {
          const abs = getAbsoluteFlowPosition(n);
          return { id: n.id, x: abs.x, y: abs.y };
        }),
      );
    },
    [getAbsoluteFlowPosition, onNodeDragStart],
  );

  /** Absolute-flow-space box for a node, preferring its measured DOM size. */
  const nodeBox = useCallback(
    (n: Node): SnapBox => {
      const abs = getAbsoluteFlowPosition(n);
      const est = estimateNodeSize((n.data as FsiNodeData).fsiNode);
      return {
        left: abs.x,
        top: abs.y,
        width: n.measured?.width ?? n.width ?? est.width,
        height: n.measured?.height ?? n.height ?? est.height,
      };
    },
    [getAbsoluteFlowPosition],
  );

  /** Miro/Figma-style smart guides: snaps the dragged node(s) to nearby edges/centers and shows guide lines. */
  const applySnap = useCallback(
    (primary: Node, dragged: Node[]) => {
      if (!canEdit) return;
      const targets = dragged.length > 0 ? dragged : [primary];
      const targetIds = new Set(targets.map((n) => n.id));
      const others = getNodes()
        .filter((n) => !targetIds.has(n.id))
        .map(nodeBox);
      const threshold = SNAP_THRESHOLD_PX / getViewport().zoom;
      const { dx, dy, lines } = computeSnapGuides(nodeBox(primary), others, threshold);
      setSnapLines(lines);
      if (dx !== 0 || dy !== 0) {
        setNodes((nds) =>
          nds.map((n) =>
            targetIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
          ),
        );
      }
    },
    [canEdit, getNodes, getViewport, nodeBox, setNodes],
  );

  const handleNodeDrag = useCallback(
    (_: React.MouseEvent | React.TouchEvent, node: Node, dragged: Node[]) => {
      applySnap(node, dragged);
    },
    [applySnap],
  );

  const handleSelectionDrag = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      if (nodes.length === 0) return;
      applySnap(nodes[0]!, nodes);
    },
    [applySnap],
  );

  const persistDraggedNodes = useCallback(
    (node: Node, dragged: Node[]) => {
      setSnapLines([]);
      if (!canEdit) return;
      const now = performance.now();
      if (now - lastDragPersistAtRef.current < 40) return;
      lastDragPersistAtRef.current = now;

      const targets = dragged.length > 0 ? dragged : [node];
      for (const n of targets) {
        dragPositionLockRef.current.set(n.id, { ...n.position });
      }
      window.setTimeout(() => {
        for (const n of targets) {
          dragPositionLockRef.current.delete(n.id);
        }
      }, 1500);
      onNodeDragStop(
        targets.map((n) => {
          const abs = getAbsoluteFlowPosition(n);
          return { id: n.id, x: Math.round(abs.x), y: Math.round(abs.y) };
        }),
      );
    },
    [canEdit, getAbsoluteFlowPosition, onNodeDragStop],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent | React.TouchEvent, node: Node, dragged: Node[]) => {
      persistDraggedNodes(node, dragged);
    },
    [persistDraggedNodes],
  );

  const handleSelectionDragStart = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      if (nodes.length === 0) return;
      pendingSelectIdsRef.current = null;
      setSnapLines([]);
      onNodeDragStart(
        nodes.map((n) => {
          const abs = getAbsoluteFlowPosition(n);
          return { id: n.id, x: abs.x, y: abs.y };
        }),
      );
    },
    [getAbsoluteFlowPosition, onNodeDragStart],
  );

  const handleSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: Node[]) => {
      if (nodes.length === 0) return;
      persistDraggedNodes(nodes[0]!, nodes);
    },
    [persistDraggedNodes],
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
      const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      lastPointerRef.current = pt;
      if (connectingRef.current) {
        connectPointerRef.current.endPointer = pt;
      }
    },
    [screenToFlowPosition],
  );

  // A bare mouse-wheel notch zooms (cursor-anchored); ctrl+scroll/pinch keep using
  // React Flow's own zoomOnPinch handling below, and bare trackpad scroll falls
  // through to panOnScroll. Runs in the capture phase so it can claim the event
  // before React Flow's own wheel listener (bound lower in the tree) sees it.
  const handleWheelCapture = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey || !isMouseWheelNotch(e.nativeEvent)) return;
      const pane = paneRef.current?.querySelector(".react-flow__pane") as HTMLElement | null;
      if (!pane) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = pane.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const { x, y, zoom } = getViewport();
      const factor = Math.pow(2, (e.deltaY > 0 ? -1 : 1) * 0.25);
      const nextZoom = Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, zoom * factor));
      const flowX = (screenX - x) / zoom;
      const flowY = (screenY - y) / zoom;
      void setViewport(
        { x: screenX - flowX * nextZoom, y: screenY - flowY * nextZoom, zoom: nextZoom },
        { duration: 0 },
      );
    },
    [getViewport, setViewport],
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
      // Keep focus on the pane so Backspace/Delete can remove the selected connection.
      queueMicrotask(() => paneRef.current?.focus());
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
        connectable: canEdit,
        draggable: canEdit,
        data: {
          ...(n.data as FsiNodeData),
          isConnecting,
          // Only reveal ports while a connect drag is active; selected nodes also
          // show them locally so you can start a wire without cluttering the board.
          showConnectionDots: isConnecting,
        },
      })),
    [nodes, canEdit, isConnecting],
  );

  const miniMapNodeColor = useCallback((n: Node) => {
    const d = n.data as FsiNodeData | undefined;
    return d?.color ?? "#22c55e";
  }, []);

  return (
    <div
      ref={paneRef}
      className="relative h-full w-full overflow-hidden outline-none select-none"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseMove={handlePaneMouseMove}
      onPaste={handlePanePaste}
      onWheelCapture={handleWheelCapture}
    >
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Strict}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineComponent={FsiConnectionLine}
        connectOnClick={false}
        connectionRadius={72}
        nodeDragThreshold={1}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable={canEdit}
        // Node wrappers must NOT be focusable — otherwise clicking into a node's text
        // field focuses the node instead of the input, so you can't type. (Delete is
        // driven by the workspace keydown + selection state, not node focus.)
        nodesFocusable={false}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onPaneDoubleClick={handlePaneDoubleClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onSelectionDragStart={handleSelectionDragStart}
        onSelectionDrag={handleSelectionDrag}
        onSelectionDragStop={handleSelectionDragStop}
        onMoveEnd={handleMoveEnd}
        onDragOver={handleDragOver}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onSelectionChange={onSelectionChange}
        nodesDeletable={canEdit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        edgesFocusable
        selectionOnDrag={canEdit && boxSelectMode}
        // Middle-mouse-button drag (button 1) always pans, alongside left-click
        // drag in the normal (non box-select) mode — "hold the scroll wheel and
        // move" is the standard mouse convention for panning a canvas.
        panOnDrag={boxSelectMode ? [1, 2] : [0, 1]}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        // Double-click is how you select a word in a text field — don't let the canvas
        // hijack it to zoom. (Node creation uses the explicit onPaneDoubleClick handler.)
        zoomOnDoubleClick={false}
        // Trackpad/mouse-wheel scroll pans the canvas in x/y; pinch gestures (and
        // ctrl+scroll) still zoom via zoomOnPinch, which defaults to true.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        defaultEdgeOptions={{
          type: "fsiEdge",
          selectable: true,
          focusable: true,
          data: { canEdit, onDelete: stableEdgeDelete, onLabelChange: stableEdgeLabelChange },
        }}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        className={cn(themePalette.canvasBgClass, "fsi-flow-canvas")}
      >
        <FsiMiroGrid theme={canvasTheme} />
        <FsiSnapGuides lines={snapLines} zoom={getViewport().zoom} />
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
