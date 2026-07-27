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
 * Drag the row to move; click without moving to expand/collapse.
 * Single toggle path (no nested button) so it can't open-then-instantly-close.
 */
export default function FsiDragSafeToggle({ label, expanded, onToggle, className }: Props) {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  const toggledRef = useRef(false);

  const tryToggle = () => {
    if (toggledRef.current) return;
    toggledRef.current = true;
    onToggle();
    window.setTimeout(() => {
      toggledRef.current = false;
    }, 200);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      title={expanded ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={expanded}
      className={cn(
        "flex h-11 w-full shrink-0 cursor-grab items-center justify-between gap-2 px-3 text-left active:cursor-grabbing hover:bg-black/5",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        armedRef.current = true;
        originRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!armedRef.current || e.button !== 0) return;
        armedRef.current = false;
        const origin = originRef.current;
        originRef.current = null;
        if (!origin) return;
        const dx = Math.abs(e.clientX - origin.x);
        const dy = Math.abs(e.clientY - origin.y);
        if (dx > 5 || dy > 5) return;
        e.stopPropagation();
        tryToggle();
      }}
      onPointerCancel={() => {
        armedRef.current = false;
        originRef.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          tryToggle();
        }
      }}
    >
      <span className={NODE_TYPE_LABEL_CLASS}>{label}</span>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-black/70"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-150",
            expanded && "rotate-180",
          )}
        />
      </span>
    </div>
  );
}
