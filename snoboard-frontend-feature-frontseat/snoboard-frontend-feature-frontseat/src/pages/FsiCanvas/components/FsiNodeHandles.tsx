import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { AnchorSide } from "../lib/fsiConnectionAnchors";

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
};

/** Full-edge invisible strips — drag from the side you choose; RF attaches there. */
function edgeStripStyle(side: AnchorSide, large: boolean): CSSProperties {
  const thickness = large ? 32 : 24;
  switch (side) {
    case "top":
      return {
        left: "0%",
        width: "100%",
        height: thickness,
        top: 0,
        transform: "translateY(-50%)",
      };
    case "bottom":
      return {
        left: "0%",
        width: "100%",
        height: thickness,
        bottom: 0,
        transform: "translateY(50%)",
      };
    case "left":
      return {
        top: "0%",
        height: "100%",
        width: thickness,
        left: 0,
        transform: "translateX(-50%)",
      };
    case "right":
      return {
        top: "0%",
        height: "100%",
        width: thickness,
        right: 0,
        transform: "translateX(50%)",
      };
    default:
      return {};
  }
}

const stripClass = cn(
  "!z-[40] !border-0 !bg-transparent !opacity-0 !rounded-none nodrag nopan",
);

/**
 * Four edge strips per node — the handle you grab is the side the line uses.
 */
export default function FsiNodeHandles({ canStartConnection = false, largeHitZone = false }: Props) {
  const sourcePointer = canStartConnection ? "!pointer-events-auto" : "!pointer-events-none";

  return (
    <>
      {SIDES.map((side) => (
        <Handle
          key={`${side}-in`}
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
          key={`${side}-out`}
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
