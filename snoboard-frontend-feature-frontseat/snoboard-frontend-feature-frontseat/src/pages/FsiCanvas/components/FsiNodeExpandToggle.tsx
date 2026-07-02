import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
};

export default function FsiNodeExpandToggle({ expanded, onToggle, className }: Props) {
  return (
    <button
      type="button"
      title={expanded ? "Collapse card" : "Expand card"}
      className={cn(
        "nodrag nopan absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded bg-black/15 text-black hover:bg-black/25",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  );
}
