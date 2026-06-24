import { useCallback, useRef, useState } from "react";
import type { FsiConnectionRecord, FsiGraph, FsiNodeRecord } from "./fsiNodeSchemas";
import { fsiApi } from "@/services/fsiApi";

const MAX_HISTORY = 40;

type NodePatch = Partial<
  Pick<FsiNodeRecord, "display_title" | "raw_body_text" | "structured_payload" | "canvas_x" | "canvas_y">
>;

export type FsiHistoryEntry =
  | { type: "node_move"; nodeId: string; before: { x: number; y: number }; after: { x: number; y: number } }
  | { type: "node_patch"; nodeId: string; before: NodePatch; after: NodePatch }
  | { type: "node_add"; node: FsiNodeRecord }
  | {
      type: "node_remove";
      node: FsiNodeRecord;
      connections: FsiConnectionRecord[];
    }
  | { type: "connection_add"; connection: FsiConnectionRecord }
  | { type: "connection_remove"; connection: FsiConnectionRecord }
  | {
      type: "batch_move";
      moves: Array<{ nodeId: string; before: { x: number; y: number }; after: { x: number; y: number } }>;
    };

function applyNodePatch(graph: FsiGraph, nodeId: string, patch: NodePatch): FsiGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
  };
}

function applyBatchMove(
  graph: FsiGraph,
  moves: Array<{ nodeId: string; x: number; y: number }>,
): FsiGraph {
  const byId = new Map(moves.map((m) => [m.nodeId, m]));
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const m = byId.get(n.id);
      return m ? { ...n, canvas_x: m.x, canvas_y: m.y } : n;
    }),
  };
}

async function persistNodePatch(nodeId: string, patch: NodePatch): Promise<void> {
  await fsiApi.updateNode(nodeId, patch as Record<string, unknown>);
}

export function useFsiCanvasHistory(studyId: string | undefined) {
  const undoStack = useRef<FsiHistoryEntry[]>([]);
  const redoStack = useRef<FsiHistoryEntry[]>([]);
  const applyingRef = useRef(false);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((n) => n + 1), []);

  const canUndo = revision >= 0 && undoStack.current.length > 0;
  const canRedo = revision >= 0 && redoStack.current.length > 0;

  const pushEntry = useCallback(
    (entry: FsiHistoryEntry) => {
      if (!studyId || applyingRef.current) return;
      undoStack.current.push(entry);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      bump();
    },
    [studyId, bump],
  );

  const applyEntry = useCallback(
    async (
      entry: FsiHistoryEntry,
      direction: "undo" | "redo",
      graph: FsiGraph,
      setGraph: (next: FsiGraph) => void,
    ) => {
      if (!studyId) return;

      const forward = direction === "redo";

      switch (entry.type) {
        case "node_move": {
          const pos = forward ? entry.after : entry.before;
          setGraph(applyBatchMove(graph, [{ nodeId: entry.nodeId, x: pos.x, y: pos.y }]));
          await persistNodePatch(entry.nodeId, { canvas_x: pos.x, canvas_y: pos.y });
          break;
        }
        case "node_patch": {
          const patch = forward ? entry.after : entry.before;
          setGraph(applyNodePatch(graph, entry.nodeId, patch));
          await persistNodePatch(entry.nodeId, patch);
          break;
        }
        case "node_add": {
          if (forward) {
            const created = await fsiApi.createNode(studyId, {
              node_type: entry.node.node_type,
              display_title: entry.node.display_title,
              canvas_x: entry.node.canvas_x,
              canvas_y: entry.node.canvas_y,
              raw_body_text: entry.node.raw_body_text,
              structured_payload: entry.node.structured_payload,
            });
            setGraph({ ...graph, nodes: [...graph.nodes, created] });
          } else {
            setGraph({
              ...graph,
              nodes: graph.nodes.filter((n) => n.id !== entry.node.id),
              connections: graph.connections.filter(
                (c) => c.source_node_id !== entry.node.id && c.target_node_id !== entry.node.id,
              ),
            });
            await fsiApi.deleteNode(entry.node.id);
          }
          break;
        }
        case "node_remove": {
          if (forward) {
            setGraph({
              ...graph,
              nodes: graph.nodes.filter((n) => n.id !== entry.node.id),
              connections: graph.connections.filter(
                (c) => !entry.connections.some((ec) => ec.id === c.id),
              ),
            });
            await fsiApi.deleteNode(entry.node.id);
          } else {
            const created = await fsiApi.createNode(studyId, {
              node_type: entry.node.node_type,
              display_title: entry.node.display_title,
              canvas_x: entry.node.canvas_x,
              canvas_y: entry.node.canvas_y,
              raw_body_text: entry.node.raw_body_text,
              structured_payload: entry.node.structured_payload,
            });
            const idMap = new Map([[entry.node.id, created.id]]);
            const restoredConnections: FsiConnectionRecord[] = [];
            for (const c of entry.connections) {
              const source = idMap.get(c.source_node_id) ?? c.source_node_id;
              const target = idMap.get(c.target_node_id) ?? c.target_node_id;
              const conn = await fsiApi.createConnection(studyId, {
                source_node_id: source,
                target_node_id: target,
                edge_label_note: c.edge_label_note,
              });
              restoredConnections.push(conn);
            }
            setGraph({
              ...graph,
              nodes: [...graph.nodes, created],
              connections: [...graph.connections, ...restoredConnections],
            });
          }
          break;
        }
        case "connection_add": {
          if (forward) {
            const conn = await fsiApi.createConnection(studyId, {
              source_node_id: entry.connection.source_node_id,
              target_node_id: entry.connection.target_node_id,
              edge_label_note: entry.connection.edge_label_note,
            });
            setGraph({ ...graph, connections: [...graph.connections, conn] });
          } else {
            setGraph({
              ...graph,
              connections: graph.connections.filter((c) => c.id !== entry.connection.id),
            });
            await fsiApi.deleteConnection(entry.connection.id);
          }
          break;
        }
        case "connection_remove": {
          if (forward) {
            setGraph({
              ...graph,
              connections: graph.connections.filter((c) => c.id !== entry.connection.id),
            });
            await fsiApi.deleteConnection(entry.connection.id);
          } else {
            const conn = await fsiApi.createConnection(studyId, {
              source_node_id: entry.connection.source_node_id,
              target_node_id: entry.connection.target_node_id,
              edge_label_note: entry.connection.edge_label_note,
            });
            setGraph({ ...graph, connections: [...graph.connections, conn] });
          }
          break;
        }
        case "batch_move": {
          const positions = entry.moves.map((m) => ({
            nodeId: m.nodeId,
            x: (forward ? m.after : m.before).x,
            y: (forward ? m.after : m.before).y,
          }));
          setGraph(applyBatchMove(graph, positions));
          await Promise.all(
            positions.map(({ nodeId, x, y }) =>
              persistNodePatch(nodeId, { canvas_x: x, canvas_y: y }),
            ),
          );
          break;
        }
      }
    },
    [studyId],
  );

  const undo = useCallback(
    async (graph: FsiGraph | null, setGraph: (next: FsiGraph) => void) => {
      if (!graph || !undoStack.current.length) return;
      const entry = undoStack.current.pop()!;
      redoStack.current.push(entry);
      applyingRef.current = true;
      try {
        await applyEntry(entry, "undo", graph, setGraph);
      } finally {
        applyingRef.current = false;
        bump();
      }
    },
    [applyEntry, bump],
  );

  const redo = useCallback(
    async (graph: FsiGraph | null, setGraph: (next: FsiGraph) => void) => {
      if (!graph || !redoStack.current.length) return;
      const entry = redoStack.current.pop()!;
      undoStack.current.push(entry);
      applyingRef.current = true;
      try {
        await applyEntry(entry, "redo", graph, setGraph);
      } finally {
        applyingRef.current = false;
        bump();
      }
    },
    [applyEntry, bump],
  );

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, [bump]);

  return {
    pushEntry,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
    isApplying: applyingRef,
  };
}
