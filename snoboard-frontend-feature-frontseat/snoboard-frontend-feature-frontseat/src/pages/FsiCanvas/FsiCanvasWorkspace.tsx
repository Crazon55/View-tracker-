import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OnSelectionChangeFunc } from "@xyflow/react";
import { ArrowLeft, Copy, Loader2, Moon, Redo2, RotateCcw, SquareDashedMousePointer, Sun, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
import FsiLeftToolbar from "./components/FsiLeftToolbar";
import FsiAiAssistant from "./components/FsiAiAssistant";
import type { FsiChatMessage } from "./lib/fsiAiChat";
import { buildGraphSnapshot } from "./lib/fsiGraphSnapshot";
import FsiStudySettingsDialog, { type StudyStatus } from "./components/FsiStudySettingsDialog";
import NodeTypePicker, { type PickerChoice } from "./components/NodeTypePicker";
import type { NodeSuggestionPayload, NoteSuggestionPayload } from "./components/FsiNodeSuggestionsPanel";
import {
  offsetForDuplicateCorner,
  type DuplicateCorner,
} from "./components/FsiNodeDuplicateCorners";
import type { FsiGraph, FsiNodeRecord } from "./lib/fsiNodeSchemas";
import { appendGraphNode } from "./lib/fsiNodeSchemas";
import { isCanvasNode, migrateLegacyFieldNodes } from "./lib/fsiLegacyMigrate";
import { isNoteNode } from "./lib/fsiHierarchy";
import { screenshotNodePayload } from "./lib/fsiScreenshotNode";
import { clearSavedViewport } from "./lib/fsiViewportStorage";
import {
  loadCanvasTheme,
  saveCanvasTheme,
  toggleCanvasTheme,
  type FsiCanvasTheme,
} from "./lib/fsiCanvasTheme";
import {
  specForWhiteboardType,
  isFrameNode,
  WHITEBOARD_NODE_TYPES,
  type CreateNodeSpec,
  type WhiteboardNodeType,
} from "./lib/fsiWhiteboardTypes";
import { boundsForNodes } from "./lib/fsiNodeBounds";
import { connectionEndpointsKey, isSameConnectionEndpoints } from "./lib/fsiConnectionUtils";
import { useFsiCanvasHistory } from "./lib/useFsiCanvasHistory";

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
  const [boxSelectMode, setBoxSelectMode] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [canvasTheme, setCanvasTheme] = useState<FsiCanvasTheme>(() => loadCanvasTheme());
  const [pickerAt, setPickerAt] = useState<{
    flowX: number;
    flowY: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const graphRef = useRef<FsiGraph | null>(null);
  const canvasRef = useRef<FsiFlowCanvasHandle>(null);
  /** Snapshot selection on Frame pointer-down before toolbar click clears highlights. */
  const frameSelectionRef = useRef<string[]>([]);
  const selectionSnapshotRef = useRef<string[]>([]);
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

  const generateSummaryMutation = useMutation({
    mutationFn: () => {
      const snapshot = buildGraphSnapshot(graphRef.current ?? undefined);
      return fsiApi.generateStudySummary(studyId!, snapshot);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const handleGenerateSummary = useCallback(async () => {
    return generateSummaryMutation.mutateAsync();
  }, [generateSummaryMutation]);

  const chatMutation = useMutation({
    mutationFn: ({ message, history }: { message: string; history: FsiChatMessage[] }) => {
      const snapshot = buildGraphSnapshot(graphRef.current ?? undefined);
      return fsiApi.chatStudy(
        studyId!,
        message,
        history.map((m) => ({ role: m.role, content: m.content })),
        snapshot,
      );
    },
  });

  const handleSendChat = useCallback(
    async (message: string, history: FsiChatMessage[]) => {
      return chatMutation.mutateAsync({ message, history });
    },
    [chatMutation],
  );

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

  /** Add frame and parent selected nodes immediately; persist parent_node_id in background. */
  const applyFrameWrap = useCallback(
    (frameNode: FsiNodeRecord, childIds: string[]) => {
      const g = graphRef.current;
      if (!g) {
        appendCreatedNode(frameNode);
        return;
      }

      const childSet = new Set(childIds);
      const hasFrame = g.nodes.some((n) => n.id === frameNode.id);
      const nextNodes = [
        ...(hasFrame ? g.nodes : [...g.nodes, frameNode]).map((n) =>
          childSet.has(n.id) ? { ...n, parent_node_id: frameNode.id } : n,
        ),
      ];

      if (!history.isApplying.current) {
        history.pushEntry({ type: "node_add", node: frameNode });
      }
      setSelectedNode(frameNode);
      setMultiSelectedIds([]);
      setGraph({ ...g, nodes: nextNodes });

      void Promise.all(
        childIds.map((id) => fsiApi.updateNode(id, { parent_node_id: frameNode.id })),
      ).catch((e) => {
        toast.error(e instanceof Error ? e.message : "Could not save frame parentage");
      });

      toast.success(`Framed ${childIds.length} node${childIds.length === 1 ? "" : "s"}`);
    },
    [appendCreatedNode, history, setGraph],
  );

  const createWhiteboardNodeMutation = useMutation({
    mutationFn: ({
      type,
      x,
      y,
      overrides,
    }: {
      type: WhiteboardNodeType;
      x: number;
      y: number;
      overrides?: Partial<CreateNodeSpec>;
      wrapChildIds?: string[];
    }) => {
      const base = specForWhiteboardType(type);
      const spec = { ...base, ...overrides, structured_payload: overrides?.structured_payload ?? base.structured_payload };
      return fsiApi.createNode(studyId!, {
        node_type: spec.node_type,
        display_title: spec.display_title,
        canvas_x: x,
        canvas_y: y,
        structured_payload: spec.structured_payload,
        raw_body_text: spec.raw_body_text,
      });
    },
    onSuccess: (node, variables) => {
      if (variables.wrapChildIds?.length) {
        applyFrameWrap(node as FsiNodeRecord, variables.wrapChildIds);
      } else {
        appendCreatedNode(node as FsiNodeRecord);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateNodeMutation = useMutation({
    mutationFn: ({
      source,
      offsetX = 48,
      offsetY = 48,
    }: {
      source: FsiNodeRecord;
      offsetX?: number;
      offsetY?: number;
    }) =>
      fsiApi.createNode(studyId!, {
        node_type: source.node_type,
        display_title: source.display_title,
        canvas_x: source.canvas_x + offsetX,
        canvas_y: source.canvas_y + offsetY,
        structured_payload: { ...(source.structured_payload ?? {}) },
        raw_body_text: source.raw_body_text ?? undefined,
        tags: source.tags ?? [],
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  const appendDuplicatedNodes = useCallback(
    (created: FsiNodeRecord[]) => {
      if (created.length === 0) return;
      const g = graphRef.current;
      if (!g) {
        for (const node of created) appendCreatedNode(node);
        return;
      }
      if (!history.isApplying.current) {
        for (const node of created) {
          history.pushEntry({ type: "node_add", node });
        }
      }
      let next = g;
      for (const node of created) {
        next = appendGraphNode(next, node);
      }
      setGraph(next);
    },
    [appendCreatedNode, history, setGraph],
  );

  const createScreenshotMutation = useMutation({
    mutationFn: async ({
      files,
      x,
      y,
    }: {
      files: File[];
      x: number;
      y: number;
    }) => {
      // Parallel per-file pipeline: create → upload (compressed) → persist URL.
      return Promise.all(
        files.map(async (file, i) => {
          const node = (await fsiApi.createNode(studyId!, {
            node_type: "Visual",
            display_title: "Visual",
            canvas_x: x + i * 28,
            canvas_y: y + i * 28,
            structured_payload: screenshotNodePayload(""),
          })) as FsiNodeRecord;
          const urls = await fsiApi.uploadNodeScreenshotFiles(studyId!, node.id, [file]);
          return (await fsiApi.updateNode(node.id, {
            structured_payload: screenshotNodePayload(urls[0]!),
          })) as FsiNodeRecord;
        }),
      );
    },
    onMutate: ({ files, x, y }) => {
      const blobUrls = files.map((f) => URL.createObjectURL(f));
      const tempIds = files.map(() => `temp-ss-${crypto.randomUUID()}`);
      const g = graphRef.current;
      if (g) {
        let next = g;
        for (let i = 0; i < files.length; i++) {
          const tempNode: FsiNodeRecord = {
            id: tempIds[i]!,
            study_id: studyId!,
            node_type: "Visual",
            display_title: "Visual",
            canvas_x: x + i * 28,
            canvas_y: y + i * 28,
            structured_payload: screenshotNodePayload(blobUrls[i]!),
            created_by: "",
          };
          next = appendGraphNode(next, tempNode);
        }
        setGraph(next);
        setSelectedNode({
          id: tempIds[tempIds.length - 1]!,
          study_id: studyId!,
          node_type: "Visual",
          display_title: "Visual",
          canvas_x: x + (files.length - 1) * 28,
          canvas_y: y + (files.length - 1) * 28,
          structured_payload: screenshotNodePayload(blobUrls[blobUrls.length - 1]!),
          created_by: "",
        });
      }
      return { tempIds, blobUrls };
    },
    onSuccess: (nodes, _vars, ctx) => {
      const tempIds = new Set(ctx?.tempIds ?? []);
      for (const url of ctx?.blobUrls ?? []) URL.revokeObjectURL(url);

      const g = graphRef.current;
      if (g && tempIds.size > 0) {
        let next: FsiGraph = {
          ...g,
          nodes: g.nodes.filter((n) => !tempIds.has(n.id)),
        };
        for (const node of nodes) {
          if (!history.isApplying.current) {
            history.pushEntry({ type: "node_add", node });
          }
          next = appendGraphNode(next, node);
        }
        setGraph(next);
        if (nodes.length) setSelectedNode(nodes[nodes.length - 1]!);
      } else {
        for (const node of nodes) appendCreatedNode(node);
      }
      toast.success(`Added ${nodes.length} screenshot${nodes.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error, _vars, ctx) => {
      for (const url of ctx?.blobUrls ?? []) URL.revokeObjectURL(url);
      const tempIds = new Set(ctx?.tempIds ?? []);
      if (tempIds.size > 0) {
        const g = graphRef.current;
        if (g) {
          setGraph({ ...g, nodes: g.nodes.filter((n) => !tempIds.has(n.id)) });
        }
        setSelectedNode((prev) => (prev && tempIds.has(prev.id) ? null : prev));
      }
      toast.error(e.message);
    },
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
    mutationFn: ({
      source,
      target,
      sourceHandle,
      targetHandle,
    }: {
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }) =>
      fsiApi.createConnection(studyId!, {
        source_node_id: source,
        target_node_id: target,
        source_handle: sourceHandle ?? undefined,
        target_handle: targetHandle ?? undefined,
      }),
    onMutate: ({ source, target, sourceHandle, targetHandle }) => {
      const g = graphRef.current;
      if (!g) return;
      const endpoints = { source, target, sourceHandle, targetHandle };
      if (
        g.connections.some((c) =>
          isSameConnectionEndpoints(endpoints, {
            source: c.source_node_id,
            target: c.target_node_id,
            sourceHandle: c.source_handle,
            targetHandle: c.target_handle,
          }),
        )
      ) {
        return { skipped: true as const };
      }
      const tempId = `opt-${connectionEndpointsKey(endpoints)}`;
      const optimistic = {
        id: tempId,
        study_id: studyId!,
        source_node_id: source,
        target_node_id: target,
        edge_label_note: null as string | null,
        source_handle: sourceHandle ?? null,
        target_handle: targetHandle ?? null,
        created_by: "",
      };
      const previous = g;
      setGraph({ ...g, connections: [...g.connections, optimistic] });
      return { previous, tempId, skipped: false as const };
    },
    onSuccess: (connection, { source, target, sourceHandle, targetHandle }, ctx) => {
      if (ctx?.skipped) return;
      const g = graphRef.current;
      if (!g) return;
      const endpoints = { source, target, sourceHandle, targetHandle };
      const stillWanted = g.connections.some(
        (c) =>
          c.id === ctx?.tempId ||
          isSameConnectionEndpoints(endpoints, {
            source: c.source_node_id,
            target: c.target_node_id,
            sourceHandle: c.source_handle,
            targetHandle: c.target_handle,
          }),
      );
      if (!stillWanted) {
        void fsiApi.deleteConnection(connection.id, studyId!);
        return;
      }
      const withHandles = {
        ...connection,
        source_handle: connection.source_handle ?? sourceHandle ?? null,
        target_handle: connection.target_handle ?? targetHandle ?? null,
      };
      setGraph({
        ...g,
        connections: [
          ...g.connections.filter(
            (c) =>
              c.id !== ctx?.tempId &&
              !(
                c.id.startsWith("opt-") &&
                isSameConnectionEndpoints(endpoints, {
                  source: c.source_node_id,
                  target: c.target_node_id,
                  sourceHandle: c.source_handle,
                  targetHandle: c.target_handle,
                })
              ),
          ),
          withHandles,
        ],
      });
      if (!history.isApplying.current) {
        history.pushEntry({ type: "connection_add", connection: withHandles });
      }
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous && !ctx.skipped) setGraph(ctx.previous);
      toast.error(e.message);
    },
  });

  const selectDuplicatedNodes = useCallback((createdIds: string[]) => {
    if (createdIds.length === 0) return;
    canvasRef.current?.selectNodeIds(createdIds);
  }, []);

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
    (
      source: string,
      target: string,
      sourceHandle?: string | null,
      targetHandle?: string | null,
    ) => {
      const g = graphRef.current;
      if (!g) return;
      const endpoints = { source, target, sourceHandle, targetHandle };
      if (
        g.connections.some((c) =>
          isSameConnectionEndpoints(endpoints, {
            source: c.source_node_id,
            target: c.target_node_id,
            sourceHandle: c.source_handle,
            targetHandle: c.target_handle,
          }),
        )
      ) {
        return;
      }
      createConnectionMutation.mutate({ source, target, sourceHandle, targetHandle });
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

  const runCreateWhiteboard = useCallback(
    (type: WhiteboardNodeType, x: number, y: number) => {
      if (!canEdit || creatingRef.current || createWhiteboardNodeMutation.isPending) return;
      creatingRef.current = true;
      createWhiteboardNodeMutation.mutate(
        { type, x, y },
        {
          onSettled: () => {
            creatingRef.current = false;
          },
        },
      );
    },
    [canEdit, createWhiteboardNodeMutation],
  );

  const handleScreenshotDrop = useCallback(
    (files: File[], x: number, y: number) => {
      if (!canEdit || files.length === 0 || createScreenshotMutation.isPending) return;
      createScreenshotMutation.mutate({ files, x, y });
    },
    [canEdit, createScreenshotMutation],
  );

  const captureFrameSelection = useCallback(() => {
    const live = canvasRef.current?.getSelectedNodeIds() ?? [];
    const snapshot = selectionSnapshotRef.current;
    frameSelectionRef.current =
      live.length > 0
        ? live
        : snapshot.length > 0
          ? snapshot
          : multiSelectedIds.length > 0
            ? multiSelectedIds
            : selectedNode
              ? [selectedNode.id]
              : [];
  }, [multiSelectedIds, selectedNode]);

  const resolveFrameTargetIds = useCallback(() => {
    const live = canvasRef.current?.getSelectedNodeIds() ?? [];
    const captured = frameSelectionRef.current;
    const merged = [
      ...new Set([
        ...captured,
        ...live,
        ...selectionSnapshotRef.current,
        ...multiSelectedIds,
        ...(selectedNode ? [selectedNode.id] : []),
      ]),
    ];
    return merged.length > 0 ? merged : captured;
  }, [multiSelectedIds, selectedNode]);

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

  const handleAddWhiteboardTool = useCallback(
    (type: WhiteboardNodeType) => {
      if (type === "Visual") {
        const pos = getCanvasCenter();
        addScreenshot(pos.x, pos.y);
        return;
      }

      if (type === "Frame") {
        const g = graphRef.current;
        const ids = resolveFrameTargetIds();
        if (g && ids.length > 0) {
          const wrapTargets = g.nodes.filter(
            (n) => ids.includes(n.id) && isCanvasNode(n) && !isFrameNode(n),
          );
          const childIds = wrapTargets.map((n) => n.id);
          const bounds =
            canvasRef.current?.getBoundsForNodeIds(childIds) ?? boundsForNodes(wrapTargets);
          if (bounds && wrapTargets.length > 0) {
            frameSelectionRef.current = [];
            if (creatingRef.current || createWhiteboardNodeMutation.isPending) return;
            const frameCount = g.nodes.filter(isFrameNode).length;
            creatingRef.current = true;
            createWhiteboardNodeMutation.mutate(
              {
                type: "Frame",
                x: bounds.x,
                y: bounds.y,
                wrapChildIds: childIds,
                overrides: {
                  display_title: `Frame ${frameCount + 1}`,
                  structured_payload: {
                    is_frame: true,
                    frame_width: Math.round(bounds.width),
                    frame_height: Math.round(bounds.height),
                  },
                },
              },
              {
                onSettled: () => {
                  creatingRef.current = false;
                },
              },
            );
            return;
          }
        }
        toast.message("Select nodes on the canvas first, then click Frame to wrap them.");
        return;
      }

      const pos = getCanvasCenter();
      runCreateWhiteboard(type, pos.x, pos.y);
    },
    [
      addScreenshot,
      createWhiteboardNodeMutation,
      getCanvasCenter,
      resolveFrameTargetIds,
      runCreateWhiteboard,
    ],
  );

  const handleWhiteboardDrop = useCallback(
    (nodeType: string, x: number, y: number) => {
      if (nodeType === "Visual") {
        addScreenshot(x, y);
        return;
      }
      runCreateWhiteboard(nodeType as WhiteboardNodeType, x, y);
    },
    [addScreenshot, runCreateWhiteboard],
  );

  const handleSuggestionDrop = useCallback(
    (payload: NodeSuggestionPayload, x: number, y: number) => {
      runCreateWhiteboard(payload.nodeType as WhiteboardNodeType, x, y);
    },
    [runCreateWhiteboard],
  );

  const handleNoteDrop = useCallback(
    (_payload: NoteSuggestionPayload, x: number, y: number) => {
      runCreateWhiteboard("Sticky Note", x, y);
    },
    [runCreateWhiteboard],
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
        runCreateWhiteboard(choice.nodeType as WhiteboardNodeType, flowX, flowY);
      } else if (choice.kind === "note") {
        runCreateWhiteboard("Sticky Note", flowX, flowY);
      } else {
        addScreenshot(flowX, flowY);
      }
    },
    [addScreenshot, pickerAt, runCreateWhiteboard],
  );

  const handleDuplicateSelection = useCallback(async () => {
    if (!canEdit || duplicateNodeMutation.isPending) return;
    const g = graphRef.current;
    if (!g) return;

    const live = canvasRef.current?.getSelectedNodeIds() ?? [];
    const ids =
      live.length > 0
        ? live
        : multiSelectedIds.length > 0
          ? multiSelectedIds
          : selectedNode
            ? [selectedNode.id]
            : [];
    const sources = g.nodes.filter((n) => ids.includes(n.id) && isCanvasNode(n));
    if (sources.length === 0) return;

    const created: FsiNodeRecord[] = [];
    for (const source of sources) {
      created.push((await duplicateNodeMutation.mutateAsync({ source })) as FsiNodeRecord);
    }
    appendDuplicatedNodes(created);
    selectDuplicatedNodes(created.map((n) => n.id));
    if (sources.length > 1) {
      toast.success(`Duplicated ${sources.length} nodes`);
    } else {
      toast.success("Node duplicated");
    }
  }, [
    appendDuplicatedNodes,
    canEdit,
    duplicateNodeMutation,
    multiSelectedIds,
    selectDuplicatedNodes,
    selectedNode,
  ]);

  const handleRequestDuplicate = useCallback(
    async (nodeId: string, corner: DuplicateCorner) => {
      if (!canEdit || duplicateBusy) return;
      const g = graphRef.current;
      if (!g) return;

      const live = canvasRef.current?.getSelectedNodeIds() ?? [];
      const selectionIds =
        live.length > 1 && live.includes(nodeId)
          ? live
          : multiSelectedIds.length > 1 && multiSelectedIds.includes(nodeId)
            ? multiSelectedIds
            : [nodeId];
      const sources = g.nodes.filter((n) => selectionIds.includes(n.id) && isCanvasNode(n));
      if (sources.length === 0) return;

      const offset = offsetForDuplicateCorner(corner);
      setDuplicateBusy(true);
      try {
        const created: FsiNodeRecord[] = [];
        for (const source of sources) {
          created.push(
            (await duplicateNodeMutation.mutateAsync({
              source,
              offsetX: offset.x,
              offsetY: offset.y,
            })) as FsiNodeRecord,
          );
        }
        appendDuplicatedNodes(created);
        selectDuplicatedNodes(created.map((n) => n.id));
        toast.success(
          sources.length > 1 ? `Duplicated ${sources.length} nodes` : "Node duplicated",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Duplicate failed");
      } finally {
        setDuplicateBusy(false);
      }
    },
    [
      appendDuplicatedNodes,
      canEdit,
      duplicateBusy,
      duplicateNodeMutation,
      multiSelectedIds,
      selectDuplicatedNodes,
    ],
  );

  const handleDeleteSelection = useCallback(() => {
    if (!canEdit) return;
    const g = graphRef.current;
    if (!g) return;

    const live = canvasRef.current?.getSelectedNodeIds() ?? [];
    const ids = (
      live.length > 0
        ? live
        : multiSelectedIds.length > 0
          ? multiSelectedIds
          : selectedNode
            ? [selectedNode.id]
            : []
    ).filter((id) => {
      const node = g.nodes.find((n) => n.id === id);
      return node && isCanvasNode(node);
    });

    if (ids.length === 0) return;
    if (ids.length === 1) {
      handleDeleteNode(ids[0]!);
      return;
    }
    if (!window.confirm(`Delete ${ids.length} selected nodes?`)) return;
    deleteNodesBulkMutation.mutate(ids);
  }, [canEdit, deleteNodesBulkMutation, handleDeleteNode, multiSelectedIds, selectedNode]);

  const handleUndo = useCallback(() => {
    void history.undo(graphRef.current, setGraph);
  }, [history, setGraph]);

  const handleRedo = useCallback(() => {
    void history.redo(graphRef.current, setGraph);
  }, [history, setGraph]);

  const handleSelectAllNodes = useCallback(() => {
    canvasRef.current?.selectAllNodes();
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    const isEditable = (el: Element | null) =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      // Never hijack keys while a text field is focused — check both the event target
      // and the active element (focus can differ from the keydown target). This keeps
      // Ctrl+A / Backspace / typing working inside node fields instead of the canvas.
      if (isEditable(e.target as Element | null) || isEditable(document.activeElement)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAllNodes();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      const key = e.key.toLowerCase();
      if (((e.ctrlKey || e.metaKey) && key === "d") || (e.shiftKey && key === "d" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        void handleDuplicateSelection();
        return;
      }
      if (key === "backspace" || key === "delete") {
        e.preventDefault();
        handleDeleteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, handleUndo, handleRedo, handleDuplicateSelection, handleDeleteSelection, handleSelectAllNodes]);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setMultiSelectedIds([]);
  }, []);

  const handleSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selected, edges: selectedEdges }) => {
    if (selectedEdges.length > 0) {
      selectionSnapshotRef.current = [];
      setMultiSelectedIds([]);
      setSelectedNode(null);
      return;
    }
    const ids = selected.map((n) => n.id);
    selectionSnapshotRef.current = ids;
    setMultiSelectedIds(ids);
    if (selected.length > 0) {
      canvasRef.current?.focusCanvas();
    }
    if (selected.length === 0) {
      setSelectedNode(null);
    } else if (selected.length === 1) {
      const data = selected[0].data as { fsiNode?: FsiNodeRecord };
      if (data.fsiNode) setSelectedNode(data.fsiNode);
    } else {
      setSelectedNode(null);
    }
  }, []);

  const handleDeleteSelected = handleDeleteSelection;

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

  const handleStructuredPayloadPatch = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!canEdit) return;
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === nodeId);
      if (!node || !g) return;
      const beforePayload = { ...(node.structured_payload ?? {}) };
      const nextPayload = { ...beforePayload, ...patch };
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

  const handleNodeDragStart = useCallback((moves: Array<{ id: string; x: number; y: number }>) => {
    const g = graphRef.current;
    for (const m of moves) {
      const node = g?.nodes.find((n) => n.id === m.id);
      dragOriginRef.current.set(
        m.id,
        node ? { x: node.canvas_x, y: node.canvas_y } : { x: m.x, y: m.y },
      );
    }
  }, []);

  const handleNodeDragStop = useCallback(
    (moves: Array<{ id: string; x: number; y: number }>) => {
      if (!canEdit || !graphRef.current || moves.length === 0) return;
      const g = graphRef.current;

      const updates: Array<{ id: string; x: number; y: number }> = [];
      const seen = new Set<string>();
      const historyMoves: Array<{
        nodeId: string;
        before: { x: number; y: number };
        after: { x: number; y: number };
      }> = [];

      for (const m of moves) {
        const node = g.nodes.find((n) => n.id === m.id);
        if (!node) continue;

        const from = dragOriginRef.current.get(m.id) ?? {
          x: node.canvas_x ?? 0,
          y: node.canvas_y ?? 0,
        };
        dragOriginRef.current.delete(m.id);

        const prevX = node.canvas_x ?? 0;
        const prevY = node.canvas_y ?? 0;
        const dx = m.x - prevX;
        const dy = m.y - prevY;

        if (!seen.has(m.id)) {
          updates.push({ id: m.id, x: m.x, y: m.y });
          seen.add(m.id);
          if (m.x !== prevX || m.y !== prevY) {
            historyMoves.push({ nodeId: m.id, before: from, after: { x: m.x, y: m.y } });
          }
        }

        if (isFrameNode(node) && (dx !== 0 || dy !== 0)) {
          for (const child of g.nodes.filter((n) => n.parent_node_id === m.id)) {
            if (seen.has(child.id)) continue;
            const childFrom = {
              x: child.canvas_x ?? 0,
              y: child.canvas_y ?? 0,
            };
            const childTo = { x: childFrom.x + dx, y: childFrom.y + dy };
            updates.push({ id: child.id, x: childTo.x, y: childTo.y });
            seen.add(child.id);
            historyMoves.push({ nodeId: child.id, before: childFrom, after: childTo });
          }
        }
      }

      const moved = updates.some((u) => {
        const n = g.nodes.find((x) => x.id === u.id);
        return n && (n.canvas_x !== u.x || n.canvas_y !== u.y);
      });
      if (!moved) return;

      if (!history.isApplying.current) {
        if (historyMoves.length === 1) {
          const only = historyMoves[0]!;
          history.pushEntry({
            type: "node_move",
            nodeId: only.nodeId,
            before: only.before,
            after: only.after,
          });
        } else if (historyMoves.length > 1) {
          history.pushEntry({ type: "batch_move", moves: historyMoves });
        }
      }

      const roundedUpdates = updates.map((u) => ({
        ...u,
        x: Math.round(u.x),
        y: Math.round(u.y),
      }));
      setGraph(patchGraphNodePositions(g, roundedUpdates));
      for (const u of roundedUpdates) {
        updateNodeMutation.mutate({ id: u.id, patch: { canvas_x: u.x, canvas_y: u.y } });
      }
    },
    [canEdit, history, setGraph, updateNodeMutation],
  );

  const handleToggleCanvasTheme = useCallback(() => {
    setCanvasTheme((current) => {
      const next = toggleCanvasTheme(current);
      saveCanvasTheme(next);
      return next;
    });
  }, []);

  const hasCanvasSelection = useMemo(() => {
    const nodeList = graph?.nodes ?? [];
    if (multiSelectedIds.length > 0) {
      return multiSelectedIds.some((id) => {
        const n = nodeList.find((x) => x.id === id);
        return n && isCanvasNode(n);
      });
    }
    return !!selectedNode && isCanvasNode(selectedNode);
  }, [multiSelectedIds, graph?.nodes, selectedNode]);

  const canDuplicate = hasCanvasSelection && !duplicateNodeMutation.isPending;
  const canDeleteSelection = hasCanvasSelection && !deleteNodesBulkMutation.isPending;

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
  const selectionCount = multiSelectedIds.length;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 pt-2 pb-0.5">
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
              {study.target_account || "Whiteboard"}
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

            <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-800" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleToggleCanvasTheme}
              title={canvasTheme === "dark" ? "Light canvas" : "Dark canvas"}
            >
              {canvasTheme === "dark" ? (
                <Sun className="h-3.5 w-3.5 text-amber-300" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </Button>

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
                  onClick={() => void handleDuplicateSelection()}
                  title="Duplicate selection (Ctrl+D or Shift+D)"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", hasCanvasSelection && "text-red-400 hover:text-red-300")}
                  disabled={!canDeleteSelection}
                  onClick={handleDeleteSelected}
                  title={
                    selectionCount > 1
                      ? `Delete ${selectionCount} nodes (Backspace)`
                      : hasCanvasSelection
                        ? "Delete node (Backspace)"
                        : "Delete selected"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
        <FsiLeftToolbar
          canEdit={canEdit}
          canvasTheme={canvasTheme}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onAddTool={handleAddWhiteboardTool}
          onCaptureFrameSelection={captureFrameSelection}
          onUploadImage={() => addScreenshot()}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
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
            onWhiteboardDrop={handleWhiteboardDrop}
            onTitleChange={handleTitleChange}
            onBodyChange={handleBodyChange}
            onPayloadChange={handlePayloadChange}
            onStructuredPayloadPatch={handleStructuredPayloadPatch}
            onScreenshotsChange={handleScreenshotsChange}
            onRequestDuplicate={handleRequestDuplicate}
            canvasTheme={canvasTheme}
          />

          {boxSelectMode && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-emerald-700/50 bg-emerald-950/90 px-3 py-1.5 text-xs text-emerald-200">
              Drag on canvas to select · Delete key removes selection · middle-mouse to pan
            </div>
          )}

          {canvasNodes.length === 0 && (
            <div
              className={cn(
                "pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border px-4 py-2 text-xs",
                canvasTheme === "dark"
                  ? "border-zinc-700 bg-zinc-950/90 text-zinc-400"
                  : "border-zinc-300 bg-white/90 text-zinc-600",
              )}
            >
              Drag tools from the left · select a node to connect · double-click to add
            </div>
          )}

          {pickerAt && (
            <NodeTypePicker
              screenX={pickerAt.screenX}
              screenY={pickerAt.screenY}
              nodeTypes={WHITEBOARD_NODE_TYPES}
              onSelect={handlePickerSelect}
              onCancel={() => setPickerAt(null)}
            />
          )}

          <FsiAiAssistant
            studyId={studyId!}
            open={aiOpen}
            onOpenChange={setAiOpen}
            onGenerateSummary={handleGenerateSummary}
            onSendMessage={handleSendChat}
            summaryLoading={generateSummaryMutation.isPending}
            chatLoading={chatMutation.isPending}
            canvasNodeCount={canvasNodes.length}
            connectionCount={connections.length}
          />
        </div>
      </div>
    </div>
  );
}
