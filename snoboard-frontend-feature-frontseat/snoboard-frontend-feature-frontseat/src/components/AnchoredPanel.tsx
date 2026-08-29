// A dropdown panel that is positioned against a trigger but rendered into
// document.body. Popovers living inside the app sidebar cannot use plain
// `position: absolute`: the sidebar is a 16rem-wide fixed element at z-10, so an
// absolutely-positioned child that is wider than the rail, or that opens downward
// from the footer, ends up off-screen or painted under the page content.
//
// Portalling escapes that stacking context, and the placement logic flips the
// panel above the trigger when there is no room below and clamps it inside the
// viewport horizontally.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
// Below this much free space, opening downward is not worth it and we flip up.
const MIN_USABLE_HEIGHT = 180;

type Placement = {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** The element the panel is positioned against (usually the toggle button). */
  anchorRef: React.RefObject<HTMLElement | null>;
  width: number;
  /** Upper bound on panel height; shrinks further to fit the viewport. */
  maxHeight?: number;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export function AnchoredPanel({
  open,
  onClose,
  anchorRef,
  width,
  maxHeight = 420,
  gap = 6,
  className,
  style,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = anchor.left;
      if (left + width + VIEWPORT_MARGIN > vw) left = vw - width - VIEWPORT_MARGIN;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

      const roomBelow = vh - anchor.bottom - gap - VIEWPORT_MARGIN;
      const roomAbove = anchor.top - gap - VIEWPORT_MARGIN;
      const flipUp = roomBelow < Math.min(maxHeight, MIN_USABLE_HEIGHT) && roomAbove > roomBelow;
      const room = flipUp ? roomAbove : roomBelow;

      setPlacement({
        left,
        // Anchoring by `bottom` when flipped keeps the panel hugging the trigger
        // even when its content is shorter than the space available.
        ...(flipUp ? { bottom: vh - anchor.top + gap } : { top: anchor.bottom + gap }),
        maxHeight: Math.max(MIN_USABLE_HEIGHT, Math.min(maxHeight, room)),
      });
    };

    place();
    window.addEventListener("resize", place);
    // Capture phase so the panel follows the trigger when any ancestor scrolls.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width, maxHeight, gap, anchorRef]);

  useEffect(() => {
    if (!open) return;
    // The panel is no longer a DOM descendant of the trigger, so dismissal has to
    // check both subtrees explicitly.
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !placement) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      style={{
        position: "fixed",
        left: placement.left,
        top: placement.top,
        bottom: placement.bottom,
        width,
        maxHeight: placement.maxHeight,
        overflowY: "auto",
        zIndex: 1000,
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
