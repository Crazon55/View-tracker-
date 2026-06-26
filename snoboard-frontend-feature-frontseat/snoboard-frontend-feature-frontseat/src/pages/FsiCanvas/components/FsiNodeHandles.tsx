import { Handle, Position } from "@xyflow/react";
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

/**
 * Invisible four-side handles — no visible dots. Drag from a node edge to connect.
 */
export default function FsiNodeHandles({ canStartConnection = false, largeHitZone = false }: Props) {
  const hitClass = cn(
    "!absolute !z-[30] !rounded-full !border-0 !bg-transparent !opacity-0",
    largeHitZone ? "!h-8 !w-8" : "!h-6 !w-6",
  );

  const sourceClass = cn(
    hitClass,
    canStartConnection ? "!pointer-events-auto" : "!pointer-events-none",
  );

  const targetClass = cn(hitClass, "!pointer-events-auto");

  return (
    <>
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-in`}
          type="target"
          position={position}
          id={`${id}-in`}
          className={targetClass}
          isConnectable
        />
      ))}
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-out`}
          type="source"
          position={position}
          id={`${id}-out`}
          className={sourceClass}
          isConnectable={canStartConnection}
          isConnectableStart={canStartConnection}
          isConnectableEnd={canStartConnection}
        />
      ))}
    </>
  );
}
