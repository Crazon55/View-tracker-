import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { SIDES, sideMidHandle, type AnchorSide } from "../lib/fsiConnectionAnchors";

type Props = {
  canStartConnection?: boolean;
  largeHitZone?: boolean;
  canAcceptConnection?: boolean;
  requiredAnchors?: string[];
  /** Show visible Miro-style mid-side connection dots. */
  showConnectionDots?: boolean;
};

const SIDE_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/** Center the port on the card edge so wires meet the border (no floating gap). */
function midSideStyle(side: AnchorSide, sizePx: number): CSSProperties {
  const half = sizePx / 2;
  switch (side) {
    case "top":
      return { left: "50%", top: 0, transform: `translate(-50%, -${half}px)` };
    case "bottom":
      return { left: "50%", bottom: 0, transform: `translate(-50%, ${half}px)` };
    case "left":
      return { top: "50%", left: 0, transform: `translate(-${half}px, -50%)` };
    case "right":
      return { top: "50%", right: 0, transform: `translate(${half}px, -50%)` };
  }
}

const invisiblePointClass = cn(
  "!z-[30] !h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 !pointer-events-none nodrag nopan",
);

/** Big, obvious Miro-style ports — hard to miss. */
const visibleDotClass = cn(
  "!z-[60] !h-5 !w-5 !min-h-5 !min-w-5 !rounded-full",
  "!border-[2.5px] !border-sky-400 !bg-zinc-950",
  "!opacity-100 !shadow-[0_0_0_3px_rgba(56,189,248,0.28)] nodrag nopan",
  "hover:!scale-125 hover:!border-sky-200 hover:!bg-sky-500/30",
  "transition-transform",
);

/** Generous invisible hit pad around each port. */
const hitPadClass = cn(
  "!z-[55] !h-10 !w-10 !min-h-10 !min-w-10 !rounded-full !border-0 !bg-transparent !opacity-0 nodrag nopan",
);

export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone: _largeHitZone = false,
  canAcceptConnection = false,
  requiredAnchors: _requiredAnchors = [],
  showConnectionDots = false,
}: Props) {
  const interactive =
    canAcceptConnection || canStartConnection
      ? "!pointer-events-auto nodrag nopan cursor-crosshair"
      : "!pointer-events-none";

  return (
    <>
      {SIDES.map((side) => {
        const outId = sideMidHandle(side, "out");
        const inId = sideMidHandle(side, "in");
        return (
          <span key={side} className="contents">
            {/* Large target hit pad — drop zone on this side */}
            <Handle
              type="target"
              position={SIDE_POSITION[side]}
              id={inId}
              className={cn(hitPadClass, interactive)}
              style={midSideStyle(side, 40)}
              isConnectable
              isConnectableEnd
              isConnectableStart={false}
            />
            {/* Visible mid-side dot — drag from here to connect */}
            {showConnectionDots ? (
              <Handle
                type="source"
                position={SIDE_POSITION[side]}
                id={outId}
                className={cn(
                  visibleDotClass,
                  canStartConnection ? "!pointer-events-auto cursor-crosshair" : "!pointer-events-none",
                )}
                style={midSideStyle(side, 20)}
                isConnectable={canStartConnection}
                isConnectableStart={canStartConnection}
                title="Drag to connect"
              />
            ) : (
              <Handle
                type="source"
                position={SIDE_POSITION[side]}
                id={outId}
                className={invisiblePointClass}
                style={midSideStyle(side, 4)}
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
