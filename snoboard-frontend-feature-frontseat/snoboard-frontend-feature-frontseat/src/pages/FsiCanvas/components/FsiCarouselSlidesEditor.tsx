import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NODE_BODY_BOX_CLASS } from "../lib/fsiNodeCardUi";

type Props = {
  slides: string[];
  canEdit: boolean;
  onChange: (slides: string[]) => void;
};

export default function FsiCarouselSlidesEditor({ slides, canEdit, onChange }: Props) {
  const safeSlides = slides.length > 0 ? slides : [""];
  const [sel, setSel] = useState(0);

  useEffect(() => {
    setSel((i) => Math.min(i, Math.max(0, safeSlides.length - 1)));
  }, [safeSlides.length]);

  function setSlideText(index: number, text: string) {
    const next = [...safeSlides];
    next[index] = text;
    onChange(next);
  }

  function addSlide() {
    onChange([...safeSlides, ""]);
    setSel(safeSlides.length);
  }

  const activeIndex = Math.min(sel, safeSlides.length - 1);

  return (
    <div className="mt-2 space-y-2 border-t border-black/10 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-black/70">
          Slides content
        </span>
        <select
          value={activeIndex}
          disabled={!canEdit}
          onChange={(e) => setSel(Number(e.target.value))}
          className="nodrag nopan h-7 rounded border border-black/15 bg-black/10 px-2 text-xs text-black"
        >
          {safeSlides.map((_, i) => (
            <option key={i} value={i}>
              Slide {i + 1}
            </option>
          ))}
        </select>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="nodrag nopan h-7 gap-1 px-2 text-xs text-black hover:bg-black/10"
            onClick={addSlide}
          >
            <Plus className="h-3 w-3" />
            Add slide
          </Button>
        )}
      </div>
      <textarea
        rows={4}
        disabled={!canEdit}
        value={safeSlides[activeIndex] ?? ""}
        onChange={(e) => setSlideText(activeIndex, e.target.value)}
        placeholder="Copy for this slide…"
        className={NODE_BODY_BOX_CLASS}
      />
    </div>
  );
}
