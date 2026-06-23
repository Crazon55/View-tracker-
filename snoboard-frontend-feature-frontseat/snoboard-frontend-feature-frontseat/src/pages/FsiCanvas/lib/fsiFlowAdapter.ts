import type { Edge, Node } from "@xyflow/react";
import type { FsiConnectionRecord, FsiNodeRecord, IronNodeType } from "./fsiNodeSchemas";
import { NODE_TYPE_COLORS } from "./fsiNodeSchemas";

export type FsiNodeData = {
  fsiNode: FsiNodeRecord;
  label: string;
  nodeType: IronNodeType | string;
  color: string;
};

export function graphToFlow(nodes: FsiNodeRecord[], connections: FsiConnectionRecord[]): {
  nodes: Node<FsiNodeData>[];
  edges: Edge[];
} {
  const flowNodes: Node<FsiNodeData>[] = nodes.map((n) => ({
    id: n.id,
    type: "fsiNode",
    position: { x: n.canvas_x, y: n.canvas_y },
    data: {
      fsiNode: n,
      label: n.display_title,
      nodeType: n.node_type,
      color: NODE_TYPE_COLORS[n.node_type as IronNodeType] ?? "#64748b",
    },
  }));

  const flowEdges: Edge[] = connections.map((c) => ({
    id: c.id,
    source: c.source_node_id,
    target: c.target_node_id,
    label: c.edge_label_note || undefined,
    type: "smoothstep",
    animated: false,
  }));

  return { nodes: flowNodes, edges: flowEdges };
}

export function previewLines(node: FsiNodeRecord): string[] {
  const p = node.structured_payload || {};
  switch (node.node_type) {
    case "Post Example":
      return [
        p.performance_label ? String(p.performance_label) : "",
        p.views ? `${Number(p.views).toLocaleString()} views` : "",
        p.title_hook_text ? String(p.title_hook_text).slice(0, 60) : "",
      ].filter(Boolean);
    case "Hook Pattern":
      return [
        p.structural_group_type ? String(p.structural_group_type) : "",
        p.title_descriptor ? String(p.title_descriptor).slice(0, 60) : "",
      ].filter(Boolean);
    case "Content Bucket":
      return [
        p.operational_label ? String(p.operational_label) : "",
        p.parent_pillar_association ? String(p.parent_pillar_association) : "",
      ].filter(Boolean);
    case "Strategist Note":
      return [
        p.observation ? String(p.observation).slice(0, 80) : node.raw_body_text?.slice(0, 80) || "",
      ].filter(Boolean);
    default:
      return [];
  }
}
