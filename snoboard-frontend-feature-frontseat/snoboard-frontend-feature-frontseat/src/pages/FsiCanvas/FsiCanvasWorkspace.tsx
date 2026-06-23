import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { fsiApi } from "@/services/api";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import FsiFlowCanvas from "./components/FsiFlowCanvas";
import NodeTypePicker from "./components/NodeTypePicker";
import NodeInspector from "./components/NodeInspector";
import SummaryPanel from "./components/SummaryPanel";
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
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<Record<string, string | string[]> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInspector = useRef<Partial<FsiNodeRecord> | null>(null);

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
      invalidate();
      setSelectedNode(node);
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

  const flushInspectorSave = useCallback(
    (node: FsiNodeRecord, patch: Partial<FsiNodeRecord>) => {
      if (!canEdit) return;
      const merged = {
        display_title: patch.display_title ?? node.display_title,
        structured_payload: patch.structured_payload ?? node.structured_payload,
        raw_body_text: patch.raw_body_text ?? node.raw_body_text,
      };
      updateNodeMutation.mutate({ id: node.id, patch: merged });
    },
    [canEdit, updateNodeMutation],
  );

  const handleInspectorChange = useCallback(
    (patch: Partial<FsiNodeRecord>) => {
      if (!selectedNode || !canEdit) return;
      const next = { ...selectedNode, ...patch, structured_payload: patch.structured_payload ?? selectedNode.structured_payload };
      setSelectedNode(next);
      pendingInspector.current = patch;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        flushInspectorSave(selectedNode, { ...pendingInspector.current });
        pendingInspector.current = null;
      }, 400);
    },
    [selectedNode, canEdit, flushInspectorSave],
  );

  const handleNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (!canEdit) return;
      updateNodeMutation.mutate({ id: nodeId, patch: { canvas_x: x, canvas_y: y } });
    },
    [canEdit, updateNodeMutation],
  );

  const handleGenerateSummary = async () => {
    if (!studyId) return;
    setSummaryLoading(true);
    try {
      const result = await fsiApi.generateSummary(studyId);
      setSummary(result);
      setShowSummary(true);
      toast.success("Summary generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Summary failed");
    } finally {
      setSummaryLoading(false);
    }
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
  const rightPanel = showSummary ? "summary" : selectedNode ? "inspector" : null;

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
            {study.study_type} · {study.target_account} · {study.status}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <span className="hidden sm:inline text-xs text-zinc-500">Double-click canvas to add node</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowSummary(!showSummary);
              if (!showSummary) setSelectedNode(null);
            }}
          >
            {showSummary ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            Summary
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <FsiFlowCanvas
            nodes={nodes}
            connections={connections}
            canEdit={canEdit}
            selectedNodeId={selectedNode?.id ?? null}
            onNodeSelect={(n) => {
              setSelectedNode(n);
              setShowSummary(false);
            }}
            onPaneDoubleClick={(x, y, screenX, screenY) => {
              setPicker({ x: screenX, y: screenY, flowX: x, flowY: y });
            }}
            onNodeDragStop={handleNodeDragStop}
            onConnect={(source, target) => createConnectionMutation.mutate({ source, target })}
            onEdgeDelete={(id) => deleteConnectionMutation.mutate(id)}
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

        {rightPanel === "inspector" && selectedNode && (
          <div className="w-[340px] shrink-0">
            <NodeInspector
              node={selectedNode}
              canEdit={canEdit}
              onChange={handleInspectorChange}
              onDelete={() => deleteNodeMutation.mutate(selectedNode.id)}
            />
          </div>
        )}

        {rightPanel === "summary" && (
          <div className="w-[360px] shrink-0">
            <SummaryPanel
              onGenerate={handleGenerateSummary}
              loading={summaryLoading}
              summary={summary}
            />
          </div>
        )}
      </div>
    </div>
  );
}
