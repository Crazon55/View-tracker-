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
      const n = strong ? 220 : 100;
      const base = {
        origin: { y: 0.55, x: 0.5 },
        spread: 90,
        ticks: 90,
        gravity: 0.85,
        colors: WRAP_COLORS,
        zIndex: 2000,
      };
      void confetti({ ...base, particleCount: n, startVelocity: 38, scalar: 1.1 });
      setTimeout(
        () =>
          void confetti({
            ...base,
            particleCount: Math.round(n * 0.5),
            spread: 130,
            startVelocity: 25,
            scalar: 0.95,
            origin: { y: 0.6, x: 0.35 },
          }),
        160,
      );
      if (strong) {
        setTimeout(
          () =>
            void confetti({
              ...base,
              particleCount: Math.round(n * 0.4),
              spread: 100,
              startVelocity: 28,
              scalar: 1.0,
              origin: { y: 0.6, x: 0.65 },
            }),
          300,
        );
      }
    });
    return () => cancelAnimationFrame(id);
  }, [shouldFire, reduce]);
}

/** Plays a synthetic celebration fanfare using Web Audio API. No external files. */
export function useWrapCelebrationSound(shouldPlay: boolean) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!shouldPlay || reduce) return;
    const id = setTimeout(() => {
      try {
        const ctx = new AudioContext();
        // Ascending fanfare: C5 E5 G5 C6
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = ctx.currentTime + i * 0.11;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.16, t + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          osc.start(t);
          osc.stop(t + 0.55);
        });
        // Soft noise burst (snare-like hit at the start)
        const bufLen = Math.floor(ctx.sampleRate * 0.12);
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.25));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gn = ctx.createGain();
        gn.gain.value = 0.18;
        src.connect(gn);
        gn.connect(ctx.destination);
        src.start(ctx.currentTime);
      } catch {
        // AudioContext blocked — no-op
      }
    }, 200);
    return () => clearTimeout(id);
  }, [shouldPlay, reduce]);
}

/** "Pour in a glass" — reveal from bottom via clip-path. */
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

