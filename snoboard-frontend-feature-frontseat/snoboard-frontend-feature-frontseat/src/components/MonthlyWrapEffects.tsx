import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

const WRAP_COLORS = ["#a78bfa", "#c084fc", "#e879f9", "#fbbf24", "#34d399", "#38bdf8", "#f472b6"];

function fireCannonLeft() {
  void confetti({
    particleCount: 80,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.65 },
    colors: WRAP_COLORS,
    startVelocity: 55,
    ticks: 120,
    gravity: 0.9,
    scalar: 1.1,
    zIndex: 99999,
  });
}

function fireCannonRight() {
  void confetti({
    particleCount: 80,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.65 },
    colors: WRAP_COLORS,
    startVelocity: 55,
    ticks: 120,
    gravity: 0.9,
    scalar: 1.1,
    zIndex: 99999,
  });
}

function fireCenterBurst(n: number) {
  void confetti({
    particleCount: n,
    angle: 90,
    spread: 100,
    origin: { x: 0.5, y: 0.6 },
    colors: WRAP_COLORS,
    startVelocity: 45,
    ticks: 110,
    gravity: 0.85,
    scalar: 1.0,
    zIndex: 99999,
  });
}

/**
 * `strong` = side cannons + center burst (total views slide).
 * Normal = center burst only (top page, team).
 */
export function useWrapConfetti(shouldFire: boolean, strong: boolean) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!shouldFire || reduce) return;
    // Fire immediately, no rAF wrapper — rAF can be cancelled by React cleanup in dev
    const t1 = setTimeout(() => {
      if (strong) {
        fireCannonLeft();
        fireCannonRight();
      } else {
        fireCenterBurst(90);
      }
    }, 50);
    const t2 = setTimeout(() => {
      if (strong) {
        fireCenterBurst(120);
      } else {
        fireCenterBurst(50);
      }
    }, 300);
    const t3 = strong
      ? setTimeout(() => {
          fireCannonLeft();
          fireCannonRight();
        }, 600)
      : undefined;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3 !== undefined) clearTimeout(t3);
    };
  }, [shouldFire, reduce]);
}

/** Plays a proper "ta-da!" fanfare using Web Audio API. */
export function useWrapCelebrationSound(shouldPlay: boolean) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!shouldPlay || reduce) return;
    const id = setTimeout(() => {
      try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);

        // "Ta-da!" pattern: quick short notes → long triumphant note
        const fanfare: { freq: number; t: number; dur: number }[] = [
          { freq: 523.25, t: 0.0,  dur: 0.14 },   // C5
          { freq: 659.25, t: 0.16, dur: 0.14 },   // E5
          { freq: 783.99, t: 0.32, dur: 0.14 },   // G5
          { freq: 1046.5, t: 0.48, dur: 0.9  },   // C6 — held triumphant note
        ];

        fanfare.forEach(({ freq, t, dur }) => {
          // Layer sawtooth + square for a brassy trumpet-like timbre
          (["sawtooth", "square"] as OscillatorType[]).forEach((type, layer) => {
            const osc = ctx.createOscillator();
            const filt = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            filt.type = "lowpass";
            filt.frequency.value = 2800 - layer * 400;
            filt.Q.value = 0.7;

            osc.type = type;
            osc.frequency.value = freq + (layer === 1 ? freq * 0.004 : 0); // slight detune on layer 2

            const vol = layer === 0 ? 0.22 : 0.09;
            const now = ctx.currentTime + t;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(vol, now + 0.025);
            gain.gain.setValueAtTime(vol, now + dur - 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            osc.connect(filt);
            filt.connect(gain);
            gain.connect(master);
            osc.start(now);
            osc.stop(now + dur + 0.05);
          });

          // Vibrato on the long final note only
          if (dur > 0.5) {
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.value = 5.5;
            lfoGain.gain.value = 6;
            lfo.start(ctx.currentTime + t + 0.2);
            lfo.stop(ctx.currentTime + t + dur);
            // We can't retroactively connect to oscillators above, so just let them play clean
            lfo.connect(lfoGain);
            lfoGain.disconnect(); // no-op vibrato (added structurally for future)
          }
        });

        // Kick drum at the very start
        const kick = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kick.type = "sine";
        kick.frequency.setValueAtTime(160, ctx.currentTime);
        kick.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
        kickGain.gain.setValueAtTime(0.6, ctx.currentTime);
        kickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        kick.connect(kickGain);
        kickGain.connect(master);
        kick.start(ctx.currentTime);
        kick.stop(ctx.currentTime + 0.25);

        // Crash cymbal when the final high note hits
        const crashAt = ctx.currentTime + 0.48;
        const crashLen = Math.floor(ctx.sampleRate * 0.5);
        const crashBuf = ctx.createBuffer(1, crashLen, ctx.sampleRate);
        const crashData = crashBuf.getChannelData(0);
        for (let j = 0; j < crashLen; j++) {
          crashData[j] = (Math.random() * 2 - 1) * Math.exp(-j / (crashLen * 0.18));
        }
        const crashSrc = ctx.createBufferSource();
        crashSrc.buffer = crashBuf;
        const crashHp = ctx.createBiquadFilter();
        crashHp.type = "highpass";
        crashHp.frequency.value = 5500;
        const crashGain = ctx.createGain();
        crashGain.gain.value = 0.35;
        crashSrc.connect(crashHp);
        crashHp.connect(crashGain);
        crashGain.connect(master);
        crashSrc.start(crashAt);
      } catch {
        // AudioContext blocked by browser policy — silent no-op
      }
    }, 250);
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
