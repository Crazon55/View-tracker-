import { Eye, X } from "lucide-react";
import { getPreviewAs, setPreviewAs } from "@/services/seeding/client";

export function SeedingPreviewBanner() {
  const previewEmail = getPreviewAs();
  if (!previewEmail) return null;

  return (
    <div className="seeding-preview-banner">
      <Eye size={14} className="shrink-0" />
      <span>
        Previewing as <strong>{previewEmail}</strong>
      </span>
      <button type="button" className="seeding-preview-exit" onClick={() => { setPreviewAs(null); window.location.reload(); }}>
        <X size={14} />
        Exit preview
      </button>
    </div>
  );
}
