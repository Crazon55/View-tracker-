import { useViewport } from "@xyflow/react";
import type { SnapLine } from "../lib/fsiSnapGuides";

type Props = {
  lines: SnapLine[];
};

/**
 * Miro-style alignment guides drawn above the canvas in flow space.
 * Rendered as a sibling overlay (not inside ViewportPortal) so lines are always visible.
 */
export default function FsiSnapGuides({ lines }: Props) {
  const { x, y, zoom } = useViewport();
  if (lines.length === 0) return null;

  const strokeWidth = Math.max(1.5, 2 / zoom);
  const dash = 6 / zoom;
  const guideStroke = "rgba(56, 189, 248, 0.42)";

  return (
    <div className="fsi-snap-guides pointer-events-none absolute inset-0 z-[6]" aria-hidden>
      <svg width="100%" height="100%" className="overflow-visible">
        <g transform={`translate(${x},${y}) scale(${zoom})`}>
          {lines.map((line, i) =>
            line.orientation === "vertical" ? (
              <line
                key={i}
                x1={line.position}
                y1={line.start}
                x2={line.position}
                y2={line.end}
                stroke={guideStroke}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${dash}`}
                strokeLinecap="round"
              />
            ) : (
              <line
                key={i}
                x1={line.start}
                y1={line.position}
                x2={line.end}
                y2={line.position}
                stroke={guideStroke}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${dash}`}
                strokeLinecap="round"
              />
            ),
          )}
        </g>
      </svg>
    </div>
  );
}
