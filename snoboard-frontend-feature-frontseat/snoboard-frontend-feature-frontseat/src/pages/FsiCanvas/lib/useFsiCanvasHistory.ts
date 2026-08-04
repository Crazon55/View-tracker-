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

function findMatchingConnection(
  connections: FsiConnectionRecord[],
  needle: FsiConnectionRecord,
): FsiConnectionRecord | undefined {
  const byId = connections.find((c) => c.id === needle.id);
  if (byId) return byId;
  return connections.find(
    (c) =>
      c.source_node_id === needle.source_node_id &&
      c.target_node_id === needle.target_node_id &&
      (c.source_handle ?? "") === (needle.source_handle ?? "") &&
      (c.target_handle ?? "") === (needle.target_handle ?? ""),
  );
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
              edge_label_note: entry.connection.edge_label_note ?? undefined,
              source_handle: entry.connection.source_handle ?? undefined,
              target_handle: entry.connection.target_handle ?? undefined,
            });
            const withHandles: FsiConnectionRecord = {
              ...conn,
              source_handle: conn.source_handle ?? entry.connection.source_handle ?? null,
              target_handle: conn.target_handle ?? entry.connection.target_handle ?? null,
            };
            // Keep stack entry id in sync so a later undo finds this edge.
            entry.connection = withHandles;
            setGraph({ ...graph, connections: [...graph.connections, withHandles] });
          } else {
            const match = findMatchingConnection(graph.connections, entry.connection);
            setGraph({
              ...graph,
              connections: match
                ? graph.connections.filter((c) => c.id !== match.id)
                : graph.connections.filter((c) => c.id !== entry.connection.id),
            });
            const idToDelete = match?.id ?? entry.connection.id;
            if (idToDelete && !idToDelete.startsWith("opt-")) {
              try {
                await fsiApi.deleteConnection(idToDelete);
              } catch {
                // Already gone — still treat undo as success in the UI.
              }
            }
          }
          break;
        }
        case "connection_remove": {
          if (forward) {
            const match = findMatchingConnection(graph.connections, entry.connection);
            const idToDelete = match?.id ?? entry.connection.id;
            setGraph({
              ...graph,
              connections: graph.connections.filter((c) => c.id !== idToDelete),
            });
            if (idToDelete && !idToDelete.startsWith("opt-")) {
              try {
                await fsiApi.deleteConnection(idToDelete);
              } catch {
                /* ignore */
              }
            }
          } else {
            const conn = await fsiApi.createConnection(studyId, {
              source_node_id: entry.connection.source_node_id,
              target_node_id: entry.connection.target_node_id,
              edge_label_note: entry.connection.edge_label_note ?? undefined,
              source_handle: entry.connection.source_handle ?? undefined,
              target_handle: entry.connection.target_handle ?? undefined,
            });
            const withHandles: FsiConnectionRecord = {
              ...conn,
              source_handle: conn.source_handle ?? entry.connection.source_handle ?? null,
              target_handle: conn.target_handle ?? entry.connection.target_handle ?? null,
            };
            entry.connection = withHandles;
            setGraph({ ...graph, connections: [...graph.connections, withHandles] });
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

  /** Swap optimistic connection id → real id inside history entries. */
  const remapConnectionId = useCallback((tempId: string, real: FsiConnectionRecord) => {
    const patch = (stack: FsiHistoryEntry[]) => {
      for (let i = 0; i < stack.length; i++) {
        const e = stack[i]!;
        if (
          (e.type === "connection_add" || e.type === "connection_remove") &&
          e.connection.id === tempId
        ) {
          stack[i] = { ...e, connection: real };
        }
      }
    };
    patch(undoStack.current);
    patch(redoStack.current);
  }, []);

  /** Drop a failed optimistic connection_add from the undo stack. */
  const discardConnectionEntry = useCallback(
    (connectionId: string) => {
      const filterStack = (stack: FsiHistoryEntry[]) =>
        stack.filter(
          (e) =>
            !(
              (e.type === "connection_add" || e.type === "connection_remove") &&
              e.connection.id === connectionId
            ),
        );
      undoStack.current = filterStack(undoStack.current);
      redoStack.current = filterStack(redoStack.current);
      bump();
    },
    [bump],
  );

  return {
    pushEntry,
    undo,
    redo,
    clearHistory,
    remapConnectionId,
    discardConnectionEntry,
    canUndo,
    canRedo,
    isApplying: applyingRef,
  };
}
