import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STUDY_TYPES, type FsiStudy } from "../lib/fsiNodeSchemas";

export const STUDY_STATUSES = ["Draft", "Completed", "Approved"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

type Props = {
  study: FsiStudy;
  canEdit: boolean;
  saving?: boolean;
  compact?: boolean;
  onSave: (patch: {
    title: string;
    study_type: FsiStudy["study_type"];
    target_account: string;
    niche_vertical: string;
    meta_notes: string;
    execution_date: string;
    status: StudyStatus;
  }) => Promise<void>;
};

export default function FsiStudySettingsDialog({ study, canEdit, saving, compact, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: study.title,
    study_type: study.study_type,
    target_account: study.target_account,
    niche_vertical: study.niche_vertical,
    meta_notes: study.meta_notes ?? "",
    execution_date: study.execution_date?.slice(0, 10) ?? "",
    status: (STUDY_STATUSES.includes(study.status as StudyStatus)
      ? study.status
      : "Draft") as StudyStatus,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: study.title,
      study_type: study.study_type,
      target_account: study.target_account,
      niche_vertical: study.niche_vertical,
      meta_notes: study.meta_notes ?? "",
      execution_date: study.execution_date?.slice(0, 10) ?? "",
      status: (STUDY_STATUSES.includes(study.status as StudyStatus)
        ? study.status
        : "Draft") as StudyStatus,
    });
  }, [open, study]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.target_account.trim() || !form.niche_vertical.trim()) {
      toast.error("Title, target account, and niche are required");
      return;
    }
    try {
      await onSave({
        title: form.title.trim(),
        study_type: form.study_type,
        target_account: form.target_account.trim(),
        niche_vertical: form.niche_vertical.trim(),
        meta_notes: form.meta_notes.trim(),
        execution_date: form.execution_date || new Date().toISOString().slice(0, 10),
        status: form.status,
      });
      setOpen(false);
      toast.success("Study updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update study");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-zinc-400 hover:text-white"
            title="Study settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0">
            <Settings2 className="mr-1 h-4 w-4" />
            Study
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md bg-zinc-900 border-zinc-700 text-white">
        <DialogHeader>
          <DialogTitle>Study settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500">Owner</span>
              <div className="truncate text-zinc-200">{study.owner_id || "—"}</div>
            </div>
            <div>
              <span className="text-zinc-500">Created</span>
              <div className="text-zinc-200">
                {study.created_at ? new Date(study.created_at).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Status</Label>
            <Select
              value={form.status}
              disabled={!canEdit}
              onValueChange={(v) => setForm({ ...form, status: v as StudyStatus })}
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Study title</Label>
            <Input
              value={form.title}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Study type</Label>
            <Select
              value={form.study_type}
              disabled={!canEdit}
              onValueChange={(v) =>
                setForm({ ...form, study_type: v as FsiStudy["study_type"] })
              }
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Target benchmark handle</Label>
            <Input
              value={form.target_account}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, target_account: e.target.value })}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Primary niche / vertical</Label>
            <Input
              value={form.niche_vertical}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, niche_vertical: e.target.value })}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Execution date</Label>
            <Input
              type="date"
              value={form.execution_date}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, execution_date: e.target.value })}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-zinc-400">Meta notes</Label>
            <Textarea
              value={form.meta_notes}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, meta_notes: e.target.value })}
              className="bg-zinc-950 border-zinc-700"
              rows={2}
            />
          </div>

          {canEdit && (
            <Button className="w-full mt-1" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save study"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
