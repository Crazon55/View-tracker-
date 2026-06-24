import type { FsiGraph, FsiNodeRecord } from "./fsiNodeSchemas";
import type { createFsiApi } from "@/services/fsiApi";

type FsiApi = ReturnType<typeof createFsiApi>;

export function isLegacyFieldNode(node: FsiNodeRecord): boolean {
  if (node.structured_payload?.hierarchy_level === "field") return true;
  if (node.parent_node_id && node.structured_payload?.field_key) return true;
  return false;
}

export function isCanvasNode(node: FsiNodeRecord): boolean {
  return !isLegacyFieldNode(node);
}

export function isNoteNode(node: FsiNodeRecord): boolean {
  return node.structured_payload?.is_note === true || node.structured_payload?.freeform === true;
}

/** @deprecated use isNoteNode */
export function isFreeformNode(node: FsiNodeRecord): boolean {
  return isNoteNode(node);
}

export async function migrateLegacyFieldNodes(
  graph: FsiGraph,
  api: FsiApi,
): Promise<FsiGraph> {
  const legacy = graph.nodes.filter(isLegacyFieldNode);
  if (!legacy.length) return graph;

  const nodesById = new Map(graph.nodes.map((n) => [n.id, { ...n }]));

  for (const field of legacy) {
    const parentId = field.parent_node_id;
    if (parentId) {
      const parent = nodesById.get(parentId);
      const key = String(field.structured_payload?.field_key ?? "");
      if (parent && key) {
        const value = field.structured_payload?.field_value ?? "";
        const nextPayload = { ...(parent.structured_payload ?? {}), [key]: value };
        await api.updateNode(parentId, { structured_payload: nextPayload });
        nodesById.set(parentId, { ...parent, structured_payload: nextPayload });
      }
    }
    await api.deleteNode(field.id);
    nodesById.delete(field.id);
  }

  return { ...graph, nodes: [...nodesById.values()] };
}
