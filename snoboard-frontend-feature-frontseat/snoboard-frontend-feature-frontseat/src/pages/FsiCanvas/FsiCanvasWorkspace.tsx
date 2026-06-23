import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
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

export default function FsiCanvasWorkspace() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = usePermissions();
  const canEdit = canEditFsiCanvas(role);

  const [selectedNode, setSelectedNode] = useState<FsiNodeRecord | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
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

      return parent;
    },
    onSuccess: (node) => {
      invalidate();
      setSelectedNode(node);
      setPicker(null);
      toast.success("Parent node added with field sub-children");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNodeMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      fsiApi.updateNode(id, patch),
    onSuccess: () => invalidate(),
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
      const node = graphRef.current?.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      updateNodeMutation.mutate({
        id: nodeId,
        patch: {
          structured_payload: {
            ...(node.structured_payload ?? {}),
            field_value: value,
          },
        },
      });
    },
    [canEdit, updateNodeMutation],
  );

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (!canEdit) return;
      updateNodeMutation.mutate({ id: nodeId, patch: { canvas_x: x, canvas_y: y } });
    },
    [canEdit, updateNodeMutation],
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
            {study.study_type} · {study.target_account} · {parentCount} parents · tree layout
          </div>
        </div>
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
          selectedNodeId={selectedNode?.id ?? null}
          onNodeSelect={setSelectedNode}
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

        <div className="pointer-events-none absolute bottom-4 left-4 max-w-xs rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-500">
          Parent → field sub-children (Godot-style). Connect parent bottoms to other parents for structural children.
        </div>
      </div>
    </div>
  );
}
