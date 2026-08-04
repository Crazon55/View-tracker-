import { Handle, Position, type CSSProperties } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { SIDES, sideMidHandle, type AnchorSide } from "../lib/fsiConnectionAnchors";

type Props = {
  canStartConnection?: boolean;
  largeHitZone?: boolean;
  canAcceptConnection?: boolean;
  requiredAnchors?: string[];
  /** Show visible Miro-style mid-side connection dots. */
  showConnectionDots?: boolean;
};

const SIDE_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * 1×1 handle centered on the border.
 * RF attaches to the outer face of the handle bbox — a 1px handle keeps wires flush.
 * Hit area + visible dot come from CSS ::before (does not affect RF geometry).
 */
function anchorStyle(side: AnchorSide): CSSProperties {
  switch (side) {
    case "top":
      return { left: "50%", top: 0, transform: "translate(-50%, -50%)" };
    case "bottom":
      return { left: "50%", bottom: 0, transform: "translate(-50%, 50%)" };
    case "left":
      return { top: "50%", left: 0, transform: "translate(-50%, -50%)" };
    case "right":
      return { top: "50%", right: 0, transform: "translate(50%, -50%)" };
  }
}

const baseHandleClass = cn(
  "fsi-rf-handle !h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent !rounded-none nodrag nopan",
);

export default function FsiNodeHandles({
  canStartConnection = false,
  largeHitZone: _largeHitZone = false,
  canAcceptConnection = false,
  requiredAnchors: _requiredAnchors = [],
  showConnectionDots = false,
}: Props) {
  const canHitTarget = canAcceptConnection || canStartConnection;
  // While a connection is in progress, let target ports receive the drop (not source dots).
  const canDragFromSource = canStartConnection && !canAcceptConnection;

  return (
    <>
      {SIDES.map((side) => {
        const outId = sideMidHandle(side, "out");
        const inId = sideMidHandle(side, "in");
        return (
          <span key={side} className="contents">
            <Handle
              type="target"
              position={SIDE_POSITION[side]}
              id={inId}
              className={cn(
                baseHandleClass,
                "fsi-rf-handle-target",
                // While dragging a wire, highlight drop ports on other nodes.
                showConnectionDots && canAcceptConnection && "fsi-rf-handle-target-visible",
                canHitTarget ? "!pointer-events-auto cursor-crosshair" : "!pointer-events-none",
              )}
              style={anchorStyle(side)}
              isConnectable={canHitTarget}
              isConnectableEnd={canHitTarget}
              isConnectableStart={false}
            />
            <Handle
              type="source"
              position={SIDE_POSITION[side]}
              id={outId}
              className={cn(
                baseHandleClass,
                "fsi-rf-handle-source",
                // Source dots only when this node is offering a start port (selected), not on every board node.
                showConnectionDots && canDragFromSource && "fsi-rf-handle-source-visible",
                canDragFromSource ? "!pointer-events-auto cursor-crosshair" : "!pointer-events-none",
              )}
              style={anchorStyle(side)}
              isConnectable={canDragFromSource}
              isConnectableStart={canDragFromSource}
              isConnectableEnd={false}
              title="Drag to connect"
            />
          </span>
        );
      })}
    </>
  );
}
