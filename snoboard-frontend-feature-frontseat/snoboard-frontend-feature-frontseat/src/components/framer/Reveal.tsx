// ─────────────────────────────────────────────────────────────────────────────
// Reveal — scroll-triggered "render-in": as the block enters the viewport it
// fades up and un-blurs, like content materialising. Re-fires every time it
// enters view (scroll down AND back up). Respects prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className} style={style}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
