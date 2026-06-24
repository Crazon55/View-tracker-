import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { FsiNodeRecord } from "../lib/fsiNodeSchemas";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { parseNodeScreenshots, uploadFsiNodeScreenshotFiles } from "../lib/fsiNodeMedia";

type Props = {
  node: FsiNodeRecord;
  canEdit: boolean;
  onChange: (patch: Partial<FsiNodeRecord>) => void;
  onDelete: () => void;
};

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  rows,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
  rows?: number;
}) {
  if (rows) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-zinc-400">{label}</Label>
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={rows}
          className="bg-zinc-900 border-zinc-700 text-sm"
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-900 border-zinc-700 text-sm h-8"
      />
    </div>
  );
}

export default function NodeInspector({ node, canEdit, onChange, onDelete }: Props) {
  const payload = node.structured_payload || {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const screenshots = parseNodeScreenshots(payload);

  const setPayload = (key: string, value: unknown) => {
    onChange({
      structured_payload: { ...payload, [key]: value },
    });
  };

  const setScreenshots = (next: string[]) => {
    setPayload("screenshots", next);
  };

  const addScreenshotFiles = async (files: FileList | File[] | null) => {
    if (!files || !canEdit || uploading) return;
    setUploading(true);
    try {
      const urls = await uploadFsiNodeScreenshotFiles({
        studyId: node.study_id,
        nodeId: node.id,
        files,
      });
      if (urls.length > 0) {
        setScreenshots([...screenshots, ...urls]);
        toast.success(`Uploaded ${urls.length} screenshot${urls.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Screenshot upload failed");
    } finally {
      setUploading(false);
    }
  };

  const numField = (key: string, label: string) => (
    <Field
      label={label}
      type="number"
      value={payload[key] as number | undefined}
      onChange={(v) => setPayload(key, v === "" ? "" : Number(v))}
      disabled={!canEdit}
    />
  );

  return (
    <div className="flex h-full flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <div className="text-xs text-zinc-500">{node.node_type}</div>
          <div className="text-sm font-semibold text-white">Node Inspector</div>
        </div>
        {canEdit && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-red-400 hover:text-red-300">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <Field
          label="Display title"
          value={node.display_title}
          onChange={(v) => onChange({ display_title: v })}
          disabled={!canEdit}
        />

        {node.node_type !== "Strategist Note" && (
          <Field
            label="Content"
            value={node.raw_body_text ?? ""}
            onChange={(v) => onChange({ raw_body_text: v })}
            disabled={!canEdit}
            rows={4}
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-400">Screenshots</Label>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addScreenshotFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-zinc-700 text-xs"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1 h-3.5 w-3.5" />}
                  {uploading ? "Uploading…" : "Add"}
                </Button>
              </>
            )}
          </div>
          {screenshots.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {screenshots.map((src, index) => (
                <div key={`${index}-${src.slice(0, 24)}`} className="group relative overflow-hidden rounded border border-zinc-700">
                  <img src={src} alt={`Screenshot ${index + 1}`} className="block h-24 w-full object-cover" />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setScreenshots(screenshots.filter((_, i) => i !== index))}
                      className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
              No screenshots yet
            </div>
          )}
        </div>

        {node.node_type === "Post Example" && (
          <>
            <Field label="Source URL" value={payload.source_url as string} onChange={(v) => setPayload("source_url", v)} disabled={!canEdit} />
            <Field label="Account handle" value={payload.account_handle as string} onChange={(v) => setPayload("account_handle", v)} disabled={!canEdit} />
            <Field label="Target network" value={payload.target_network as string} onChange={(v) => setPayload("target_network", v)} disabled={!canEdit} />
            <Field label="Format classification" value={payload.format_classification as string} onChange={(v) => setPayload("format_classification", v)} disabled={!canEdit} />
            <div className="space-y-1">
              <Label className="text-xs text-zinc-400">Performance label</Label>
              <Select
                value={(payload.performance_label as string) || "Average"}
                onValueChange={(v) => setPayload("performance_label", v)}
                disabled={!canEdit}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {numField("views", "Views")}
            {numField("likes", "Likes")}
            {numField("shares", "Shares")}
            {numField("saves", "Saves")}
            {numField("comments", "Comments")}
            {numField("follows_gained", "Follows gained")}
            <Field label="Title hook text" value={payload.title_hook_text as string} onChange={(v) => setPayload("title_hook_text", v)} disabled={!canEdit} rows={2} />
            <Field label="Visual intro design" value={payload.visual_intro_design as string} onChange={(v) => setPayload("visual_intro_design", v)} disabled={!canEdit} rows={2} />
            <Field label="Anchor subject matter" value={payload.anchor_subject_matter as string} onChange={(v) => setPayload("anchor_subject_matter", v)} disabled={!canEdit} />
            <Field label="Connected pillar" value={payload.connected_pillar as string} onChange={(v) => setPayload("connected_pillar", v)} disabled={!canEdit} />
            <Field label="Target bucket" value={payload.target_bucket as string} onChange={(v) => setPayload("target_bucket", v)} disabled={!canEdit} />
            <Field label="Hook structural grouping" value={payload.hook_structural_grouping as string} onChange={(v) => setPayload("hook_structural_grouping", v)} disabled={!canEdit} />
            <Field label="Graphic style tags" value={payload.graphic_style_tags as string} onChange={(v) => setPayload("graphic_style_tags", v)} disabled={!canEdit} />
            <Field label="Strategist observation" value={payload.strategist_observation_note as string} onChange={(v) => setPayload("strategist_observation_note", v)} disabled={!canEdit} rows={3} />
          </>
        )}

        {node.node_type === "Hook Pattern" && (
          <>
            <Field label="Title descriptor" value={payload.title_descriptor as string} onChange={(v) => setPayload("title_descriptor", v)} disabled={!canEdit} />
            <Field label="Structural group type" value={payload.structural_group_type as string} onChange={(v) => setPayload("structural_group_type", v)} disabled={!canEdit} />
            <Field label="Raw archetype template" value={payload.raw_archetype_template as string} onChange={(v) => setPayload("raw_archetype_template", v)} disabled={!canEdit} rows={3} />
            <Field label="Emotional ingestion variable" value={payload.emotional_ingestion_variable as string} onChange={(v) => setPayload("emotional_ingestion_variable", v)} disabled={!canEdit} />
            <Field label="Curiosity gap mechanism" value={payload.curiosity_gap_mechanism as string} onChange={(v) => setPayload("curiosity_gap_mechanism", v)} disabled={!canEdit} rows={2} />
            <Field label="Target demographic profile" value={payload.target_demographic_profile as string} onChange={(v) => setPayload("target_demographic_profile", v)} disabled={!canEdit} />
            <Field label="Operational rules" value={payload.operational_rules as string} onChange={(v) => setPayload("operational_rules", v)} disabled={!canEdit} rows={3} />
            <Field label="Reference post URLs" value={payload.representative_post_reference_urls as string} onChange={(v) => setPayload("representative_post_reference_urls", v)} disabled={!canEdit} rows={2} />
            <Field label="Strategist observation" value={payload.strategist_observation_note as string} onChange={(v) => setPayload("strategist_observation_note", v)} disabled={!canEdit} rows={3} />
          </>
        )}

        {node.node_type === "Strategist Note" && (
          <Field
            label="Observation"
            value={(payload.observation as string) || node.raw_body_text || ""}
            onChange={(v) => {
              onChange({
                structured_payload: { ...payload, observation: v },
                raw_body_text: v,
              });
            }}
            disabled={!canEdit}
            rows={8}
          />
        )}
      </div>
    </div>
  );
}
