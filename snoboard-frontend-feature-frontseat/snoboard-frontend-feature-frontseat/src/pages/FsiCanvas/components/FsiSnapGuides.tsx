import { ViewportPortal, useStore } from "@xyflow/react";
import type { SnapLine } from "../lib/fsiSnapGuides";

type Props = {
  lines: SnapLine[];
};

/** Miro-style blue dashed alignment guides in flow space (pan/zoom with the canvas). */
export default function FsiSnapGuides({ lines }: Props) {
  const zoom = useStore((s) => s.transform[2]);
  if (lines.length === 0) return null;

  const strokeWidth = 1 / zoom;
  const dash = 5 / zoom;

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
              stroke="#38bdf8"
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
              stroke="#38bdf8"
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${dash}`}
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}
