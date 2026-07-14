// Black custom dropdown of the unified + legacy roles (native <select> renders a
// light OS menu we can't theme). Legacy values map to their label via canonicalRole.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ALL_ROLES, canonicalRole } from "@/lib/accessModel";

const optStyle = (active: boolean): React.CSSProperties => ({
  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12,
  borderRadius: 7, border: "none", cursor: "pointer",
  background: active ? "rgba(139,92,246,.22)" : "transparent",
  color: active ? "#c4b5fd" : "var(--f-ink)",
});

export function RoleSelect({
  value, onChange, disabled, minWidth = 210,
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const exact = value ? value.trim().toLowerCase() : "";
  const matched = ALL_ROLES.find((r) => r.key === exact) ?? ALL_ROLES.find((r) => r.key === canonicalRole(value));
  const activeKey = matched?.key ?? "";
  const label = matched ? matched.label : value || "—";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="fglass-input"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth, padding: "6px 10px", fontSize: 12, borderRadius: 8, opacity: disabled ? 0.6 : 1 }}
      >
        <span style={{ color: matched ? "var(--f-ink)" : "var(--f-dim)" }}>{label}</span>
        <ChevronDown size={13} style={{ opacity: 0.55, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60, minWidth: 230, maxHeight: 320, overflowY: "auto",
            background: "#08080a", border: "1px solid var(--f-line)", borderRadius: 10,
            boxShadow: "0 14px 36px -10px rgba(0,0,0,.85)", padding: 4,
          }}
        >
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={optStyle(!value)}>—</button>
          {ALL_ROLES.map((r) => (
            <button key={r.key} type="button" onClick={() => { onChange(r.key); setOpen(false); }} style={optStyle(activeKey === r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
