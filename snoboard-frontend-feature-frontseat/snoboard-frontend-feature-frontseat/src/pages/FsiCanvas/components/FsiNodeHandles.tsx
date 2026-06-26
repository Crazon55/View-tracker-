import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  type AnchorSide,
  formatAnchorHandle,
  parseAnchorHandle,
} from "../lib/fsiConnectionAnchors";
import { normalizeToAnchorHandle } from "../lib/fsiConnectionHandles";

/** Anchor spacing along each edge (percent). Visual cards use finer steps. */
function anchorPcts(fine: boolean): number[] {
  const step = fine ? 5 : 10;
  const count = 100 / step;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

const SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

const SIDE_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

type Props = {
  /** When true, full perimeter grid is interactive for starting connections. */
  canStartConnection?: boolean;
  /** Slightly larger hit targets (visual / image cards). */
  largeHitZone?: boolean;
  /** Anchor handle ids required for existing edges (always rendered). */
  requiredAnchors?: string[];
};

function anchorHitSize(large: boolean): number {
  return large ? 14 : 12;
}

function anchorHandleStyle(side: AnchorSide, pct: number, large: boolean): CSSProperties {
  const size = anchorHitSize(large);
  switch (side) {
    case "top":
      return {
        left: `${pct}%`,
        top: 0,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
      };
    case "bottom":
      return {
        left: `${pct}%`,
        bottom: 0,
        width: size,
        height: size,
        transform: "translate(-50%, 50%)",
      };
    case "left":
      return {
        top: `${pct}%`,
        left: 0,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
      };
    case "right":
      return {
        top: `${pct}%`,
        right: 0,
        width: size,
        height: size,
        transform: "translate(50%, -50%)",
      };
    default:
      return {};
  }
}

function anchorsToRender(required: string[], showFullGrid: boolean, fine: boolean): Set<string> {
  const set = new Set<string>();
  for (const raw of required) {
    const id = normalizeToAnchorHandle(raw);
    if (id) set.add(id);
  }
  if (showFullGrid) {
    const pcts = anchorPcts(fine);
    for (const side of SIDES) {
      for (const pct of pcts) {
        set.add(formatAnchorHandle(side, "in", pct));
        set.add(formatAnchorHandle(side, "out", pct));
      }
    }
  }
  return set;
}

const handleClass = cn(
  "!z-[40] !border-0 !bg-transparent !opacity-0 !rounded-full",
);

/**
 * Invisible perimeter anchors — connect from the exact point you drag, Miro-style.
 */
export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone = false,
  requiredAnchors = [],
}: Props) {
  const showFullGrid = canStartConnection;
  const ids = anchorsToRender(requiredAnchors, showFullGrid, largeHitZone);

  const rendered: { id: string; kind: "in" | "out"; side: AnchorSide; pct: number }[] = [];
  for (const id of ids) {
    const parsed = parseAnchorHandle(id);
    if (!parsed) continue;
    rendered.push({ id, kind: parsed.kind, side: parsed.side, pct: parsed.pct });
  }

  return (
    <>
      {rendered.map(({ id, kind, side, pct }) => {
        const isSource = kind === "out";
        const canUse =
          isSource ? canStartConnection : true;
        return (
          <Handle
            key={id}
            type={isSource ? "source" : "target"}
            position={SIDE_POSITION[side]}
            id={id}
            className={cn(
              handleClass,
              canUse ? "!pointer-events-auto" : "!pointer-events-none",
            )}
            style={anchorHandleStyle(side, pct, largeHitZone)}
            isConnectable={canUse}
            isConnectableStart={isSource ? canStartConnection : false}
            isConnectableEnd={!isSource}
          />
        );
      })}
    </>
  );
}
