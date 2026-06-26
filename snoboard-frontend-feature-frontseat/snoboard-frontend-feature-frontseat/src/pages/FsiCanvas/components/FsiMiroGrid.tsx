import { useMemo } from "react";
import { Background, BackgroundVariant, useViewport } from "@xyflow/react";
import { computeMiroGridLevel } from "../lib/fsiMiroGrid";

/** Zoom-adaptive line grid (Miro-style 5×5 nesting). Must render inside ReactFlow. */
export default function FsiMiroGrid() {
  const { zoom } = useViewport();
  const level = useMemo(() => computeMiroGridLevel(zoom), [zoom]);

  return (
    <>
      <Background
        id="fsi-grid-major"
        variant={BackgroundVariant.Lines}
        gap={level.majorGap}
        lineWidth={1}
        color="rgba(255, 255, 255, 0.09)"
      />
      {level.minorOpacity > 0.02 ? (
        <Background
          id="fsi-grid-minor"
          variant={BackgroundVariant.Lines}
          gap={level.minorGap}
          lineWidth={1}
          color="rgba(255, 255, 255, 0.05)"
          style={{ opacity: level.minorOpacity }}
        />
      ) : null}
      {level.microOpacity > 0.02 ? (
        <Background
          id="fsi-grid-micro"
          variant={BackgroundVariant.Lines}
          gap={level.microGap}
          lineWidth={1}
          color="rgba(255, 255, 255, 0.03)"
          style={{ opacity: level.microOpacity }}
        />
      ) : null}
    </>
  );
}
