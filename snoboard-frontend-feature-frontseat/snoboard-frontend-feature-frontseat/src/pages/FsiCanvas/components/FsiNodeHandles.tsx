import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  type AnchorSide,
  formatAnchorHandle,
  parseAnchorHandle,
} from "../lib/fsiConnectionAnchors";
import { normalizeToAnchorHandle } from "../lib/fsiConnectionHandles";

const SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

const SIDE_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

type Props = {
  canStartConnection?: boolean;
  largeHitZone?: boolean;
  /** Anchor ids used by saved edges — rendered at exact positions. */
  requiredAnchors?: string[];
};

/** Wide invisible strips along each edge — easy to grab. Pointer refines exact anchor on connect. */
function edgeStripStyle(side: AnchorSide, large: boolean): CSSProperties {
  const thickness = large ? 22 : 18;
  switch (side) {
    case "top":
      return {
        left: "2%",
        width: "96%",
        height: thickness,
        top: 0,
        transform: "translateY(-50%)",
      };
    case "bottom":
      return {
        left: "2%",
        width: "96%",
        height: thickness,
        bottom: 0,
        transform: "translateY(50%)",
      };
    case "left":
      return {
        top: "2%",
        height: "96%",
        width: thickness,
        left: 0,
        transform: "translateX(-50%)",
      };
    case "right":
      return {
        top: "2%",
        height: "96%",
        width: thickness,
        right: 0,
        transform: "translateX(50%)",
      };
    default:
      return {};
  }
}

function pointAnchorStyle(side: AnchorSide, pct: number, large: boolean): CSSProperties {
  const size = large ? 16 : 14;
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

const stripClass = cn(
  "!z-[35] !border-0 !bg-transparent !opacity-0 !rounded-none",
);

const pointClass = cn(
  "!z-[40] !border-0 !bg-transparent !opacity-0 !rounded-full",
);

/**
 * Edge strips for reliable drag-to-connect + point anchors for saved edge positions.
 */
export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone = false,
  requiredAnchors = [],
}: Props) {
  const sourcePointer = canStartConnection ? "!pointer-events-auto" : "!pointer-events-none";

  const pointAnchors: { id: string; kind: "in" | "out"; side: AnchorSide; pct: number }[] = [];
  const stripIds = new Set<string>();

  for (const side of SIDES) {
    stripIds.add(`${side}-in`);
    stripIds.add(`${side}-out`);
  }

  for (const raw of requiredAnchors) {
    const id = normalizeToAnchorHandle(raw);
    if (!id) continue;
    const parsed = parseAnchorHandle(id);
    if (!parsed) continue;
    if (stripIds.has(id)) continue;
    pointAnchors.push({ id, kind: parsed.kind, side: parsed.side, pct: parsed.pct });
  }

  return (
    <>
      {SIDES.map((side) => (
        <Handle
          key={`${side}-in-strip`}
          type="target"
          position={SIDE_POSITION[side]}
          id={`${side}-in`}
          className={cn(stripClass, "!pointer-events-auto")}
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
      {pointAnchors.map(({ id, kind, side, pct }) => {
        const isSource = kind === "out";
        return (
          <Handle
            key={id}
            type={isSource ? "source" : "target"}
            position={SIDE_POSITION[side]}
            id={id}
            className={cn(
              pointClass,
              isSource ? sourcePointer : "!pointer-events-auto",
            )}
            style={pointAnchorStyle(side, pct, largeHitZone)}
            isConnectable={isSource ? canStartConnection : true}
            isConnectableStart={isSource ? canStartConnection : false}
            isConnectableEnd={!isSource}
          />
        );
      })}
    </>
  );
}
