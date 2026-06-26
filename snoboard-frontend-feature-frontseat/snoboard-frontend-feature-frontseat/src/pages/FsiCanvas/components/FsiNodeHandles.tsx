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
};

/**
 * Four-sided connection handles with a large invisible target ring for trackpad use.
 */
export default function FsiNodeHandles({ borderClassName = "!border-emerald-900" }: Props) {
  const visibleClass = cn(
    "!z-10 !h-3.5 !w-3.5 !rounded-full !border-2 !bg-white shadow-sm",
    "!transition-transform hover:!scale-125",
    borderClassName,
  );
  const hitClass =
    "!z-[5] !h-6 !w-6 !rounded-full !border-0 !bg-transparent !opacity-0 hover:!opacity-100 hover:!bg-white/20";

  return (
    <>
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-hit`}
          type="target"
          position={position}
          id={`${id}-in`}
          className={hitClass}
          isConnectableStart
          isConnectableEnd
        />
      ))}
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-out`}
          type="source"
          position={position}
          id={`${id}-out`}
          className={visibleClass}
          isConnectableStart
          isConnectableEnd
        />
      ))}
    </>
  );
}
