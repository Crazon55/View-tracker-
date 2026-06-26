import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

const SIDES = [
  { position: Position.Top, id: "top" },
  { position: Position.Right, id: "right" },
  { position: Position.Bottom, id: "bottom" },
  { position: Position.Left, id: "left" },
] as const;

type Props = {
  borderClassName?: string;
  /** Miro-style: dots visible when node is selected or while dragging a connection. */
  visible?: boolean;
  connecting?: boolean;
};

/**
 * Four-sided handles — visual dots when selected; targets always accept connections.
 */
export default function FsiNodeHandles({
  borderClassName = "!border-emerald-900",
  visible = false,
  connecting = false,
}: Props) {
  const showDots = visible || connecting;
  const sourceActive = visible;

  return (
    <>
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-in`}
          type="target"
          position={position}
          id={`${id}-in`}
          className="!z-[5] !h-7 !w-7 !rounded-full !border-0 !bg-transparent !pointer-events-auto !opacity-0"
          isConnectable
        />
      ))}
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-out`}
          type="source"
          position={position}
          id={`${id}-out`}
          className={cn(
            "!z-10 !h-7 !w-7 !rounded-full !border-2 !bg-white shadow-sm",
            "!transition-all duration-150",
            showDots ? "!scale-100 !opacity-100" : "!scale-75 !opacity-0",
            sourceActive ? "!pointer-events-auto" : "!pointer-events-none",
            borderClassName,
          )}
          isConnectable={sourceActive}
          isConnectableStart={sourceActive}
          isConnectableEnd={sourceActive}
        />
      ))}
    </>
  );
}
