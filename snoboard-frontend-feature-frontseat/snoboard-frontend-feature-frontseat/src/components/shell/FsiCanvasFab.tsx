// Floating FSI Canvas button (bottom-right — bottom-left is the collapsible
// sidebar's own footer controls now, and its width varies as it collapses/expands).
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function FsiCanvasFab() {
  return (
    <Link
      to="/fsi-canvas"
      title="FSI Canvas"
      className={cn(
        "fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5",
        "bg-gradient-to-br from-[#5b3a1a] to-[#7a4d22] text-[#f5e6d0]",
        "text-sm font-bold no-underline",
        "shadow-lg shadow-black/50",
        "transition-[box-shadow,transform,filter] duration-200 ease-out",
        "hover:shadow-[0_0_24px_6px_rgba(245,166,35,0.45),0_12px_28px_-8px_rgba(0,0,0,0.65)]",
        "hover:brightness-110 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70",
      )}
    >
      <Sparkles size={16} /> FSI Canvas
    </Link>
  );
}
