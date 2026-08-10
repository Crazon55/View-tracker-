import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NODE_BODY_INPUT_CLASS, NODE_TEXT_PLACEHOLDER } from "../lib/fsiNodeCardUi";

type Props = {
  slides: string[];
  canEdit: boolean;
  onChange: (slides: string[]) => void;
};

function normalizeSlides(slides: string[]): string[] {
  return slides.length > 0 ? slides : [""];
}

export default function FsiCarouselSlidesEditor({ slides, canEdit, onChange }: Props) {
  const [draftSlides, setDraftSlides] = useState(() => normalizeSlides(slides));
  const [sel, setSel] = useState(0);
  const isFocusedRef = useRef(false);
  const draftRef = useRef(draftSlides);
  const onChangeRef = useRef(onChange);
  const slidesRef = useRef(slides);

  draftRef.current = draftSlides;
  onChangeRef.current = onChange;
  slidesRef.current = slides;

  useEffect(() => {
    if (isFocusedRef.current) return;
    setDraftSlides(normalizeSlides(slides));
  }, [slides]);

  useEffect(() => {
    setSel((i) => Math.min(i, Math.max(0, normalizeSlides(draftSlides).length - 1)));
  }, [draftSlides.length]);

  useEffect(() => {
    return () => {
      const draft = draftRef.current;
      const prop = normalizeSlides(slidesRef.current);
      if (JSON.stringify(draft) !== JSON.stringify(prop)) {
        onChangeRef.current(draft);
      }
    };
  }, []);

  function commitSlides(next: string[]) {
    const prop = normalizeSlides(slidesRef.current);
    if (JSON.stringify(next) !== JSON.stringify(prop)) {
      onChangeRef.current(next);
    }
  }

  function setSlideText(index: number, text: string) {
    setDraftSlides((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  }

  function addSlide() {
    const next = [...draftSlides, ""];
    setDraftSlides(next);
    commitSlides(next);
    setSel(draftSlides.length);
  }

  const activeIndex = Math.min(sel, draftSlides.length - 1);

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
          {draftSlides.map((_, i) => (
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
        value={draftSlides[activeIndex] ?? ""}
        onChange={(e) => setSlideText(activeIndex, e.target.value)}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          commitSlides(draftRef.current);
        }}
        onPointerDown={(e) => {
          if (document.activeElement === e.currentTarget) e.stopPropagation();
        }}
        onMouseDown={(e) => {
          if (document.activeElement === e.currentTarget) e.stopPropagation();
        }}
        placeholder={NODE_TEXT_PLACEHOLDER}
        className={`${NODE_BODY_INPUT_CLASS} min-h-[80px]`}
      />
    </div>
  );
}
