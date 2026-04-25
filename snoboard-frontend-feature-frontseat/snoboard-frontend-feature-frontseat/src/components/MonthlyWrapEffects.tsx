import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

const WRAP_COLORS = ["#a78bfa", "#c084fc", "#e879f9", "#fbbf24", "#34d399", "#38bdf8", "#f472b6"];

/**
 * Fires a celebratory burst (center-up). `strong` = more particles (total views).
 * Respects reduced motion: no-op when the user prefers reduced motion.
 */
export function useWrapConfetti(shouldFire: boolean, strong: boolean) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!shouldFire || reduce) return;
    const id = requestAnimationFrame(() => {
      const n = strong ? 150 : 85;
      const base = {
        origin: { y: 0.62, x: 0.5 },
        spread: 78,
        ticks: 70,
        gravity: 0.92,
        colors: WRAP_COLORS,
        zIndex: 2000,
      };
      void confetti({ ...base, particleCount: n, startVelocity: 32, scalar: 1.05 });
      setTimeout(
        () =>
          void confetti({
            ...base,
            particleCount: Math.round(n * 0.45),
            spread: 110,
            startVelocity: 22,
            scalar: 0.9,
          }),
        130,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [shouldFire, reduce]);
}

/** “Pour in a glass” — reveal from bottom via clip-path. */
export function WaterRiseText({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={cn("inline-block", className)}
      initial={{ clipPath: "inset(100% 0 0 0)" }}
      animate={{ clipPath: "inset(0% 0 0 0%)" }}
      transition={{ duration: 0.88, delay, ease: [0.22, 0.12, 0.14, 1] }}
      style={{ willChange: "clip-path" }}
    >
      {children}
    </motion.div>
  );
}

