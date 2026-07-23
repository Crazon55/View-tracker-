import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DuplicateCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNERS: { id: DuplicateCorner; className: string }[] = [
  { id: "top-left", className: "-left-3 -top-3" },
  { id: "top-right", className: "-right-3 -top-3" },
  { id: "bottom-left", className: "-bottom-3 -left-3" },
  { id: "bottom-right", className: "-bottom-3 -right-3" },
];

type Props = {
  visible: boolean;
  onCornerClick: (corner: DuplicateCorner) => void;
};

/** Corner "+" affordances on a selected node — click to duplicate. */
export default function FsiNodeDuplicateCorners({ visible, onCornerClick }: Props) {
  if (!visible) return null;

  return (
    <>
      {CORNERS.map(({ id, className }) => (
        <button
          key={id}
          type="button"
          title="Duplicate node…"
          aria-label={`Duplicate from ${id} corner`}
          className={cn(
            "nodrag nopan absolute z-[60] flex h-6 w-6 items-center justify-center rounded-full",
            "border-2 border-sky-300 bg-zinc-950 text-sky-300 shadow-md",
            "hover:border-sky-200 hover:bg-sky-500 hover:text-white",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
            className,
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onCornerClick(id);
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      ))}
    </>
  );
}

export function offsetForDuplicateCorner(corner: DuplicateCorner, distance = 56): { x: number; y: number } {
  switch (corner) {
    case "top-left":
      return { x: -distance, y: -distance };
    case "top-right":
      return { x: distance, y: -distance };
    case "bottom-left":
      return { x: -distance, y: distance };
    case "bottom-right":
      return { x: distance, y: distance };
  }
}
