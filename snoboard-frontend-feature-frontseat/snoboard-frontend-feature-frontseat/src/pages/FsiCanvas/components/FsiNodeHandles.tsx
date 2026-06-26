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
  /** Miro-style: dots only visible when node is selected or connecting. */
  visible?: boolean;
};

/**
 * Four-sided connection handles — hidden until node is selected (Miro-style).
 */
export default function FsiNodeHandles({
  borderClassName = "!border-emerald-900",
  visible = false,
}: Props) {
  const visibleClass = cn(
    "!z-10 !h-3.5 !w-3.5 !rounded-full !border-2 !bg-white shadow-sm",
    "!transition-all duration-150",
    visible ? "!scale-100 !opacity-100" : "!scale-75 !opacity-0 !pointer-events-none",
    borderClassName,
  );
  const hitClass = cn(
    "!z-[5] !h-6 !w-6 !rounded-full !border-0 !bg-transparent",
    visible
      ? "!opacity-0 hover:!opacity-100 hover:!bg-white/20"
      : "!opacity-0 !pointer-events-none",
  );

  return (
    <>
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-hit`}
          type="target"
          position={position}
          id={`${id}-in`}
          className={hitClass}
          isConnectable={visible}
          isConnectableStart={visible}
          isConnectableEnd={visible}
        />
      ))}
      {SIDES.map(({ position, id }) => (
        <Handle
          key={`${id}-out`}
          type="source"
          position={position}
          id={`${id}-out`}
          className={visibleClass}
          isConnectable={visible}
          isConnectableStart={visible}
          isConnectableEnd={visible}
        />
      ))}
    </>
  );
}
