import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  parseAnchorHandle,
  type AnchorKind,
  type AnchorSide,
} from "../lib/fsiConnectionAnchors";

const SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

const SIDE_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const ANCHOR_PCTS = Array.from({ length: 21 }, (_, i) => i * 5);

type Props = {
  canStartConnection?: boolean;
  largeHitZone?: boolean;
  canAcceptConnection?: boolean;
  requiredAnchors?: string[];
  /** Show visible connection bubbles (selected, hovered, or while connecting). */
  showConnectionDots?: boolean;
};

function anchorPointStyle(side: AnchorSide, pct: number): CSSProperties {
  switch (side) {
    case "top":
      return { left: `${pct}%`, top: 0, transform: "translate(-50%, -50%)" };
    case "bottom":
      return { left: `${pct}%`, bottom: 0, transform: "translate(-50%, 50%)" };
    case "left":
      return { top: `${pct}%`, left: 0, transform: "translate(-50%, -50%)" };
    case "right":
      return { top: `${pct}%`, right: 0, transform: "translate(50%, -50%)" };
    default:
      return {};
  }
}

function edgeStripStyle(side: AnchorSide, large: boolean): CSSProperties {
  const thickness = large ? 14 : 8;
  switch (side) {
    case "top":
      return { left: "0%", width: "100%", height: thickness, top: 0, transform: "translateY(-50%)" };
    case "bottom":
      return { left: "0%", width: "100%", height: thickness, bottom: 0, transform: "translateY(50%)" };
    case "left":
      return { top: "0%", height: "100%", width: thickness, left: 0, transform: "translateX(-50%)" };
    case "right":
      return { top: "0%", height: "100%", width: thickness, right: 0, transform: "translateX(50%)" };
    default:
      return {};
  }
}

const stripClass = cn(
  "!z-[50] !border-0 !bg-transparent !opacity-0 !rounded-none",
);
const pointClass = cn(
  "!z-[30] !h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 !pointer-events-none nodrag nopan",
);
const visibleDotClass = cn(
  "!z-[40] !h-3 !w-3 !min-h-0 !min-w-0 !rounded-full !border-2 !border-zinc-300 !bg-zinc-800 !opacity-100 nodrag nopan pointer-events-none",
);

function collectAnchorIds(requiredAnchors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const id of requiredAnchors) {
    if (parseAnchorHandle(id)) ids.add(id);
  }
  for (const side of SIDES) {
    for (const pct of ANCHOR_PCTS) {
      ids.add(`${side}-in-${pct}`);
      ids.add(`${side}-out-${pct}`);
    }
  }
  return ids;
}

export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone = false,
  canAcceptConnection = false,
  requiredAnchors = [],
  showConnectionDots = false,
}: Props) {
  const sourcePointer = canStartConnection
    ? "!pointer-events-auto nodrag nopan"
    : "!pointer-events-none";
  const targetPointer = canAcceptConnection
    ? "!pointer-events-auto nodrag nopan"
    : "!pointer-events-none";
  const anchorIds = collectAnchorIds(requiredAnchors);

  return (
    <>
      {Array.from(anchorIds).map((id) => {
        const meta = parseAnchorHandle(id);
        if (!meta) return null;
        const isOut = meta.kind === "out";
        return (
          <Handle
            key={id}
            type={isOut ? "source" : "target"}
            position={SIDE_POSITION[meta.side]}
            id={id}
            className={pointClass}
            style={anchorPointStyle(meta.side, meta.pct)}
            isConnectable={isOut ? canStartConnection : true}
            isConnectableStart={isOut ? canStartConnection : undefined}
            isConnectableEnd={!isOut}
          />
        );
      })}
      {showConnectionDots
        ? SIDES.map((side) => (
            <Handle
              key={`dot-${side}`}
              type="source"
              position={SIDE_POSITION[side]}
              id={`${side}-out-50`}
              className={cn(
                visibleDotClass,
                canStartConnection ? "!pointer-events-auto cursor-crosshair" : "!pointer-events-none",
              )}
              style={anchorPointStyle(side, 50)}
              isConnectable={canStartConnection}
              isConnectableStart={canStartConnection}
            />
          ))
        : null}
      {SIDES.map((side) => (
        <Handle
          key={`${side}-in-strip`}
          type="target"
          position={SIDE_POSITION[side]}
          id={`${side}-in`}
          className={cn(stripClass, targetPointer)}
          style={edgeStripStyle(side, largeHitZone)}
          isConnectable
          isConnectableEnd
        />
      ))}
      {SIDES.map((side) => (
        <Handle
          key={`${side}-out-strip`}
          type="source"
          position={SIDE_POSITION[side]}
          id={`${side}-out`}
          className={cn(stripClass, sourcePointer)}
          style={edgeStripStyle(side, largeHitZone)}
          isConnectable={canStartConnection}
          isConnectableStart={canStartConnection}
        />
      ))}
    </>
  );
}
