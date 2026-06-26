import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { formatAnchorHandle } from "../lib/fsiConnectionAnchors";

const ANCHOR_PCTS = [0, 20, 40, 60, 80, 100] as const;

const SIDES: { position: Position; side: "top" | "right" | "bottom" | "left" }[] = [
  { position: Position.Top, side: "top" },
  { position: Position.Right, side: "right" },
  { position: Position.Bottom, side: "bottom" },
  { position: Position.Left, side: "left" },
];

function anchorStyle(
  side: "top" | "right" | "bottom" | "left",
  pct: number,
): React.CSSProperties {
  const t = `${pct}%`;
  switch (side) {
    case "top":
      return { left: t, top: 0, transform: "translate(-50%, -55%)" };
    case "bottom":
      return { left: t, bottom: 0, transform: "translate(-50%, 55%)" };
    case "left":
      return { top: t, left: 0, transform: "translate(-55%, -50%)" };
    case "right":
      return { top: t, right: 0, transform: "translate(55%, -50%)" };
  }
}

type Props = {
  /** Miro-style: blue dots when node is selected or while dragging a connection. */
  visible?: boolean;
  connecting?: boolean;
};

/**
 * Perimeter connection handles — many snap points along each edge (Miro-style).
 * Targets always accept connections; sources active when selected.
 */
export default function FsiNodeHandles({ visible = false, connecting = false }: Props) {
  const showDots = visible || connecting;
  const sourceActive = visible;

  const sourceHitClass = cn(
    "!z-10 !h-3 !w-3 !rounded-full !border-2 !border-white !bg-[#2e73ea] shadow-sm",
    "!transition-opacity duration-150",
    showDots ? "!opacity-100" : "!opacity-0",
    sourceActive ? "!pointer-events-auto" : "!pointer-events-none",
  );

  const targetHitClass =
    "!z-[5] !h-3 !w-3 !rounded-full !border-0 !bg-transparent !pointer-events-auto !opacity-0";

  return (
    <>
      {SIDES.flatMap(({ position, side }) =>
        ANCHOR_PCTS.map((pct) => {
          const inId = formatAnchorHandle(side, "in", pct);
          return (
            <Handle
              key={inId}
              type="target"
              position={position}
              id={inId}
              style={anchorStyle(side, pct)}
              className={targetHitClass}
              isConnectable
            />
          );
        }),
      )}
      {SIDES.flatMap(({ position, side }) =>
        ANCHOR_PCTS.map((pct) => {
          const outId = formatAnchorHandle(side, "out", pct);
          return (
            <Handle
              key={outId}
              type="source"
              position={position}
              id={outId}
              style={anchorStyle(side, pct)}
              className={sourceHitClass}
              isConnectable={sourceActive}
              isConnectableStart={sourceActive}
              isConnectableEnd={sourceActive}
            />
          );
        }),
      )}
    </>
  );
}
