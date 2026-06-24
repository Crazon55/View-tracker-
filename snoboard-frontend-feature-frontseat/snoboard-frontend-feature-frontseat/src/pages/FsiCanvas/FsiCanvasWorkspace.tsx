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
import NodeTypePicker from "./components/NodeTypePicker";
import type { FsiGraph, FsiNodeRecord, IronNodeType } from "./lib/fsiNodeSchemas";
import { defaultPayloadForType, defaultTitleForType } from "./lib/fsiNodeSchemas";
import { NODE_FIELD_DEFS } from "./lib/fsiNodeFieldDefs";
import { fieldPayload, isParentNode, parentPayload } from "./lib/fsiHierarchy";
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
  const [expandedParentIds, setExpandedParentIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const graphRef = useRef<FsiGraph | null>(null);

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

  const spawnFieldChildrenMutation = useMutation({
    mutationFn: async (parent: FsiNodeRecord) => {
      const type = parent.node_type as IronNodeType;
      const fieldDefs = NODE_FIELD_DEFS[type];
      if (!fieldDefs?.length) return;

      const payload = parent.structured_payload ?? {};
      const existingKeys = new Set(
        (graphRef.current?.nodes ?? [])
          .filter((n) => n.parent_node_id === parent.id)
          .map((n) => n.structured_payload?.field_key)
          .filter((k): k is string => typeof k === "string"),
      );

      for (const def of fieldDefs) {
        if (existingKeys.has(def.key)) continue;
        const initial =
          def.key === "observation"
            ? String(payload.observation ?? "")
            : String(payload[def.key] ?? "");
        await fsiApi.createNode(studyId!, {
          parent_node_id: parent.id,
          node_type: type,
          display_title: def.label,
          canvas_x: 0,
          canvas_y: 0,
          structured_payload: fieldPayload(
            def.key,
            def.label,
            initial,
            def.inputType ?? "text",
          ),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["fsi-graph", studyId] });
      const fresh = queryClient.getQueryData<FsiGraph>(["fsi-graph", studyId]);
      if (fresh) await applyPrettifyLayout(fresh);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleNodeSelect = useCallback(
    (node: FsiNodeRecord | null) => {
      setSelectedNode(node);

      if (!node) {
        setExpandedParentIds([]);
        return;
      }

      if (!isParentNode(node)) return;

      setExpandedParentIds((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));

      const g = graphRef.current;
      if (!g || !canEdit) return;
      const fieldChildren = g.nodes.filter((n) => n.parent_node_id === node.id);
      if (fieldChildren.length === 0) {
        spawnFieldChildrenMutation.mutate(node);
        return;
      }
      const allAtOrigin = fieldChildren.every((f) => f.canvas_x === 0 && f.canvas_y === 0);
      if (allAtOrigin) void applyPrettifyLayout(g);
    },
    [canEdit, spawnFieldChildrenMutation, applyPrettifyLayout],
  );

  const createNodeMutation = useMutation({
    mutationFn: async (args: { type: IronNodeType; x: number; y: number }) => {
      const defaults = defaultPayloadForType(args.type);
      const parent = await fsiApi.createNode(studyId!, {
        node_type: args.type,
        display_title: defaultTitleForType(args.type),
        canvas_x: args.x,
        canvas_y: args.y,
        structured_payload: parentPayload(defaults),
      });

      const fieldDefs = NODE_FIELD_DEFS[args.type];
      for (const def of fieldDefs) {
        const initial =
          def.key === "observation"
            ? String(defaults.observation ?? "")
            : String(defaults[def.key as keyof typeof defaults] ?? "");
        await fsiApi.createNode(studyId!, {
          parent_node_id: parent.id,
          node_type: args.type,
          display_title: def.label,
          canvas_x: 0,
          canvas_y: 0,
          structured_payload: fieldPayload(
            def.key,
            def.label,
            initial,
            def.inputType ?? "text",
          ),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["fsi-graph", studyId] });
      const fresh = queryClient.getQueryData<FsiGraph>(["fsi-graph", studyId]);
      if (fresh) await applyPrettifyLayout(fresh);

      return parent;
    },
    onSuccess: (node) => {
      setSelectedNode(node);
      setExpandedParentIds((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
      setPicker(null);
      toast.success("Parent node added");
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
    onSuccess: () => {
      setSelectedNode(null);
      invalidate();
      toast.success("Node deleted");
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

      const g = graphRef.current;
      const dragged = g.nodes.find((n) => n.id === nodeId);
      if (!dragged) return;

      const dx = x - dragged.canvas_x;
      const dy = y - dragged.canvas_y;
      const updates: Array<{ id: string; x: number; y: number }> = [{ id: nodeId, x, y }];

      for (const child of g.nodes.filter((n) => n.parent_node_id === nodeId)) {
        updates.push({ id: child.id, x: child.canvas_x + dx, y: child.canvas_y + dy });
      }

      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], patchGraphNodePositions(g, updates));

      for (const u of updates) {
        updateNodeMutation.mutate({ id: u.id, patch: { canvas_x: u.x, canvas_y: u.y } });
      }
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
        {canEdit && selectedNode && isParentNode(selectedNode) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400"
            onClick={() => deleteNodeMutation.mutate(selectedNode.id)}
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

      <div className="relative min-h-0 flex-1">
        <FsiFlowCanvas
          nodes={nodes}
          connections={connections}
          canEdit={canEdit}
          fitTrigger={fitTrigger}
          selectedNodeId={selectedNode?.id ?? null}
          expandedParentIds={expandedParentIds}
          onNodeSelect={handleNodeSelect}
          onFieldChange={handleFieldChange}
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
    </div>
  );
}
