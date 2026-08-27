// ─────────────────────────────────────────────────────────────────────────────
// WavyGridBackground — a thin grid on pure black, warped by drifting sine waves
// so the whole mesh gently ripples. Canvas + rAF, DPR-aware, pointer-events:none.
// Honours prefers-reduced-motion (renders a single static warped frame).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";

const GAP = 34;          // spacing between grid lines (px)
const AMP = 7;           // max displacement of each vertex (px)
const SPEED = 0.00022;   // time scale — lower = slower drift
const COLORS = {
  dark:  { bg: "#000000", line: "rgba(255,255,255,0.07)" },
  light: { bg: "#f4f4f7", line: "rgba(0,0,0,0.07)" },
} as const;

export function WavyGridBackground({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { bg, line } = COLORS[theme];

    let w = 0, h = 0, dpr = 1;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Displaced position of a grid vertex — layered sines give the organic warp.
    const warp = (x: number, y: number, t: number) => {
      const dx =
        Math.sin(y * 0.018 + t * 1.1) * AMP +
        Math.sin((x + y) * 0.011 - t * 0.7) * AMP * 0.5;
      const dy =
        Math.sin(x * 0.02 - t * 0.9) * AMP +
        Math.cos((x - y) * 0.013 + t * 0.6) * AMP * 0.5;
      return [x + dx, y + dy] as const;
    };

    const draw = (time: number) => {
      const t = time * SPEED;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = line;

      const cols = Math.ceil(w / GAP) + 2;
      const rows = Math.ceil(h / GAP) + 2;

      // Horizontal ripple lines
      for (let j = 0; j <= rows; j++) {
        const y = j * GAP - GAP;
        ctx.beginPath();
        for (let i = 0; i <= cols; i++) {
          const x = i * GAP - GAP;
          const [px, py] = warp(x, y, t);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Vertical ripple lines
      for (let i = 0; i <= cols; i++) {
        const x = i * GAP - GAP;
        ctx.beginPath();
        for (let j = 0; j <= rows; j++) {
          const y = j * GAP - GAP;
          const [px, py] = warp(x, y, t);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    };

    const loop = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [theme]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
        background: COLORS[theme].bg,
      }}
    />
  );
}
