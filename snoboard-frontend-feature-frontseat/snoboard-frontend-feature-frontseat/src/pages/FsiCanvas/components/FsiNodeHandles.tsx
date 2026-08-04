import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  CORNER_IDS,
  cornerHandle,
  type CornerId,
} from "../lib/fsiConnectionAnchors";

type Props = {
  canStartConnection?: boolean;
  largeHitZone?: boolean;
  canAcceptConnection?: boolean;
  requiredAnchors?: string[];
  /** Show visible connection bubbles so users know where to connect. */
  showConnectionDots?: boolean;
};

const CORNER_POSITION: Record<CornerId, Position> = {
  "top-left": Position.Top,
  "top-right": Position.Top,
  "bottom-left": Position.Bottom,
  "bottom-right": Position.Bottom,
};

function cornerStyle(corner: CornerId, sizePx: number): CSSProperties {
  const half = sizePx / 2;
  switch (corner) {
    case "top-left":
      return { left: 0, top: 0, transform: `translate(-${half}px, -${half}px)` };
    case "top-right":
      return { right: 0, top: 0, transform: `translate(${half}px, -${half}px)` };
    case "bottom-left":
      return { left: 0, bottom: 0, transform: `translate(-${half}px, ${half}px)` };
    case "bottom-right":
      return { right: 0, bottom: 0, transform: `translate(${half}px, ${half}px)` };
  }
}

const invisiblePointClass = cn(
  "!z-[30] !h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 !pointer-events-none nodrag nopan",
);

const visibleDotClass = cn(
  "!z-[60] !h-3.5 !w-3.5 !min-h-3.5 !min-w-3.5 !rounded-full !border-2 !border-sky-400 !bg-zinc-950",
  "!opacity-100 !shadow-[0_0_0_2px_rgba(56,189,248,0.3)] nodrag nopan",
  "hover:!scale-125 hover:!border-sky-300 hover:!bg-sky-500/20",
  "transition-transform",
);

const targetHitClass = cn(
  "!z-[55] !h-5 !w-5 !min-h-5 !min-w-5 !rounded-full !border-0 !bg-transparent !opacity-0 nodrag nopan",
);

export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone: _largeHitZone = false,
  canAcceptConnection = false,
  requiredAnchors: _requiredAnchors = [],
  showConnectionDots = false,
}: Props) {
  const targetPointer =
    canAcceptConnection || canStartConnection
      ? "!pointer-events-auto nodrag nopan"
      : "!pointer-events-none";

  return (
    <>
      {CORNER_IDS.map((corner) => {
        const outId = cornerHandle(corner, "out");
        const inId = cornerHandle(corner, "in");
        return (
          <span key={corner} className="contents">
            {/* Invisible target hit zone at each corner */}
            <Handle
              type="target"
              position={CORNER_POSITION[corner]}
              id={inId}
              className={cn(targetHitClass, targetPointer)}
              style={cornerStyle(corner, 20)}
              isConnectable
              isConnectableEnd
              isConnectableStart={false}
            />
            {/* Visible corner dots — only places to start a connection */}
            {showConnectionDots ? (
              <Handle
                type="source"
                position={CORNER_POSITION[corner]}
                id={outId}
                className={cn(
                  visibleDotClass,
                  canStartConnection ? "!pointer-events-auto cursor-crosshair" : "!pointer-events-none",
                )}
                style={cornerStyle(corner, 14)}
                isConnectable={canStartConnection}
                isConnectableStart={canStartConnection}
                title="Drag to connect"
              />
            ) : (
              <Handle
                type="source"
                position={CORNER_POSITION[corner]}
                id={outId}
                className={invisiblePointClass}
                style={cornerStyle(corner, 4)}
                isConnectable={false}
                isConnectableStart={false}
              />
            )}
          </span>
        );
      })}
    </>
  );
}
