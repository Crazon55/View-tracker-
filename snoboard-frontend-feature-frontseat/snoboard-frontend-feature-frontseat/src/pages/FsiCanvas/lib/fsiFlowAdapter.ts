import type { Edge, Node } from "@xyflow/react";
import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { colorForNodeType } from "./fsiNodeSchemas";
import { getFieldDefs } from "./fsiNodeFieldDefs";
import { isCanvasNode, isNoteNode, isScreenshotNode } from "./fsiHierarchy";
import { resolveConnectionHandles, anchorIdsForNode } from "./fsiConnectionHandles";
import { userVisibleEdgeLabel } from "./fsiConnectionHandleMeta";
import {
  COMPACT_NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  displayNodeType,
  isFrameNode,
  isSimpleLabelNode,
  isCarouselBodyNode,
  isNodeUiExpanded,
  nodeCardWidth,
  nodeCardHeight,
} from "./fsiWhiteboardTypes";
import { toFlowPosition } from "./fsiNodePositions";

const STICKY_COLOR = "#fef08a";

export type FsiNodeData = {
  fsiNode: FsiNodeRecord;
  label: string;
  nodeType: string;
  color: string;
  canEdit: boolean;
  isNote: boolean;
  isCompact: boolean;
  fieldDefs: ReturnType<typeof getFieldDefs>;
  onTitleChange?: (nodeId: string, title: string) => void;
  onBodyChange?: (nodeId: string, body: string) => void;
  onPayloadChange?: (nodeId: string, key: string, value: string) => void;
  onStructuredPayloadPatch?: (nodeId: string, patch: Record<string, unknown>) => void;
  onScreenshotsChange?: (nodeId: string, screenshots: string[]) => void;
  connectionAnchors?: string[];
  /** True while user is dragging a new connection line. */
  isConnecting?: boolean;
  showConnectionDots?: boolean;
};

export function graphToFlow(
  nodes: FsiNodeRecord[],
  connections: FsiConnectionRecord[],
  options?: {
    canEdit?: boolean;
    onTitleChange?: (nodeId: string, title: string) => void;
    onBodyChange?: (nodeId: string, body: string) => void;
    onPayloadChange?: (nodeId: string, key: string, value: string) => void;
    onStructuredPayloadPatch?: (nodeId: string, patch: Record<string, unknown>) => void;
    onEdgeDelete?: (edgeId: string) => void;
    onEdgeLabelChange?: (edgeId: string, label: string) => void;
    onScreenshotsChange?: (nodeId: string, screenshots: string[]) => void;
  },
): { nodes: Node[]; edges: Edge[] } {
  const visible = nodes.filter(isCanvasNode);
  const nodesById = new Map(visible.map((n) => [n.id, n]));
  const visibleConnections = connections.filter((c) => {
    const ids = new Set(visible.map((n) => n.id));
    return ids.has(c.source_node_id) && ids.has(c.target_node_id);
  });

  const flowNodes: Node[] = visible.map((n) => {
    const isScreenshot = isScreenshotNode(n);
    const isNote = isNoteNode(n);
    const isFrame = isFrameNode(n);
    const uiType = displayNodeType(n);
    const payload = n.structured_payload ?? {};
    const customColor =
      typeof payload.card_color === "string" && payload.card_color.trim()
        ? payload.card_color.trim()
        : null;

    const connectionAnchors = anchorIdsForNode(n.id, visibleConnections);

    if (isFrame) {
      const w = Number(payload.frame_width) || 520;
      const h = Number(payload.frame_height) || 360;
      return {
        id: n.id,
        type: "fsiFrame",
        position: { x: n.canvas_x ?? 0, y: n.canvas_y ?? 0 },
        style: { width: w, height: h },
        zIndex: -1,
        draggable: true,
        selectable: true,
        data: {
          fsiNode: n,
          label: n.display_title,
          nodeType: "Frame",
          color: colorForNodeType("Frame"),
          canEdit: options?.canEdit ?? false,
          isNote: false,
          isCompact: false,
          fieldDefs: [],
          onTitleChange: options?.onTitleChange,
          onBodyChange: options?.onBodyChange,
          onPayloadChange: options?.onPayloadChange,
          onScreenshotsChange: options?.onScreenshotsChange,
        } satisfies FsiNodeData,
      };
    }

    const isSimple = isSimpleLabelNode(n);
    const isPerf = n.node_type === "Performance" || n.node_type === "Performance Insight";
    const expanded = isNodeUiExpanded(payload);

    const flowNode: Node = {
      id: n.id,
      type: "fsiNode",
      position: toFlowPosition(n, nodesById),
      draggable: true,
      ...(isSimple
        ? { width: nodeCardWidth(payload, expanded), height: nodeCardHeight(payload, expanded) }
        : {}),
      data: {
        fsiNode: n,
        label: isScreenshot ? "Visual" : isNote ? "Sticky Note" : n.display_title,
        nodeType: isScreenshot ? "Visual" : isNote ? "Sticky Note" : uiType,
        color: isScreenshot
          ? "#ec4899"
          : isNote
            ? STICKY_COLOR
            : customColor ?? colorForNodeType(uiType),
        canEdit: options?.canEdit ?? false,
        isNote,
        isCompact: isSimple,
        fieldDefs:
          isScreenshot || isNote || (isSimple && !isPerf && !isCarouselBodyNode(n))
            ? []
            : getFieldDefs(n.node_type),
        onTitleChange: options?.onTitleChange,
        onBodyChange: options?.onBodyChange,
        onPayloadChange: options?.onPayloadChange,
        onStructuredPayloadPatch: options?.onStructuredPayloadPatch,
        onScreenshotsChange: options?.onScreenshotsChange,
        connectionAnchors,
      } satisfies FsiNodeData,
    };

    if (n.parent_node_id) {
      flowNode.parentId = n.parent_node_id;
      flowNode.extent = "parent";
    }

    return flowNode;
  });

  flowNodes.sort((a, b) => {
    if (a.parentId && !b.parentId) return 1;
    if (!a.parentId && b.parentId) return -1;
    return 0;
  });

  const visibleIds = new Set(visible.map((n) => n.id));
  const nodeById = nodesById;
  const flowEdges: Edge[] = connections
    .filter((c) => visibleIds.has(c.source_node_id) && visibleIds.has(c.target_node_id))
    .map((c) => {
      const sourceNode = nodeById.get(c.source_node_id)!;
      const targetNode = nodeById.get(c.target_node_id)!;
      if (isFrameNode(sourceNode) || isFrameNode(targetNode)) return null;
      const { sourceHandle, targetHandle } = resolveConnectionHandles(c, sourceNode, targetNode);
      return {
        id: c.id,
        source: c.source_node_id,
        target: c.target_node_id,
        sourceHandle,
        targetHandle,
        label: userVisibleEdgeLabel(c.edge_label_note) || undefined,
        type: "fsiEdge",
        selectable: true,
        focusable: true,
        data: {
          canEdit: options?.canEdit ?? false,
          labelNote: userVisibleEdgeLabel(c.edge_label_note) ?? null,
          onDelete: options?.onEdgeDelete,
          onLabelChange: options?.onEdgeLabelChange,
        },
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { nodes: flowNodes, edges: flowEdges };
}

export function previewLines(node: FsiNodeRecord): string[] {
  if (isNoteNode(node)) {
    return node.raw_body_text ? [node.raw_body_text.slice(0, 60)] : [];
  }
  return [displayNodeType(node)];
}
