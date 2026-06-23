import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/api";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import FsiFlowCanvas from "./components/FsiFlowCanvas";
import NodeTypePicker from "./components/NodeTypePicker";
import NodeInspector from "./components/NodeInspector";
import type { FsiGraph, FsiNodeRecord, IronNodeType } from "./lib/fsiNodeSchemas";
import { defaultPayloadForType, defaultTitleForType } from "./lib/fsiNodeSchemas";

export default function FsiCanvasWorkspace() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = usePermissions();
  const canEdit = canEditFsiCanvas(role);

  const [selectedNode, setSelectedNode] = useState<FsiNodeRecord | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedNodeRef = useRef<FsiNodeRecord | null>(null);
  selectedNodeRef.current = selectedNode;

  useEffect(() => {
    void flushFsiBackendSyncQueue();
  }, []);

  const { data: graph, isLoading, error } = useQuery<FsiGraph>({
    queryKey: ["fsi-graph", studyId],
    queryFn: () => fsiApi.getStudyGraph(studyId!),
    enabled: !!studyId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fsi-graph", studyId] });

  const createNodeMutation = useMutation({
    mutationFn: (args: { type: IronNodeType; x: number; y: number }) =>
      fsiApi.createNode(studyId!, {
        node_type: args.type,
        display_title: defaultTitleForType(args.type),
        canvas_x: args.x,
        canvas_y: args.y,
        structured_payload: defaultPayloadForType(args.type),
      }),
    onSuccess: (node) => {
      invalidate();
      setSelectedNode(node);
      setPicker(null);
      toast.success("Node added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateNodeMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      fsiApi.updateNode(id, patch),
    onSuccess: (node) => {
      setSelectedNode(node);
      queryClient.setQueryData<FsiGraph>(["fsi-graph", studyId], (old) => {
        if (!old) return old;
        return {
          ...old,
          nodes: old.nodes.map((n) => (n.id === node.id ? node : n)),
        };
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

  const handleInspectorChange = useCallback(
    (patch: Partial<FsiNodeRecord>) => {
      const node = selectedNodeRef.current;
      if (!node || !canEdit) return;

      const next: FsiNodeRecord = {
        ...node,
        ...patch,
        structured_payload: patch.structured_payload ?? node.structured_payload,
      };
      setSelectedNode(next);
      selectedNodeRef.current = next;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const current = selectedNodeRef.current;
        if (!current) return;
        updateNodeMutation.mutate({
          id: current.id,
          patch: {
            display_title: current.display_title,
            structured_payload: current.structured_payload,
            raw_body_text: current.raw_body_text,
          },
        });
      }, 500);
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
      flowX: 0,
      flowY: 0,
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
            {study.study_type} · {study.target_account} · {nodes.length} nodes · {connections.length} connections
          </div>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openPickerAtCenter}>
            <Plus className="mr-1 h-4 w-4" />
            Add node
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <FsiFlowCanvas
            nodes={nodes}
            connections={connections}
            canEdit={canEdit}
            selectedNodeId={selectedNode?.id ?? null}
            onNodeSelect={setSelectedNode}
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

        {selectedNode && (
          <div className="w-[340px] shrink-0 border-l border-zinc-800">
            <NodeInspector
              node={selectedNode}
              canEdit={canEdit}
              onChange={handleInspectorChange}
              onDelete={() => deleteNodeMutation.mutate(selectedNode.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
