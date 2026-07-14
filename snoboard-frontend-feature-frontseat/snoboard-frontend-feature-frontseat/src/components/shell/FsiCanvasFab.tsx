// Floating FSI Canvas button (bottom-left) — per whiteboard.
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function FsiCanvasFab() {
  return (
    <Link
      to="/fsi-canvas"
      title="FSI Canvas"
      style={{
        position: "fixed", left: 20, bottom: 20, zIndex: 45,
        display: "flex", alignItems: "center", gap: 8,
        background: "linear-gradient(135deg,#5b3a1a,#7a4d22)", color: "#f5e6d0",
        padding: "12px 18px", borderRadius: 999, fontWeight: 700, fontSize: 14,
        textDecoration: "none", border: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 14px 34px -12px rgba(0,0,0,.7)",
      }}
    >
      <Sparkles size={16} /> FSI Canvas
    </Link>
  );
}
