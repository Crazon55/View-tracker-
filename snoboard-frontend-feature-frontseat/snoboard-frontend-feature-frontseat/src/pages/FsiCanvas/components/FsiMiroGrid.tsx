import { useMemo } from "react";
import { Background, BackgroundVariant, useViewport } from "@xyflow/react";
import { computeMiroGridLevel } from "../lib/fsiMiroGrid";
import { paletteForCanvasTheme, type FsiCanvasTheme } from "../lib/fsiCanvasTheme";

type Props = {
  theme: FsiCanvasTheme;
};

/** Zoom-adaptive line grid (Miro-style 5×5 nesting). Must render inside ReactFlow. */
export default function FsiMiroGrid({ theme }: Props) {
  const { zoom } = useViewport();
  const level = useMemo(() => computeMiroGridLevel(zoom), [zoom]);
  const colors = paletteForCanvasTheme(theme);

  return (
    <>
      <Background
        id="fsi-grid-major"
        variant={BackgroundVariant.Lines}
        gap={level.majorGap}
        lineWidth={1}
        color={colors.gridMajor}
      />
      {level.minorOpacity > 0.02 ? (
        <Background
          id="fsi-grid-minor"
          variant={BackgroundVariant.Lines}
          gap={level.minorGap}
          lineWidth={1}
          color={colors.gridMinor}
          style={{ opacity: level.minorOpacity }}
        />
      ) : null}
      {level.microOpacity > 0.02 ? (
        <Background
          id="fsi-grid-micro"
          variant={BackgroundVariant.Lines}
          gap={level.microGap}
          lineWidth={1}
          color={colors.gridMicro}
          style={{ opacity: level.microOpacity }}
        />
      ) : null}
    </>
  );
}
