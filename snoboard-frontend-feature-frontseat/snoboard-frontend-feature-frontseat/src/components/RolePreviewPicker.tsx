// Admin-only "preview as role" entry — a black dropdown in the sidebar footer. Activates
// the existing preview engine (AuthContext.setRolePreview → effectiveRole drives all
// gating). Each team BD (HOOC / AY / OWLED Core / Snoball) is a first-class preview target.
import { useRef, useState } from "react";
import { Eye, ChevronDown, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PREVIEW_ROLES } from "@/lib/accessModel";
import { AnchoredPanel } from "@/components/AnchoredPanel";

const optStyle = (active: boolean): React.CSSProperties => ({
  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12,
  borderRadius: 7, border: "none", cursor: "pointer",
  background: active ? "rgba(139,92,246,.22)" : "transparent",
  color: active ? "#c4b5fd" : "var(--f-ink)",
});

export function RolePreviewPicker() {
  const { canUseRolePreview, isRolePreviewActive, rolePreview, setRolePreview, clearRolePreview } = useAuth();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!canUseRolePreview) return null;

  const current = PREVIEW_ROLES.find((r) => r.key === rolePreview);

  return (
    <div style={{ flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="f-ghost"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, borderRadius: 8, padding: "6px 10px",
          border: "1px solid " + (isRolePreviewActive ? "rgba(245,158,11,.5)" : "var(--f-line)"),
          color: isRolePreviewActive ? "#fcd34d" : "var(--f-dim)",
        }}
        title="Preview the app as another role"
      >
        <Eye size={14} />
        {isRolePreviewActive ? `Previewing: ${current?.short ?? rolePreview}` : "Preview role"}
        <ChevronDown size={12} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        width={260}
        style={{
          background: "#08080a", border: "1px solid var(--f-line)", borderRadius: 10,
          boxShadow: "0 14px 36px -10px rgba(0,0,0,.85)", padding: 4,
        }}
      >
        <div className="f-eyebrow" style={{ padding: "6px 10px 8px" }}>PREVIEW AS ROLE</div>
        {isRolePreviewActive && (
          <button
            type="button"
            onClick={() => { clearRolePreview(); setOpen(false); }}
            style={{ ...optStyle(false), display: "flex", alignItems: "center", gap: 6, color: "#fcd34d", marginBottom: 4 }}
          >
            <X size={13} /> Exit preview (back to my access)
          </button>
        )}
        {PREVIEW_ROLES.map((r) => (
          <button key={r.key} type="button" onClick={() => { setRolePreview(r.key); setOpen(false); }} style={optStyle(rolePreview === r.key)}>
            {r.label}
          </button>
        ))}
      </AnchoredPanel>
    </div>
  );
}
