import type { Edge, Node } from "@xyflow/react";
import type { FsiConnectionRecord, FsiNodeRecord } from "./fsiNodeSchemas";
import { colorForNodeType } from "./fsiNodeSchemas";
import { getFieldDefs } from "./fsiNodeFieldDefs";
import { isCanvasNode, isNoteNode, isScreenshotNode } from "./fsiHierarchy";
import { NOTE_COLOR } from "./fsiNoteTemplates";

export type FsiNodeData = {
  fsiNode: FsiNodeRecord;
  label: string;
  nodeType: string;
  color: string;
  canEdit: boolean;
  isNote: boolean;
  fieldDefs: ReturnType<typeof getFieldDefs>;
  onTitleChange?: (nodeId: string, title: string) => void;
  onBodyChange?: (nodeId: string, body: string) => void;
  onPayloadChange?: (nodeId: string, key: string, value: string) => void;
  onScreenshotsChange?: (nodeId: string, screenshots: string[]) => void;
};

export function graphToFlow(
  nodes: FsiNodeRecord[],
  connections: FsiConnectionRecord[],
  options?: {
    canEdit?: boolean;
    onTitleChange?: (nodeId: string, title: string) => void;
    onBodyChange?: (nodeId: string, body: string) => void;
    onPayloadChange?: (nodeId: string, key: string, value: string) => void;
    onEdgeDelete?: (edgeId: string) => void;
    onEdgeLabelChange?: (edgeId: string, label: string) => void;
    onScreenshotsChange?: (nodeId: string, screenshots: string[]) => void;
  },
): { nodes: Node[]; edges: Edge[] } {
  const visible = nodes.filter(isCanvasNode);

  const flowNodes: Node[] = visible.map((n) => {
    const isScreenshot = isScreenshotNode(n);
    const isNote = isNoteNode(n);
    return {
      id: n.id,
      type: "fsiNode",
      position: { x: n.canvas_x ?? 0, y: n.canvas_y ?? 0 },
      draggable: true,
      data: {
        fsiNode: n,
        label: isScreenshot ? "Screenshot" : isNote ? "Note" : n.display_title,
        nodeType: isScreenshot ? "Screenshot" : isNote ? "Note" : n.node_type,
        color: isScreenshot ? "#ec4899" : isNote ? NOTE_COLOR : colorForNodeType(n.node_type),
        canEdit: options?.canEdit ?? false,
        isNote,
        fieldDefs: isScreenshot || isNote ? [] : getFieldDefs(n.node_type),
        onTitleChange: options?.onTitleChange,
        onBodyChange: options?.onBodyChange,
        onPayloadChange: options?.onPayloadChange,
        onScreenshotsChange: options?.onScreenshotsChange,
      } satisfies FsiNodeData,
    };
  });

  const visibleIds = new Set(visible.map((n) => n.id));
  const flowEdges: Edge[] = connections
    .filter((c) => visibleIds.has(c.source_node_id) && visibleIds.has(c.target_node_id))
    .map((c) => ({
      id: c.id,
      source: c.source_node_id,
      target: c.target_node_id,
      label: c.edge_label_note || undefined,
      type: "fsiEdge",
      selectable: true,
      focusable: true,
      data: {
        canEdit: options?.canEdit ?? false,
        labelNote: c.edge_label_note ?? null,
        onDelete: options?.onEdgeDelete,
        onLabelChange: options?.onEdgeLabelChange,
      },
    }));

  return { nodes: flowNodes, edges: flowEdges };
}

export function previewLines(node: FsiNodeRecord): string[] {
  if (isNoteNode(node)) {
    return node.raw_body_text ? [node.raw_body_text.slice(0, 60)] : [];
  }
  return [node.node_type];
}
