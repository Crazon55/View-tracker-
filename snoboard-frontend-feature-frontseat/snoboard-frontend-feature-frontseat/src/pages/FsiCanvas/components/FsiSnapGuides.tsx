import { ViewportPortal } from "@xyflow/react";
import type { SnapLine } from "../lib/fsiSnapGuides";

type Props = {
  lines: SnapLine[];
  /** Current viewport zoom — keeps the line/dash thickness constant on screen. */
  zoom: number;
};

const GUIDE_COLOR = "#ec4899";

/** Renders Miro/Figma-style alignment guides in flow space via ViewportPortal, so they pan/zoom with the canvas. */
export default function FsiSnapGuides({ lines, zoom }: Props) {
  if (lines.length === 0) return null;
  const strokeWidth = 1 / zoom;
  const dash = 4 / zoom;

  return (
    <ViewportPortal>
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, overflow: "visible", pointerEvents: "none" }}
      >
        {lines.map((line, i) =>
          line.orientation === "vertical" ? (
            <line
              key={i}
              x1={line.position}
              y1={line.start}
              x2={line.position}
              y2={line.end}
              stroke={GUIDE_COLOR}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${dash}`}
            />
          ) : (
            <line
              key={i}
              x1={line.start}
              y1={line.position}
              x2={line.end}
              y2={line.position}
              stroke={GUIDE_COLOR}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${dash}`}
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}
