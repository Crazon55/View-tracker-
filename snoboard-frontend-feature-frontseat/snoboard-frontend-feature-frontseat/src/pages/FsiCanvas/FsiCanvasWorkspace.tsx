import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OnSelectionChangeFunc } from "@xyflow/react";
import { ArrowLeft, ChevronDown, Copy, LayoutTemplate, Loader2, Plus, Redo2, RotateCcw, SquareDashedMousePointer, Trash2, Undo2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/fsiApi";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import FsiStudySettingsDialog, { type StudyStatus } from "./components/FsiStudySettingsDialog";
import NodeTypePicker, { type PickerChoice } from "./components/NodeTypePicker";
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
import { SCREENSHOT_NODE_TYPE, screenshotNodePayload } from "./lib/fsiScreenshotNode";
import { NOTE_TEMPLATES } from "./lib/fsiNoteTemplates";
import { getSuggestedNodeTypes } from "./lib/fsiStudyTemplates";
import { clearSavedViewport } from "./lib/fsiViewportStorage";
import { useFsiCanvasHistory } from "./lib/useFsiCanvasHistory";
import { layoutFsiTree } from "./lib/fsiTreeLayout";
import { applyFsiLayoutTemplate } from "./lib/applyFsiLayoutTemplate";
import { layoutTemplatesForStudy } from "./lib/fsiLayoutTemplates";

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
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [pickerAt, setPickerAt] = useState<{
    flowX: number;
    flowY: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const graphRef = useRef<FsiGraph | null>(null);
  const canvasRef = useRef<FsiFlowCanvasHandle>(null);
  const migratedRef = useRef(false);
  const creatingRef = useRef(false);
  const deletingConnectionRef = useRef<Set<string>>(new Set());
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

  const updateStudyMutation = useMutation({
    mutationFn: (patch: {
      title: string;
      study_type: FsiGraph["study"]["study_type"];
      target_account: string;
      niche_vertical: string;
      meta_notes: string;
      execution_date: string;
      status: StudyStatus;
    }) =>
      fsiApi.updateStudy(studyId!, {
        title: patch.title,
        study_type: patch.study_type,
        target_account: patch.target_account,
        niche_vertical: patch.niche_vertical,
        meta_notes: patch.meta_notes || null,
        execution_date: patch.execution_date,
        status: patch.status,
      }),
    onSuccess: (updatedStudy) => {
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], (old) =>
        old ? { ...old, study: { ...old.study, ...updatedStudy } } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["fsi-studies"] });
    },
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

  const duplicateNodeMutation = useMutation({
    mutationFn: (source: FsiNodeRecord) =>
      fsiApi.createNode(studyId!, {
        node_type: source.node_type,
        display_title: source.display_title,
        canvas_x: source.canvas_x + 48,
        canvas_y: source.canvas_y + 48,
        structured_payload: { ...(source.structured_payload ?? {}) },
        raw_body_text: source.raw_body_text ?? undefined,
        tags: source.tags ?? [],
      }),
    onSuccess: appendCreatedNode,
    onError: (e: Error) => toast.error(e.message),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (templateId: string) => {
      const templates = layoutTemplatesForStudy(graphRef.current!.study.study_type);
      const template = templates.find((t) => t.id === templateId);
      if (!template) throw new Error("Layout template not found");
      return applyFsiLayoutTemplate(studyId!, template, fsiApi);
    },
    onSuccess: (nextGraph) => {
      setGraph(nextGraph);
      graphRef.current = nextGraph;
      history.clearHistory();
      setFitTrigger((n) => n + 1);
      toast.success("Layout template applied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createScreenshotMutation = useMutation({
    mutationFn: async ({ files, x, y }: { files: File[]; x: number; y: number }) => {
      const created: FsiNodeRecord[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const node = (await fsiApi.createNode(studyId!, {
          node_type: SCREENSHOT_NODE_TYPE,
          display_title: "Screenshot",
          canvas_x: x + i * 28,
          canvas_y: y + i * 28,
          structured_payload: screenshotNodePayload(""),
        })) as FsiNodeRecord;
        const urls = await fsiApi.uploadNodeScreenshotFiles(studyId!, node.id, [file]);
        const updated = (await fsiApi.updateNode(node.id, {
          structured_payload: screenshotNodePayload(urls[0]!),
        })) as FsiNodeRecord;
        created.push(updated);
      }
      return created;
    },
    onSuccess: (nodes) => {
      for (const node of nodes) {
        appendCreatedNode(node);
      }
      toast.success(`Added ${nodes.length} screenshot${nodes.length === 1 ? "" : "s"}`);
    },
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
    mutationFn: (id: string) => fsiApi.deleteNode(id, studyId!),
    onMutate: (id) => {
      const g = graphRef.current;
      if (!g) return;
      const previous = g;
      setSelectedNode((prev) => (prev?.id === id ? null : prev));
      setGraph({
        ...g,
        nodes: g.nodes.filter((n) => n.id !== id),
        connections: g.connections.filter(
          (c) => c.source_node_id !== id && c.target_node_id !== id,
        ),
      });
      return { previous };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.previous) setGraph(ctx.previous);
      toast.error(e.message);
    },
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
      await Promise.all(ids.map((id) => fsiApi.deleteNode(id, studyId!)));
      return ids;
    },
    onMutate: (ids) => {
      const g = graphRef.current;
      if (!g) return;
      const previous = g;
      const idSet = new Set(ids);
      setSelectedNode((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setMultiSelectedIds([]);
      setGraph({
        ...g,
        nodes: g.nodes.filter((n) => !idSet.has(n.id)),
        connections: g.connections.filter(
          (c) => !idSet.has(c.source_node_id) && !idSet.has(c.target_node_id),
        ),
      });
      return { previous };
    },
    onSuccess: (ids) => {
      toast.success(`Deleted ${ids.length} nodes`);
    },
    onError: (e: Error, _ids, ctx) => {
      if (ctx?.previous) setGraph(ctx.previous);
      toast.error(e.message);
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      fsiApi.createConnection(studyId!, { source_node_id: source, target_node_id: target }),
    onMutate: ({ source, target }) => {
      const g = graphRef.current;
      if (!g) return;
      if (
        g.connections.some(
          (c) => c.source_node_id === source && c.target_node_id === target,
        )
      ) {
        return { skipped: true as const };
      }
      const tempId = `opt-${source}-${target}`;
      const optimistic = {
        id: tempId,
        study_id: studyId!,
        source_node_id: source,
        target_node_id: target,
        edge_label_note: null as string | null,
        created_by: "",
      };
      const previous = g;
      setGraph({ ...g, connections: [...g.connections, optimistic] });
      return { previous, tempId, skipped: false as const };
    },
    onSuccess: (connection, { source, target }, ctx) => {
      if (ctx?.skipped) return;
      const g = graphRef.current;
      if (!g) return;
      const stillWanted = g.connections.some(
        (c) => c.source_node_id === source && c.target_node_id === target,
      );
      if (!stillWanted) {
        void fsiApi.deleteConnection(connection.id, studyId!);
        return;
      }
      setGraph({
        ...g,
        connections: [
          ...g.connections.filter(
            (c) =>
              c.id !== ctx?.tempId &&
              !(c.source_node_id === source && c.target_node_id === target && c.id.startsWith("opt-")),
          ),
          connection,
        ],
      });
      if (!history.isApplying.current) {
        history.pushEntry({ type: "connection_add", connection });
      }
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous && !ctx.skipped) setGraph(ctx.previous);
      toast.error(e.message);
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: (id: string) => {
      if (id.startsWith("opt-")) return Promise.resolve({ id });
      return fsiApi.deleteConnection(id, studyId!);
    },
    onMutate: (id) => {
      const g = graphRef.current;
      if (!g?.connections.some((c) => c.id === id)) return;
      const previous = g;
      setGraph({ ...g, connections: g.connections.filter((c) => c.id !== id) });
      return { previous };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.previous) setGraph(ctx.previous);
      toast.error(e.message);
    },
  });

  const handleConnect = useCallback(
    (source: string, target: string) => {
      const g = graphRef.current;
      if (!g) return;
      if (
        g.connections.some(
          (c) => c.source_node_id === source && c.target_node_id === target,
        )
      ) {
        return;
      }
      createConnectionMutation.mutate({ source, target });
    },
    [createConnectionMutation],
  );
  const handleDeleteConnection = useCallback(
    (id: string) => {
      if (!canEdit || deletingConnectionRef.current.has(id)) return;
      const g = graphRef.current;
      if (!g?.connections.some((c) => c.id === id)) return;

      if (!history.isApplying.current) {
        const connection = g.connections.find((c) => c.id === id);
        if (connection) {
          history.pushEntry({ type: "connection_remove", connection });
        }
      }

      deletingConnectionRef.current.add(id);
      deleteConnectionMutation.mutate(id, {
        onSettled: () => {
          deletingConnectionRef.current.delete(id);
        },
      });
    },
    [canEdit, deleteConnectionMutation, history],
  );

  const handleEdgeLabelChange = useCallback(
    (connectionId: string, label: string) => {
      if (!canEdit || connectionId.startsWith("opt-")) return;
      const g = graphRef.current;
      if (!g) return;
      const existing = g.connections.find((c) => c.id === connectionId);
      if (!existing) return;
      const note = label.trim() || null;
      if ((existing.edge_label_note ?? null) === note) return;
      setGraph({
        ...g,
        connections: g.connections.map((c) =>
          c.id === connectionId ? { ...c, edge_label_note: note } : c,
        ),
      });
      void fsiApi.updateConnection(connectionId, { edge_label_note: note }).catch((e: Error) => {
        toast.error(e.message);
        invalidate();
      });
    },
    [canEdit, setGraph],
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

  const handleScreenshotDrop = useCallback(
    (files: File[], x: number, y: number) => {
      if (!canEdit || files.length === 0 || createScreenshotMutation.isPending) return;
      createScreenshotMutation.mutate({ files, x, y });
    },
    [canEdit, createScreenshotMutation],
  );

  const remindPasteImage = useCallback(() => {
    toast.info("Click the canvas, then paste (Ctrl+V) or drag an image onto it.");
  }, []);

  const addScreenshot = useCallback(
    (x?: number, y?: number) => {
      if (!canEdit) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        const pos = x !== undefined && y !== undefined ? { x, y } : getCanvasCenter();
        handleScreenshotDrop(files, pos.x, pos.y);
      };
      input.click();
    },
    [canEdit, getCanvasCenter, handleScreenshotDrop],
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

  const handlePaneDoubleClick = useCallback(
    (flowX: number, flowY: number, screenX: number, screenY: number) => {
      if (!canEdit) return;
      setPickerAt({ flowX, flowY, screenX, screenY });
    },
    [canEdit],
  );

  const handlePickerSelect = useCallback(
    (choice: PickerChoice) => {
      if (!pickerAt) return;
      const { flowX, flowY } = pickerAt;
      setPickerAt(null);
      if (choice.kind === "node") {
        runCreate(createTypedNodeMutation.mutate, { nodeType: choice.nodeType, x: flowX, y: flowY });
      } else if (choice.kind === "note") {
        runCreate(createNoteMutation.mutate, { noteKey: choice.noteKey, x: flowX, y: flowY });
      } else {
        remindPasteImage();
      }
    },
    [createNoteMutation.mutate, createTypedNodeMutation.mutate, pickerAt, remindPasteImage, runCreate],
  );

  const handleDuplicateNode = useCallback(() => {
    if (!canEdit || !selectedNode || duplicateNodeMutation.isPending) return;
    if (!isCanvasNode(selectedNode)) return;
    duplicateNodeMutation.mutate(selectedNode);
  }, [canEdit, duplicateNodeMutation, selectedNode]);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      const count = graphRef.current?.nodes.filter(isCanvasNode).length ?? 0;
      if (
        count > 0 &&
        !window.confirm(
          "Add this layout template to the canvas? Your existing nodes will stay — new nodes are placed alongside them.",
        )
      ) {
        return;
      }
      applyTemplateMutation.mutate(templateId);
    },
    [applyTemplateMutation],
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateNode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, handleUndo, handleRedo, handleDuplicateNode]);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setMultiSelectedIds([]);
  }, []);

  const handleFocusNode = useCallback((node: FsiNodeRecord) => {
    setSelectedNode(node);
    requestAnimationFrame(() => canvasRef.current?.focusNode(node.id));
  }, []);

  const handleSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selected, edges: selectedEdges }) => {
    if (selectedEdges.length > 0) {
      setMultiSelectedIds([]);
      setSelectedNode(null);
      return;
    }
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

  const handleScreenshotsChange = useCallback(
    (nodeId: string, screenshots: string[]) => {
      if (!canEdit) return;
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === nodeId);
      if (!node || !g) return;
      const beforePayload = { ...(node.structured_payload ?? {}) };
      const nextPayload = { ...beforePayload, screenshots };
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
  const layoutTemplates = layoutTemplatesForStudy(study.study_type);
  const selectionCount = multiSelectedIds.length;
  const canDuplicate =
    !!selectedNode && isCanvasNode(selectedNode) && selectionCount <= 1 && !duplicateNodeMutation.isPending;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 pt-8 pb-0.5">
        <div className="flex h-6 items-center gap-1.5 px-3 pl-12 pr-28 sm:pr-36">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-zinc-400 hover:text-white"
            onClick={() => navigate("/fsi-canvas")}
            title="Back to studies"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden border-l border-zinc-800/60 pl-2">
            <h1 className="truncate text-sm font-semibold text-white" title={study.title}>
              {study.title}
            </h1>
            <span className="hidden truncate text-[10px] text-zinc-500 lg:inline">
              {study.study_type} · {study.target_account} · {study.status}
              {nodeCount > 0 ? ` · ${nodeCount} nodes` : ""}
              {noteCount > 0 ? ` · ${noteCount} notes` : ""}
            </span>
          </div>
        </div>

        <div className="flex justify-center px-3 pl-12 pr-28 sm:pr-36">
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto">
            <FsiStudySettingsDialog
              study={study}
              canEdit={canEdit}
              compact
              saving={updateStudyMutation.isPending}
              onSave={(patch) => updateStudyMutation.mutateAsync(patch)}
            />

            {canEdit && (
              <>
              <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!history.canUndo}
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!history.canRedo}
                onClick={handleRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>

              <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" />

              <Button
                variant={boxSelectMode ? "secondary" : "ghost"}
                size="icon"
                className={cn("h-7 w-7", boxSelectMode && "text-emerald-300")}
                onClick={() => setBoxSelectMode((v) => !v)}
                title={boxSelectMode ? "Box select on — drag to select multiple" : "Box select"}
              >
                <SquareDashedMousePointer className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!canDuplicate}
                onClick={handleDuplicateNode}
                title="Duplicate node (Ctrl+D)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", selectionCount > 0 && "text-red-400 hover:text-red-300")}
                disabled={selectionCount === 0 || deleteNodesBulkMutation.isPending}
                onClick={handleDeleteSelected}
                title={
                  selectionCount > 1
                    ? `Delete ${selectionCount} nodes`
                    : selectionCount === 1
                      ? "Delete node"
                      : "Delete selected"
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>

              <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-7 shrink-0 px-2 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden sm:inline">Add</span>
                    <ChevronDown className="ml-0.5 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-80 w-64 overflow-y-auto bg-zinc-900 border-zinc-700"
                >
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-zinc-500">Nodes</div>
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
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-zinc-500">Notes</div>
                  {NOTE_TEMPLATES.map((t) => (
                    <DropdownMenuItem
                      key={t.key}
                      className="cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-white"
                      onClick={() => handleAddNote(t.key)}
                    >
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-zinc-500">Images</div>
                  <DropdownMenuItem
                    className="cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-white"
                    onClick={remindPasteImage}
                  >
                    Paste on canvas (Ctrl+V)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer text-zinc-200 focus:bg-zinc-800 focus:text-white"
                    onClick={() => addScreenshot()}
                    disabled={createScreenshotMutation.isPending}
                  >
                    Upload from file…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {layoutTemplates.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs">
                      <LayoutTemplate className="h-3.5 w-3.5" />
                      <span className="ml-1 hidden sm:inline">Layout</span>
                      <ChevronDown className="ml-0.5 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-700">
                    {layoutTemplates.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        className="cursor-pointer flex-col items-start text-zinc-200 focus:bg-zinc-800 focus:text-white"
                        onClick={() => handleApplyTemplate(t.id)}
                        disabled={applyTemplateMutation.isPending}
                      >
                        <span className="font-medium">{t.label}</span>
                        <span className="text-[10px] text-zinc-500">{t.description}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={prettifyMutation.isPending}
                onClick={() => prettifyMutation.mutate()}
                title="Prettify layout"
              >
                <Wand2 className="h-3.5 w-3.5" />
              </Button>

              <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400/80 hover:text-red-300"
                    title="Reset canvas"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
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
              </>
            )}
            </div>
          </div>
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
            selectedNodeId={selectedNode?.id ?? null}
            boxSelectMode={boxSelectMode}
            multiSelectedIds={multiSelectedIds}
            onNodeSelect={setSelectedNode}
            onPaneClick={handleClearSelection}
            onSelectionChange={handleSelectionChange}
            onPaneDoubleClick={handlePaneDoubleClick}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onEdgeDelete={handleDeleteConnection}
            onEdgeLabelChange={handleEdgeLabelChange}
            onNodeDelete={handleDeleteNode}
            onSuggestionDrop={handleSuggestionDrop}
            onNoteDrop={handleNoteDrop}
            onScreenshotDrop={handleScreenshotDrop}
            onTitleChange={handleTitleChange}
            onBodyChange={handleBodyChange}
            onPayloadChange={handlePayloadChange}
            onScreenshotsChange={handleScreenshotsChange}
          />

          {boxSelectMode && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-emerald-700/50 bg-emerald-950/90 px-3 py-1.5 text-xs text-emerald-200">
              Drag on canvas to select · Delete key removes selection · middle-mouse to pan
            </div>
          )}

          {canvasNodes.length === 0 && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950/90 px-4 py-2 text-xs text-zinc-400">
              Use Template in the toolbar · double-click to add nodes · paste images on canvas
            </div>
          )}

          {pickerAt && (
            <NodeTypePicker
              screenX={pickerAt.screenX}
              screenY={pickerAt.screenY}
              nodeTypes={nodeTypeOptions}
              onSelect={handlePickerSelect}
              onCancel={() => setPickerAt(null)}
            />
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
