import type { FsiGraph, FsiNodeRecord } from "./fsiNodeSchemas";
import type { createFsiApi } from "@/services/fsiApi";
import type { FsiLayoutTemplate } from "./fsiLayoutTemplates";
import { resolveTemplateNode } from "./fsiLayoutTemplates";

type FsiApi = ReturnType<typeof createFsiApi>;

export async function applyFsiLayoutTemplate(
  studyId: string,
  template: FsiLayoutTemplate,
  api: FsiApi,
): Promise<FsiGraph> {
  const createdIds: string[] = [];

  for (const spec of template.nodes) {
    const row = resolveTemplateNode(spec);
    const node = (await api.createNode(studyId, row)) as FsiNodeRecord;
    createdIds.push(node.id);
  }

  for (const link of template.connections) {
    const source = createdIds[link.fromIndex];
    const target = createdIds[link.toIndex];
    if (!source || !target) continue;
    await api.createConnection(studyId, {
      source_node_id: source,
      target_node_id: target,
      edge_label_note: link.edge_label_note,
    });
  }

  return api.getStudyGraph(studyId);
}
