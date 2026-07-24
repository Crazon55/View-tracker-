import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_TYPE_LABEL_CLASS } from "../lib/fsiWhiteboardTypes";

type Props = {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
};

/**
 * Accordion header that still lets you drag the node.
 * Drag anywhere on the row to move; click (without moving) to expand/collapse.
 */
export default function FsiDragSafeToggle({ label, expanded, onToggle, className }: Props) {
  const originRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      role="button"
      tabIndex={0}
      title={expanded ? `Collapse ${label}` : `Expand ${label}`}
      className={cn(
        "flex h-11 w-full shrink-0 cursor-grab items-center justify-between gap-2 px-3 text-left active:cursor-grabbing hover:bg-black/5",
        className,
      )}
      onPointerDown={(e) => {
        originRef.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        e.stopPropagation();
        const origin = originRef.current;
        originRef.current = null;
        if (origin) {
          const dx = Math.abs(e.clientX - origin.x);
          const dy = Math.abs(e.clientY - origin.y);
          if (dx > 4 || dy > 4) return;
        }
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className={NODE_TYPE_LABEL_CLASS}>{label}</span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        className="nodrag nopan flex h-7 w-7 shrink-0 items-center justify-center rounded text-black/70 hover:bg-black/10"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-150",
            expanded && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}
