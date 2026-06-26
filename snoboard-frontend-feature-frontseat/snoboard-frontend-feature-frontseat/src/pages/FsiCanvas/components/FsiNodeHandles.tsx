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
};

/**
 * Invisible four-side handles — no visible dots. Select a node, drag from its edge to connect.
 */
export default function FsiNodeHandles({ canStartConnection = false }: Props) {
  const targetClass =
    "!z-[5] !h-10 !w-10 !rounded-full !border-0 !bg-transparent !opacity-0 !pointer-events-auto";

  const sourceClass = cn(
    "!z-[5] !h-10 !w-10 !rounded-full !border-0 !bg-transparent !opacity-0",
    canStartConnection ? "!pointer-events-auto" : "!pointer-events-none",
  );

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
