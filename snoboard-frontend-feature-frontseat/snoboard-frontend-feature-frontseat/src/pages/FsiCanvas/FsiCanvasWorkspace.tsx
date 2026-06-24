import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OnSelectionChangeFunc } from "@xyflow/react";
import { ArrowLeft, ChevronDown, Loader2, MousePointer2, Plus, Redo2, RotateCcw, SquareDashedMousePointer, Trash2, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/fsiApi";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import FsiFlowCanvas, { type FsiFlowCanvasHandle } from "./components/FsiFlowCanvas";
import FsiNodeSuggestionsPanel, {
  type NodeSuggestionPayload,
  type NoteSuggestionPayload,
} from "./components/FsiNodeSuggestionsPanel";
import type { FsiGraph, FsiNodeRecord } from "./lib/fsiNodeSchemas";
import {
  appendGraphNode,
  colorForNodeType,
  defaultPayloadForType,
  defaultTitleForType,
  notePayload,
} from "./lib/fsiNodeSchemas";
import { isCanvasNode, migrateLegacyFieldNodes } from "./lib/fsiLegacyMigrate";
import { isNoteNode } from "./lib/fsiHierarchy";
import { NOTE_TEMPLATES } from "./lib/fsiNoteTemplates";
import { getSuggestedNodeTypes } from "./lib/fsiStudyTemplates";
import { clearSavedViewport } from "./lib/fsiViewportStorage";
import { useFsiCanvasHistory } from "./lib/useFsiCanvasHistory";
import { layoutFsiTree } from "./lib/fsiTreeLayout";

function patchGraphNodePositions(
  graph: FsiGraph,
  updates: Array<{ id: string; x: number; y: number }>,
): FsiGraph {
  const byId = new Map(updates.map((u) => [u.id, u]));
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const u = byId.get(n.id);
      return u ? { ...n, canvas_x: u.x, canvas_y: u.y } : n;
    }),
  };
}

const EMPTY_GRAPH = (study: FsiGraph["study"]): FsiGraph => ({
  study,
  nodes: [],
  connections: [],
});

export default function FsiCanvasWorkspace() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = usePermissions();
  const canEdit = canEditFsiCanvas(role);

  const [selectedNode, setSelectedNode] = useState<FsiNodeRecord | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const graphRef = useRef<FsiGraph | null>(null);
  const canvasRef = useRef<FsiFlowCanvasHandle>(null);
  const migratedRef = useRef(false);
  const creatingRef = useRef(false);
  const dragOriginRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const history = useFsiCanvasHistory(studyId);

  useEffect(() => {
    void flushFsiBackendSyncQueue();
  }, []);

  const { data: graph, isLoading, error } = useQuery<FsiGraph>({
    queryKey: ["fsi-graph", studyId],
    queryFn: () => fsiApi.getStudyGraph(studyId!),
    enabled: !!studyId,
  });

  graphRef.current = graph ?? null;

  useEffect(() => {
    if (!graph || !studyId || migratedRef.current) return;
    const legacy = graph.nodes.filter((n) => !isCanvasNode(n));
    if (!legacy.length) {
      migratedRef.current = true;
      return;
    }
    migratedRef.current = true;
    void (async () => {
      try {
        const cleaned = await migrateLegacyFieldNodes(graph, fsiApi);
        queryClient.setQueryData(["fsi-graph", studyId], cleaned);
        graphRef.current = cleaned;
        toast.success("Cleaned up legacy field nodes");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Migration failed");
      }
    })();
  }, [graph, studyId, queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fsi-graph", studyId] });

  const setGraph = useCallback(
    (next: FsiGraph) => {
      queryClient.setQueryData(["fsi-graph", studyId], next);
      graphRef.current = next;
    },
    [queryClient, studyId],
  );

  const applyPrettifyLayout = useCallback(
    async (sourceGraph: FsiGraph) => {
      const canvasNodes = sourceGraph.nodes.filter(isCanvasNode);
      const positions = layoutFsiTree(canvasNodes, sourceGraph.connections);
      const updates = [...positions.entries()].map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));

      const moves = updates
        .map(({ id, x, y }) => {
          const node = sourceGraph.nodes.find((n) => n.id === id);
          if (!node) return null;
          const before = { x: node.canvas_x, y: node.canvas_y };
          const after = { x, y };
          if (before.x === after.x && before.y === after.y) return null;
          return { nodeId: id, before, after };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      if (moves.length > 0 && !history.isApplying.current) {
        history.pushEntry({ type: "batch_move", moves });
      }

      setGraph(patchGraphNodePositions(sourceGraph, updates));

      await Promise.all(
        updates.map(({ id, x, y }) => fsiApi.updateNode(id, { canvas_x: x, canvas_y: y })),
      );

      setFitTrigger((n) => n + 1);
    },
    [history, setGraph],
  );

  const prettifyMutation = useMutation({
    mutationFn: () => applyPrettifyLayout(graphRef.current!),
    onSuccess: () => toast.success("Canvas tidied into tree layout"),
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => fsiApi.clearStudyGraph(studyId!),
    onSuccess: () => {
      const g = graphRef.current;
      if (g) {
        const empty = EMPTY_GRAPH(g.study);
        queryClient.setQueryData(["fsi-graph", studyId], empty);
        graphRef.current = empty;
      }
      setSelectedNode(null);
      setResetOpen(false);
      history.clearHistory();
      if (studyId) clearSavedViewport(studyId);
      setFitTrigger((n) => n + 1);
      toast.success("Canvas reset");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const appendCreatedNode = useCallback(
    (node: FsiNodeRecord) => {
      if (!history.isApplying.current) {
        history.pushEntry({ type: "node_add", node });
      }
      setSelectedNode(node);
      setFocusNodeId(node.id);
      const g = graphRef.current;
      if (g) {
        setGraph(appendGraphNode(g, node));
      } else {
        invalidate();
      }
    },
    [history, setGraph],
  );

  const createNoteMutation = useMutation({
    mutationFn: ({ noteKey, x, y }: { noteKey: string; x: number; y: number }) => {
      const template = NOTE_TEMPLATES.find((t) => t.key === noteKey) ?? NOTE_TEMPLATES[NOTE_TEMPLATES.length - 1];
      return fsiApi.createNode(studyId!, {
        node_type: "Strategist Note",
        display_title: "Note",
        canvas_x: x,
        canvas_y: y,
        raw_body_text: template.body,
        structured_payload: notePayload(template.key),
      });
    },
    onSuccess: appendCreatedNode,
    onError: (e: Error) => toast.error(e.message),
  });

  const createTypedNodeMutation = useMutation({
    mutationFn: ({ nodeType, x, y }: { nodeType: string; x: number; y: number }) =>
      fsiApi.createNode(studyId!, {
        node_type: nodeType,
        display_title: defaultTitleForType(nodeType),
        canvas_x: x,
        canvas_y: y,
        structured_payload: defaultPayloadForType(nodeType),
      }),
    onSuccess: appendCreatedNode,
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNodeMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      fsiApi.updateNode(id, patch),
    onSuccess: (node, { patch }) => {
      const keys = Object.keys(patch);
      const isPositionOnly = keys.every((k) => k === "canvas_x" || k === "canvas_y");
      if (isPositionOnly) return;

      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], (old) => {
        if (!old) return old;
        return { ...old, nodes: old.nodes.map((n) => (n.id === node.id ? { ...n, ...node } : n)) };
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (id: string) => fsiApi.deleteNode(id),
    onSuccess: (_, id) => {
      setSelectedNode((prev) => (prev?.id === id ? null : prev));
      const g = graphRef.current;
      if (g) {
        setGraph({
          ...g,
          nodes: g.nodes.filter((n) => n.id !== id),
          connections: g.connections.filter(
            (c) => c.source_node_id !== id && c.target_node_id !== id,
          ),
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeleteNode = useCallback(
    (id: string) => {
      const g = graphRef.current;
      if (g && !history.isApplying.current) {
        const node = g.nodes.find((n) => n.id === id);
        if (node) {
          const related = g.connections.filter(
            (c) => c.source_node_id === id || c.target_node_id === id,
          );
          history.pushEntry({ type: "node_remove", node, connections: related });
        }
      }
      deleteNodeMutation.mutate(id);
    },
    [deleteNodeMutation, history],
  );

  const deleteNodesBulkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fsiApi.deleteNode(id)));
      return ids;
    },
    onSuccess: (ids) => {
      setSelectedNode((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setMultiSelectedIds([]);
      const g = graphRef.current;
      if (g) {
        const idSet = new Set(ids);
        const next = {
          ...g,
          nodes: g.nodes.filter((n) => !idSet.has(n.id)),
          connections: g.connections.filter(
            (c) => !idSet.has(c.source_node_id) && !idSet.has(c.target_node_id),
          ),
        };
        setGraph(next);
      }
      toast.success(`Deleted ${ids.length} nodes`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createConnectionMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      fsiApi.createConnection(studyId!, { source_node_id: source, target_node_id: target }),
    onSuccess: (connection) => {
      const g = graphRef.current;
      if (g) {
        setGraph({ ...g, connections: [...g.connections, connection] });
      }
      if (!history.isApplying.current) {
        history.pushEntry({ type: "connection_add", connection });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => fsiApi.deleteConnection(id),
    onSuccess: (_, id) => {
      const g = graphRef.current;
      if (g) {
        setGraph({ ...g, connections: g.connections.filter((c) => c.id !== id) });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeleteConnection = useCallback(
    (id: string) => {
      const g = graphRef.current;
      if (g && !history.isApplying.current) {
        const connection = g.connections.find((c) => c.id === id);
        if (connection) {
          history.pushEntry({ type: "connection_remove", connection });
        }
      }
      deleteConnectionMutation.mutate(id);
    },
    [deleteConnectionMutation, history],
  );

  const getCanvasCenter = useCallback(() => {
    return canvasRef.current?.getViewportCenter() ?? { x: 200, y: 200 };
  }, []);

  const runCreate = useCallback(
    (
      mutate: typeof createTypedNodeMutation.mutate,
      vars: { nodeType: string; x: number; y: number } | { noteKey: string; x: number; y: number },
    ) => {
      if (
        !canEdit ||
        creatingRef.current ||
        createTypedNodeMutation.isPending ||
        createNoteMutation.isPending
      ) {
        return;
      }
      creatingRef.current = true;
      mutate(vars as never, {
        onSettled: () => {
          creatingRef.current = false;
        },
      });
    },
    [canEdit, createNoteMutation.isPending, createTypedNodeMutation.isPending],
  );

  const addNote = useCallback(
    (noteKey: string, x?: number, y?: number) => {
      if (!canEdit) return;
      const pos = x !== undefined && y !== undefined ? { x, y } : getCanvasCenter();
      runCreate(createNoteMutation.mutate, { noteKey, x: pos.x, y: pos.y });
    },
    [canEdit, createNoteMutation.mutate, getCanvasCenter, runCreate],
  );

  const handleSuggestionDrop = useCallback(
    (payload: NodeSuggestionPayload, x: number, y: number) => {
      runCreate(createTypedNodeMutation.mutate, { nodeType: payload.nodeType, x, y });
    },
    [createTypedNodeMutation.mutate, runCreate],
  );

  const handleNoteDrop = useCallback(
    (payload: NoteSuggestionPayload, x: number, y: number) => {
      runCreate(createNoteMutation.mutate, { noteKey: payload.noteKey, x, y });
    },
    [createNoteMutation.mutate, runCreate],
  );

  const handleAddSuggestion = useCallback(
    (nodeType: string) => {
      const pos = getCanvasCenter();
      runCreate(createTypedNodeMutation.mutate, { nodeType, x: pos.x, y: pos.y });
    },
    [createTypedNodeMutation.mutate, getCanvasCenter, runCreate],
  );

  const handleAddNote = useCallback(
    (noteKey: string) => {
      const pos = getCanvasCenter();
      runCreate(createNoteMutation.mutate, { noteKey, x: pos.x, y: pos.y });
    },
    [createNoteMutation.mutate, getCanvasCenter, runCreate],
  );

  const handleUndo = useCallback(() => {
    void history.undo(graphRef.current, setGraph);
  }, [history, setGraph]);

  const handleRedo = useCallback(() => {
    void history.redo(graphRef.current, setGraph);
  }, [history, setGraph]);

  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, handleUndo, handleRedo]);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setMultiSelectedIds([]);
  }, []);

  const handleFocusNode = useCallback((node: FsiNodeRecord) => {
    setSelectedNode(node);
    setFocusNodeId(node.id);
    canvasRef.current?.focusNode(node.id);
  }, []);

  const handleSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selected }) => {
    setMultiSelectedIds(selected.map((n) => n.id));
    if (selected.length === 0) {
      setSelectedNode(null);
    } else if (selected.length === 1) {
      const data = selected[0].data as { fsiNode?: FsiNodeRecord };
      if (data.fsiNode) setSelectedNode(data.fsiNode);
    } else {
      setSelectedNode(null);
    }
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!canEdit || multiSelectedIds.length === 0) return;
    deleteNodesBulkMutation.mutate(multiSelectedIds);
  }, [canEdit, multiSelectedIds, deleteNodesBulkMutation]);

  const handleTitleChange = useCallback(
    (nodeId: string, title: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      if (!g) return;
      const node = g.nodes.find((n) => n.id === nodeId);
      if (!node || node.display_title === title) return;
      if (!history.isApplying.current) {
        history.pushEntry({
          type: "node_patch",
          nodeId,
          before: { display_title: node.display_title },
          after: { display_title: title },
        });
      }
      setGraph({
        ...g,
        nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, display_title: title } : n)),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { display_title: title } });
    },
    [canEdit, history, setGraph, updateNodeMutation],
  );

  const handleBodyChange = useCallback(
    (nodeId: string, body: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      if (!g) return;
      const node = g.nodes.find((n) => n.id === nodeId);
      if (!node || (node.raw_body_text ?? "") === body) return;
      if (!history.isApplying.current) {
        history.pushEntry({
          type: "node_patch",
          nodeId,
          before: { raw_body_text: node.raw_body_text ?? "" },
          after: { raw_body_text: body },
        });
      }
      setGraph({
        ...g,
        nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, raw_body_text: body } : n)),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { raw_body_text: body } });
    },
    [canEdit, history, setGraph, updateNodeMutation],
  );

  const handlePayloadChange = useCallback(
    (nodeId: string, key: string, value: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === nodeId);
      if (!node || !g) return;
      const beforePayload = { ...(node.structured_payload ?? {}) };
      const nextPayload = { ...beforePayload, [key]: value };
      if (JSON.stringify(beforePayload) === JSON.stringify(nextPayload)) return;
      if (!history.isApplying.current) {
        history.pushEntry({
          type: "node_patch",
          nodeId,
          before: { structured_payload: beforePayload },
          after: { structured_payload: nextPayload },
        });
      }
      setGraph({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId ? { ...n, structured_payload: nextPayload } : n,
        ),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { structured_payload: nextPayload } });
    },
    [canEdit, history, setGraph, updateNodeMutation],
  );

  const handleNodeDragStart = useCallback((nodeId: string, x: number, y: number) => {
    const node = graphRef.current?.nodes.find((n) => n.id === nodeId);
    dragOriginRef.current.set(
      nodeId,
      node ? { x: node.canvas_x, y: node.canvas_y } : { x, y },
    );
  }, []);

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (!canEdit || !graphRef.current) return;
      const from = dragOriginRef.current.get(nodeId);
      dragOriginRef.current.delete(nodeId);
      if (from && (from.x !== x || from.y !== y) && !history.isApplying.current) {
        history.pushEntry({
          type: "node_move",
          nodeId,
          before: from,
          after: { x, y },
        });
      }
      setGraph(patchGraphNodePositions(graphRef.current, [{ id: nodeId, x, y }]));
      updateNodeMutation.mutate({ id: nodeId, patch: { canvas_x: x, canvas_y: y } });
    },
    [canEdit, history, setGraph, updateNodeMutation],
  );

  if (!studyId) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white gap-4">
        <p>Failed to load study.</p>
        <Button variant="outline" onClick={() => navigate("/fsi-canvas")}>
          Back to studies
        </Button>
      </div>
    );
  }

  const { study, nodes, connections } = graph;
  const canvasNodes = nodes.filter(isCanvasNode);
  const noteCount = canvasNodes.filter(isNoteNode).length;
  const nodeCount = canvasNodes.length - noteCount;
  const nodeTypeOptions = getSuggestedNodeTypes(study.study_type).filter((t) => t !== "Strategist Note");

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-2 pt-14">
        <Button variant="ghost" size="sm" onClick={() => navigate("/fsi-canvas")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Studies
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{study.title}</div>
          <div className="truncate text-xs text-zinc-500">
            {study.study_type} · {study.target_account} · {nodeCount} nodes · {noteCount} notes
          </div>
        </div>
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!history.canUndo}
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="mr-1 h-4 w-4" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!history.canRedo}
              onClick={handleRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="mr-1 h-4 w-4" />
              Redo
            </Button>
          </>
        )}
        {canEdit && (
          <Button
            variant={boxSelectMode ? "default" : "outline"}
            size="sm"
            onClick={() => setBoxSelectMode((v) => !v)}
            title="Draw a box on the canvas to select multiple nodes"
          >
            {boxSelectMode ? (
              <SquareDashedMousePointer className="mr-1 h-4 w-4" />
            ) : (
              <MousePointer2 className="mr-1 h-4 w-4" />
            )}
            {boxSelectMode ? "Box select on" : "Box select"}
          </Button>
        )}
        {canEdit && multiSelectedIds.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-400 border-red-900/50"
            disabled={deleteNodesBulkMutation.isPending}
            onClick={handleDeleteSelected}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete {multiSelectedIds.length}
          </Button>
        )}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={prettifyMutation.isPending}
            onClick={() => prettifyMutation.mutate()}
          >
            <Wand2 className="mr-1 h-4 w-4" />
            Prettify layout
          </Button>
        )}
        {canEdit && (
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-red-400 border-red-900/50">
                <RotateCcw className="mr-1 h-4 w-4" />
                Reset canvas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Reset canvas?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  This deletes all nodes and connections. Study title and metadata are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-zinc-800 text-white border-zinc-700">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <Plus className="mr-1 h-4 w-4" />
                Node
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto bg-zinc-900 border-zinc-700">
              {nodeTypeOptions.map((nodeType) => (
                <DropdownMenuItem
                  key={nodeType}
                  className="cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-white"
                  onClick={() => handleAddSuggestion(nodeType)}
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorForNodeType(nodeType) }}
                  />
                  {nodeType}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={() => addNote("blank")}>
            <Plus className="mr-1 h-4 w-4" />
            Note
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <FsiFlowCanvas
            key={studyId}
            ref={canvasRef}
            studyId={studyId}
            nodes={nodes}
            connections={connections}
            canEdit={canEdit}
            fitTrigger={fitTrigger}
            focusNodeId={focusNodeId}
            selectedNodeId={selectedNode?.id ?? null}
            boxSelectMode={boxSelectMode}
            multiSelectedIds={multiSelectedIds}
            onNodeSelect={setSelectedNode}
            onPaneClick={handleClearSelection}
            onSelectionChange={handleSelectionChange}
            onPaneDoubleClick={(x, y) => addNote("blank", x, y)}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onConnect={(source, target) => createConnectionMutation.mutate({ source, target })}
            onEdgeDelete={handleDeleteConnection}
            onNodeDelete={handleDeleteNode}
            onSuggestionDrop={handleSuggestionDrop}
            onNoteDrop={handleNoteDrop}
            onTitleChange={handleTitleChange}
            onBodyChange={handleBodyChange}
            onPayloadChange={handlePayloadChange}
          />

          {boxSelectMode && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-emerald-700/50 bg-emerald-950/90 px-3 py-1.5 text-xs text-emerald-200">
              Drag on canvas to select · Delete key removes selection · middle-mouse to pan
            </div>
          )}

          {canvasNodes.length === 0 && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950/90 px-4 py-2 text-xs text-zinc-400">
              Drag study nodes or quick notes from the right · double-click for a blank note · connect with handles
            </div>
          )}
        </div>

        <FsiNodeSuggestionsPanel
          study={study}
          canvasNodes={canvasNodes}
          focusedNodeId={selectedNode?.id ?? null}
          canEdit={canEdit}
          onAddSuggestion={handleAddSuggestion}
          onAddNote={handleAddNote}
          onFocusNode={handleFocusNode}
          onDeleteNode={handleDeleteNode}
          onDeleteSelected={handleDeleteSelected}
          selectedCount={multiSelectedIds.length}
        />
      </div>
    </div>
  );
}
