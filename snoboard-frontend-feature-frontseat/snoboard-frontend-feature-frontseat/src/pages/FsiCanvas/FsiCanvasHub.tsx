import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Plus, Loader2, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fsiApi, flushFsiBackendSyncQueue } from "@/services/fsiApi";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { canEditFsiCanvas } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { STUDY_TYPES, type FsiStudy } from "./lib/fsiNodeSchemas";

export default function FsiCanvasHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { role } = usePermissions();
  const canEdit = canEditFsiCanvas(role);

  useEffect(() => {
    void flushFsiBackendSyncQueue();
  }, []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    study_type: STUDY_TYPES[0],
    target_account: "",
    niche_vertical: "",
    meta_notes: "",
    execution_date: new Date().toISOString().slice(0, 10),
  });

  const { data: studies = [], isLoading } = useQuery<FsiStudy[]>({
    queryKey: ["fsi-studies"],
    queryFn: () => fsiApi.listStudies(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fsiApi.createStudy({
        title: form.title,
        study_type: form.study_type,
        target_account: form.target_account,
        niche_vertical: form.niche_vertical,
        owner_id: user?.email || "",
        meta_notes: form.meta_notes || undefined,
        execution_date: form.execution_date,
      }),
    onSuccess: (study) => {
      queryClient.invalidateQueries({ queryKey: ["fsi-studies"] });
      setOpen(false);
      setForm({
        title: "",
        study_type: STUDY_TYPES[0],
        target_account: "",
        niche_vertical: "",
        meta_notes: "",
        execution_date: new Date().toISOString().slice(0, 10),
      });
      navigate(`/fsi-canvas/${study.id}`);
      toast.success("Study created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fsiApi.deleteStudy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fsi-studies"] });
      toast.success("Study deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 pt-16 pr-28 sm:pr-36 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wide">Frontseat Intelligence</span>
            </div>
            <h1 className="text-3xl font-bold">FSI Canvas</h1>
            <p className="mt-2 text-zinc-400 max-w-xl">
              Visual canvas for structured content research — every node saves to the database.
            </p>
          </div>

          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Study
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
                <DialogHeader>
                  <DialogTitle>Initialize Study</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Study title</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="101xFounders Deep-Dive Analysis"
                      className="bg-zinc-950 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Study type</Label>
                    <Select value={form.study_type} onValueChange={(v) => setForm({ ...form, study_type: v as typeof form.study_type })}>
                      <SelectTrigger className="bg-zinc-950 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Target benchmark handle</Label>
                    <Input
                      value={form.target_account}
                      onChange={(e) => setForm({ ...form, target_account: e.target.value })}
                      placeholder="@101xfounders"
                      className="bg-zinc-950 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Primary niche / vertical</Label>
                    <Input
                      value={form.niche_vertical}
                      onChange={(e) => setForm({ ...form, niche_vertical: e.target.value })}
                      placeholder="Indian startup founders"
                      className="bg-zinc-950 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Execution date</Label>
                    <Input
                      type="date"
                      value={form.execution_date}
                      onChange={(e) => setForm({ ...form, execution_date: e.target.value })}
                      className="bg-zinc-950 border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-400">Meta notes (optional)</Label>
                    <Textarea
                      value={form.meta_notes}
                      onChange={(e) => setForm({ ...form, meta_notes: e.target.value })}
                      className="bg-zinc-950 border-zinc-700"
                      rows={2}
                    />
                  </div>
                  <Button
                    className="w-full mt-2"
                    disabled={!form.title.trim() || !form.target_account.trim() || !form.niche_vertical.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Open Canvas"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : studies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-12 text-center text-zinc-500">
            No studies yet. {canEdit ? "Create your first study to open the canvas." : "Ask an editor to create a study."}
          </div>
        ) : (
          <div className="space-y-2">
            {studies.map((study) => (
              <div
                key={study.id}
                className="group flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 hover:border-zinc-600"
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => navigate(`/fsi-canvas/${study.id}`)}
                >
                  <div className="font-medium text-white">{study.title}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>{study.study_type}</span>
                    <span>·</span>
                    <span>{study.target_account}</span>
                    <span>·</span>
                    <span>{study.status}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this study and all nodes?")) deleteMutation.mutate(study.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/fsi-canvas/${study.id}`)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
