import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";

const SIDES = [
  { position: Position.Top, id: "top" },
  { position: Position.Right, id: "right" },
  { position: Position.Bottom, id: "bottom" },
  { position: Position.Left, id: "left" },
] as const;

type Props = {
  /** When true, this node can start a connection (invisible edge hit zones). */
  canStartConnection?: boolean;
  /** Wider invisible hit zones (e.g. image cards). */
  largeHitZone?: boolean;
};

function edgeHandleStyle(position: Position, large: boolean): CSSProperties {
  const thickness = large ? 18 : 14;
  switch (position) {
    case Position.Top:
      return {
        left: "4%",
        width: "92%",
        height: thickness,
        top: 0,
        transform: "translateY(-50%)",
      };
    case Position.Bottom:
      return {
        left: "4%",
        width: "92%",
        height: thickness,
        bottom: 0,
        transform: "translateY(50%)",
      };
    case Position.Left:
      return {
        top: "4%",
        height: "92%",
        width: thickness,
        left: 0,
        transform: "translateX(-50%)",
      };
    case Position.Right:
      return {
        top: "4%",
        height: "92%",
        width: thickness,
        right: 0,
        transform: "translateX(50%)",
      };
    default:
      return {};
  }
}

const handleClass = cn(
  "!z-[40] !border-0 !bg-transparent !opacity-0 !rounded-none",
);

/**
 * Invisible four-side handles — no visible dots. Drag from any node edge to connect.
 */
export default function FsiNodeHandles({ canStartConnection = false, largeHitZone = false }: Props) {
  const sourcePointer = canStartConnection ? "!pointer-events-auto" : "!pointer-events-none";

  return (
    <>
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-in`}
          type="target"
          position={position}
          id={`${id}-in`}
          className={cn(handleClass, "!pointer-events-auto")}
          style={edgeHandleStyle(position, largeHitZone)}
          isConnectable
          isConnectableEnd
        />
      ))}
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-out`}
          type="source"
          position={position}
          id={`${id}-out`}
          className={cn(handleClass, sourcePointer)}
          style={edgeHandleStyle(position, largeHitZone)}
          isConnectable={canStartConnection}
          isConnectableStart={canStartConnection}
        />
      ))}
    </>
  );
}
