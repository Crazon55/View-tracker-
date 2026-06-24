import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/api";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import FsiFlowCanvas from "./components/FsiFlowCanvas";
import FsiPropertyPalette from "./components/FsiPropertyPalette";
import type { FieldDragPayload } from "./components/FsiPropertyPalette";
import NodeTypePicker from "./components/NodeTypePicker";
import type { FsiGraph, FsiNodeRecord, IronNodeType } from "./lib/fsiNodeSchemas";
import { defaultPayloadForType, defaultTitleForType } from "./lib/fsiNodeSchemas";
import { fieldPayload, isFieldNode, isParentNode, parentPayload } from "./lib/fsiHierarchy";
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

export default function FsiCanvasWorkspace() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = usePermissions();
  const canEdit = canEditFsiCanvas(role);

  const [selectedNode, setSelectedNode] = useState<FsiNodeRecord | null>(null);
  const [activeParent, setActiveParent] = useState<FsiNodeRecord | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const graphRef = useRef<FsiGraph | null>(null);
  const activeParentRef = useRef<FsiNodeRecord | null>(null);
  activeParentRef.current = activeParent;

  useEffect(() => {
    void flushFsiBackendSyncQueue();
  }, []);

  const { data: graph, isLoading, error } = useQuery<FsiGraph>({
    queryKey: ["fsi-graph", studyId],
    queryFn: () => fsiApi.getStudyGraph(studyId!),
    enabled: !!studyId,
  });

  graphRef.current = graph ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fsi-graph", studyId] });

  const applyPrettifyLayout = useCallback(
    async (sourceGraph: FsiGraph) => {
      const positions = layoutFsiTree(sourceGraph.nodes, sourceGraph.connections);
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

  const createNodeMutation = useMutation({
    mutationFn: async (args: { type: IronNodeType; x: number; y: number }) => {
      return fsiApi.createNode(studyId!, {
        node_type: args.type,
        display_title: defaultTitleForType(args.type),
        canvas_x: args.x,
        canvas_y: args.y,
        structured_payload: parentPayload(defaultPayloadForType(args.type)),
      });
    },
    onSuccess: (node) => {
      setSelectedNode(node);
      setActiveParent(node);
      setPicker(null);
      invalidate();
      toast.success("Parent node added — drag properties from the right panel");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const placeFieldMutation = useMutation({
    mutationFn: async (args: { parent: FsiNodeRecord; field: FieldDragPayload; x: number; y: number }) => {
      const payload = args.parent.structured_payload ?? {};
      const initial =
        args.field.fieldKey === "observation"
          ? String(payload.observation ?? "")
          : String(payload[args.field.fieldKey] ?? "");

      return fsiApi.createNode(studyId!, {
        parent_node_id: args.parent.id,
        node_type: args.parent.node_type,
        display_title: args.field.label,
        canvas_x: args.x,
        canvas_y: args.y,
        structured_payload: fieldPayload(
          args.field.fieldKey,
          args.field.label,
          initial,
          args.field.inputType ?? "text",
          true,
        ),
      });
    },
    onSuccess: (node) => {
      setSelectedNode(node);
      invalidate();
      toast.success("Property placed — connect it to the parent with handles");
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
    mutationFn: (id: string) => fsiApi.deleteNode(id),
    onSuccess: (_, id) => {
      setSelectedNode((prev) => (prev?.id === id ? null : prev));
      if (activeParentRef.current?.id === id) setActiveParent(null);
      invalidate();
      const node = graphRef.current?.nodes.find((n) => n.id === id);
      if (node && isFieldNode(node)) toast.success("Property removed from canvas");
      else toast.success("Node deleted");
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

  const handleParentSelect = useCallback((node: FsiNodeRecord) => {
    setActiveParent(node);
  }, []);

  const handleFieldDrop = useCallback(
    (x: number, y: number, field: FieldDragPayload) => {
      const parent = activeParentRef.current;
      if (!parent) {
        toast.error("Select a parent node first to place its properties");
        return;
      }
      placeFieldMutation.mutate({ parent, field, x, y });
    },
    [placeFieldMutation],
  );

  const handleDeleteField = useCallback(
    (nodeId: string) => deleteNodeMutation.mutate(nodeId),
    [deleteNodeMutation],
  );

  const handleFieldChange = useCallback(
    (nodeId: string, value: string) => {
      if (!canEdit) return;
      const g = graphRef.current;
      const node = g?.nodes.find((n) => n.id === nodeId);
      if (!node || !g) return;

      const nextPayload = { ...(node.structured_payload ?? {}), field_value: value };
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], {
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId ? { ...n, structured_payload: nextPayload } : n,
        ),
      });

      updateNodeMutation.mutate({
        id: nodeId,
        patch: { structured_payload: nextPayload },
      });
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

  const openPickerAtCenter = () => {
    setPicker({
      x: window.innerWidth / 2 - 112,
      y: window.innerHeight / 2 - 80,
      flowX: 40,
      flowY: 40,
    });
  };

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
        <Button variant="outline" onClick={() => navigate("/fsi-canvas")}>Back to studies</Button>
      </div>
    );
  }

  const { study, nodes, connections } = graph;
  const parentCount = nodes.filter(isParentNode).length;
  const activeParentFields = activeParent
    ? nodes.filter((n) => n.parent_node_id === activeParent.id && isFieldNode(n))
    : [];

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
            {study.study_type} · {study.target_account} · {parentCount} parents
          </div>
        </div>
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
        {canEdit && activeParent && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400"
            onClick={() => deleteNodeMutation.mutate(activeParent.id)}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete parent
          </Button>
        )}
        {canEdit && (
          <Button size="sm" onClick={openPickerAtCenter}>
            <Plus className="mr-1 h-4 w-4" />
            Add parent
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <FsiFlowCanvas
            nodes={nodes}
            connections={connections}
            canEdit={canEdit}
            fitTrigger={fitTrigger}
            selectedNodeId={selectedNode?.id ?? null}
            onNodeSelect={setSelectedNode}
            onParentSelect={handleParentSelect}
            onFieldChange={handleFieldChange}
            onFieldDrop={handleFieldDrop}
            onPaneDoubleClick={(x, y, screenX, screenY) => {
              if (!canEdit) return;
              setPicker({ x: screenX + 12, y: screenY + 12, flowX: x, flowY: y });
            }}
            onNodeDragStop={handleNodeDragStop}
            onConnect={(source, target) => createConnectionMutation.mutate({ source, target })}
            onEdgeDelete={(id) => deleteConnectionMutation.mutate(id)}
            onNodeDelete={(id) => deleteNodeMutation.mutate(id)}
          />

          {picker && canEdit && (
            <NodeTypePicker
              x={picker.x}
              y={picker.y}
              onCancel={() => setPicker(null)}
              onSelect={(type) => createNodeMutation.mutate({ type, x: picker.flowX, y: picker.flowY })}
            />
          )}
        </div>

        {activeParent && (
          <FsiPropertyPalette
            parent={activeParent}
            fieldNodes={activeParentFields}
            canEdit={canEdit}
            onClose={() => setActiveParent(null)}
            onDeleteField={handleDeleteField}
          />
        )}
      </div>
    </div>
  );
}
