import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { FsiLinkifiedText } from "../lib/fsiLinkText";
import { clipboardImageFiles } from "../lib/fsiScreenshotNode";
import { uploadFsiNodeScreenshotFiles } from "../lib/fsiNodeMedia";

type ContentBlockProps = {
  label?: string;
  value: string;
  canEdit: boolean;
  editing: boolean;
  placeholder: string;
  inputClass: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onImagePaste?: (files: File[]) => void;
};

export function FsiNodeContentBlock({
  label = "Content",
  value,
  canEdit,
  editing,
  placeholder,
  inputClass,
  onChange,
  onCommit,
  onImagePaste,
}: ContentBlockProps) {
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!editing || !canEdit || !onImagePaste) return;
      const files = clipboardImageFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      onImagePaste(files);
    },
    [canEdit, editing, onImagePaste],
  );

  if (!value && !editing) return null;

  return (
    <div onPaste={handlePaste}>
      <label className="mb-0.5 block text-[9px] font-semibold uppercase text-emerald-950/70">{label}</label>
      {editing ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <div className={`${inputClass} min-h-[2.5rem] whitespace-pre-wrap`}>
          <FsiLinkifiedText text={value} />
        </div>
      )}
    </div>
  );
}

type ScreenshotsBlockProps = {
  studyId: string;
  nodeId: string;
  uploader?: string;
  screenshots: string[];
  canEdit: boolean;
  editing: boolean;
  inputClass: string;
  onChange: (screenshots: string[]) => void;
};

export function FsiNodeScreenshotsBlock({
  studyId,
  nodeId,
  uploader,
  screenshots,
  canEdit,
  editing,
  inputClass,
  onChange,
}: ScreenshotsBlockProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || !canEdit || uploading) return;
      setUploading(true);
      try {
        const urls = await uploadFsiNodeScreenshotFiles({ studyId, nodeId, files, uploader });
        if (urls.length === 0) return;
        onChange([...screenshots, ...urls]);
        toast.success(`Uploaded ${urls.length} screenshot${urls.length === 1 ? "" : "s"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Screenshot upload failed");
      } finally {
        setUploading(false);
      }
    },
    [canEdit, nodeId, onChange, screenshots, studyId, uploader, uploading],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!editing || !canEdit || uploading) return;
      const imageFiles = clipboardImageFiles(e.clipboardData);
      if (imageFiles.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      void addFiles(imageFiles);
    },
    [addFiles, canEdit, editing, uploading],
  );

  if (screenshots.length === 0 && !editing) return null;

  return (
    <div onPaste={handlePaste}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[9px] font-semibold uppercase text-emerald-950/70">Screenshots</label>
        {editing && canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              title="Add screenshot"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="nodrag nopan inline-flex items-center gap-1 rounded border border-emerald-900/40 bg-emerald-950/30 px-1.5 py-0.5 text-[9px] font-medium text-emerald-950 hover:bg-emerald-950/50 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
              {uploading ? "Uploading…" : "Add"}
            </button>
          </>
        )}
      </div>

      {screenshots.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {screenshots.map((src, index) => (
            <div
              key={`${index}-${src.slice(0, 32)}`}
              className="group relative overflow-hidden rounded border border-emerald-900/30 bg-emerald-950/20"
            >
              <img src={src} alt={`Screenshot ${index + 1}`} className="block h-20 w-full object-cover" />
              {editing && canEdit && (
                <button
                  type="button"
                  title="Remove screenshot"
                  disabled={uploading}
                  onClick={() => onChange(screenshots.filter((_, i) => i !== index))}
                  className="nodrag nopan absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : editing ? (
        <div className={`${inputClass} text-[10px] text-emerald-950/60`}>
          Paste a screenshot or click Add (saved to Cloudinary)
        </div>
      ) : null}

      {editing && canEdit && screenshots.length > 0 && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => onChange([])}
          className="nodrag nopan mt-1 inline-flex items-center gap-1 text-[9px] text-emerald-950/70 hover:text-emerald-950 disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  );
}
