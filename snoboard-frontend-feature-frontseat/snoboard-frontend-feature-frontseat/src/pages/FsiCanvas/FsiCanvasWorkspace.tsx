import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OnSelectionChangeFunc } from "@xyflow/react";
import { ArrowLeft, Loader2, MousePointer2, Plus, RotateCcw, SquareDashedMousePointer, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/fsiApi";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
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
  defaultPayloadForType,
  defaultTitleForType,
  notePayload,
} from "./lib/fsiNodeSchemas";
import { isCanvasNode, migrateLegacyFieldNodes } from "./lib/fsiLegacyMigrate";
import { isNoteNode } from "./lib/fsiHierarchy";
import { NOTE_TEMPLATES } from "./lib/fsiNoteTemplates";
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

  const applyPrettifyLayout = useCallback(
    async (sourceGraph: FsiGraph) => {
      const canvasNodes = sourceGraph.nodes.filter(isCanvasNode);
      const positions = layoutFsiTree(canvasNodes, sourceGraph.connections);
      const updates = [...positions.entries()].map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));

      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], patchGraphNodePositions(sourceGraph, updates));

      await Promise.all(
        updates.map(({ id, x, y }) => fsiApi.updateNode(id, { canvas_x: x, canvas_y: y })),
      );

      setFitTrigger((n) => n + 1);
    },
    [queryClient, studyId],
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
      setFitTrigger((n) => n + 1);
      toast.success("Canvas reset");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const appendCreatedNode = useCallback(
    (node: FsiNodeRecord) => {
      setSelectedNode(node);
      setFocusNodeId(node.id);
      const g = graphRef.current;
      if (g) {
        const next = appendGraphNode(g, node);
        queryClient.setQueryData(["fsi-graph", studyId], next);
        graphRef.current = next;
      } else {
        invalidate();
      }
    },
    [queryClient, studyId],
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
        const next = {
          ...g,
          nodes: g.nodes.filter((n) => n.id !== id),
          connections: g.connections.filter(
            (c) => c.source_node_id !== id && c.target_node_id !== id,
          ),
        };
        queryClient.setQueryData(["fsi-graph", studyId], next);
        graphRef.current = next;
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        queryClient.setQueryData(["fsi-graph", studyId], next);
        graphRef.current = next;
      }
      toast.success(`Deleted ${ids.length} nodes`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createConnectionMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      fsiApi.createConnection(studyId!, { source_node_id: source, target_node_id: target }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => fsiApi.deleteConnection(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

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
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], {
        ...g,
        nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, display_title: title } : n)),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { display_title: title } });
    },
    [canEdit, queryClient, studyId, updateNodeMutation],
  );

  const handleBodyChange = useCallback(
    (nodeId: string, body: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      if (!g) return;
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], {
        ...g,
        nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, raw_body_text: body } : n)),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { raw_body_text: body } });
    },
    [canEdit, queryClient, studyId, updateNodeMutation],
  );

  const handlePayloadChange = useCallback(
    (nodeId: string, key: string, value: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === nodeId);
      if (!node || !g) return;
      const nextPayload = { ...(node.structured_payload ?? {}), [key]: value };
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], {
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId ? { ...n, structured_payload: nextPayload } : n,
        ),
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { structured_payload: nextPayload } });
    },
    [canEdit, queryClient, studyId, updateNodeMutation],
  );

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (!canEdit || !graphRef.current) return;
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], (g) => {
        if (!g) return g;
        return patchGraphNodePositions(g, [{ id: nodeId, x, y }]);
      });
      updateNodeMutation.mutate({ id: nodeId, patch: { canvas_x: x, canvas_y: y } });
    },
    [canEdit, queryClient, studyId, updateNodeMutation],
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
          <Button size="sm" onClick={() => addNote("blank")}>
            <Plus className="mr-1 h-4 w-4" />
            Note
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <FsiFlowCanvas
            ref={canvasRef}
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
            onNodeDragStop={handleNodeDragStop}
            onConnect={(source, target) => createConnectionMutation.mutate({ source, target })}
            onEdgeDelete={(id) => deleteConnectionMutation.mutate(id)}
            onNodeDelete={(id) => deleteNodeMutation.mutate(id)}
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
          onDeleteNode={(id) => deleteNodeMutation.mutate(id)}
          onDeleteSelected={handleDeleteSelected}
          selectedCount={multiSelectedIds.length}
        />
      </div>
    </div>
  );
}
