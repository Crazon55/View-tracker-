import type { Edge, Node } from "@xyflow/react";
import type { FsiConnectionRecord, FsiNodeRecord, IronNodeType } from "./fsiNodeSchemas";
import { NODE_TYPE_COLORS } from "./fsiNodeSchemas";
import { isFieldNode, isParentNode, isPlacedOnCanvas } from "./fsiHierarchy";
import type { FieldDef } from "./fsiNodeFieldDefs";
import { NODE_FIELD_DEFS } from "./fsiNodeFieldDefs";

export type FsiNodeData = {
  fsiNode: FsiNodeRecord;
  label: string;
  nodeType: IronNodeType | string;
  color: string;
  isActiveParent?: boolean;
};

export type FsiFieldNodeData = {
  fsiNode: FsiNodeRecord;
  fieldDef: FieldDef;
  value: string;
  canEdit: boolean;
  onFieldChange?: (nodeId: string, value: string) => void;
};

export function graphToFlow(
  nodes: FsiNodeRecord[],
  connections: FsiConnectionRecord[],
  options?: {
    canEdit?: boolean;
    onFieldChange?: (nodeId: string, value: string) => void;
    activeParentId?: string | null;
  },
): {
  nodes: Node[];
  edges: Edge[];
} {
  const activeParentId = options?.activeParentId ?? null;

  const visibleDbNodes = nodes.filter((n) => {
    if (isParentNode(n)) return true;
    if (!activeParentId) return false;
    if (n.parent_node_id !== activeParentId) return false;
    return isPlacedOnCanvas(n);
  });

  const visibleIds = new Set(visibleDbNodes.map((n) => n.id));
  const positions = new Map(visibleDbNodes.map((n) => [n.id, { x: n.canvas_x ?? 0, y: n.canvas_y ?? 0 }]));

  const flowNodes: Node[] = visibleDbNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: n.canvas_x, y: n.canvas_y };

    if (isFieldNode(n)) {
      const fieldKey = String(n.structured_payload?.field_key ?? "");
      const parentType = nodes.find((p) => p.id === n.parent_node_id)?.node_type as IronNodeType | undefined;
      const defs = parentType ? NODE_FIELD_DEFS[parentType] : [];
      const fieldDef = defs.find((d) => d.key === fieldKey) ?? {
        key: fieldKey,
        label: n.display_title,
        inputType: "text" as const,
      };

      return {
        id: n.id,
        type: "fsiFieldNode",
        position: pos,
        draggable: true,
        data: {
          fsiNode: n,
          fieldDef,
          value: String(n.structured_payload?.field_value ?? ""),
          canEdit: options?.canEdit ?? false,
          onFieldChange: options?.onFieldChange,
        } satisfies FsiFieldNodeData,
      };
    }

    return {
      id: n.id,
      type: "fsiNode",
      position: pos,
      draggable: true,
      data: {
        fsiNode: n,
        label: n.display_title,
        nodeType: n.node_type,
        color: NODE_TYPE_COLORS[n.node_type as IronNodeType] ?? "#22c55e",
        isActiveParent: activeParentId === n.id,
      } satisfies FsiNodeData,
    };
  });

  const flowEdges: Edge[] = [];

  // Hierarchy edges: parent → placed field (vertical tree).
  for (const n of visibleDbNodes) {
    if (n.parent_node_id && visibleIds.has(n.parent_node_id)) {
      flowEdges.push({
        id: `tree-${n.parent_node_id}-${n.id}`,
        source: n.parent_node_id,
        target: n.id,
        type: "smoothstep",
        style: { stroke: "#52525b", strokeWidth: 2 },
      });
    }
  }

  for (const c of connections) {
    if (!visibleIds.has(c.source_node_id) || !visibleIds.has(c.target_node_id)) continue;
    if (flowEdges.some((e) => e.source === c.source_node_id && e.target === c.target_node_id)) continue;
    flowEdges.push({
      id: c.id,
      source: c.source_node_id,
      target: c.target_node_id,
      label: c.edge_label_note || undefined,
      type: "smoothstep",
      style: { stroke: "#71717a", strokeWidth: 2 },
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

export function previewLines(node: FsiNodeRecord): string[] {
  if (isFieldNode(node)) {
    const v = node.structured_payload?.field_value;
    return v ? [String(v).slice(0, 60)] : [];
  }
  if (isParentNode(node)) {
    return [node.node_type];
  }
  return [];
}
