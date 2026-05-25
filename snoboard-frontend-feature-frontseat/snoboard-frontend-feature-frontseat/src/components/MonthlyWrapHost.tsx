import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronRight, ChevronLeft, Trophy, Flame, X, Lightbulb, Skull, Clapperboard } from "lucide-react";
import {
  getActiveReportMonth,
  getWrapMonthFromUrl,
  stashWrapMonthFromUrl,
  clearPendingWrapMonth,
  buildMonthlyWrapData,
  readWrapState,
  writeWrapState,
  shouldAutoOpenModal,
  formatViewsShort,
  WRAP_ROLLOUT_EXPLAINER,
  getWrapSlidePlan,
  getDefaultWrapMonth,
  monthLabel,
  isOfficialWrapWindow,
  getNextOfficialWrapHint,
  TEAM_META,
  type MonthlyWrapData,
  type WrapSlideKind,
  type TeamKey,
  type PersonStat,
} from "@/lib/monthlyWrap";
import { getTrackerIdeas, getTrackerNiches, getSixDayMonth } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWrapConfetti, useWrapCelebrationSound, WaterRiseText } from "./MonthlyWrapEffects";

const MonthlyWrapContext = createContext<{
  openForMonth: (ym: string) => void;
} | null>(null);

function useWrapUserKey() {
  const { user } = useAuth();
  return user?.id || user?.email || null;
}

function shortMonthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "Monthly";
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

function useMonthlyWrapState() {
  const reportMonth = getDefaultWrapMonth();
  return {
    reportMonth,
    label: shortMonthLabel(reportMonth),
    fullLabel: monthLabel(reportMonth),
  };
}

export function useMonthlyWrap() {
  return useContext(MonthlyWrapContext);
}

export function MonthlyWrapOpenButton({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { reportMonth, label } = useMonthlyWrapState();
  if (!reportMonth) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(`/wrap?month=${encodeURIComponent(reportMonth)}`)}
      className={`inline-flex items-center gap-1.5 rounded-full border border-violet-500/35 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25 transition-colors ${className}`}
    >
      <Sparkles className="w-3.5 h-3.5" />
      {label} wrap
    </button>
  );
}

/** Prominent dashboard entry — hard to miss on the home page. */
export function MonthlyWrapBanner({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  // Only show during the official drop window (1st 5pm IST – 3rd each month)
  const reportMonth = getActiveReportMonth();
  const fullLabel = reportMonth ? monthLabel(reportMonth) : "";
  const official = true;
  if (!reportMonth) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(`/wrap?month=${encodeURIComponent(reportMonth)}`)}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/15 to-violet-900/20",
        "px-5 py-4 sm:px-6 sm:py-5 text-left transition-all hover:border-violet-400/50 hover:from-violet-600/30",
        className,
      )}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-fuchsia-500/20 blur-2xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300/90 font-bold mb-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Monthly wrap
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] tracking-wider",
                official
                  ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                  : "bg-white/10 text-violet-100/80 border border-white/10",
              )}
            >
              {official ? "Official drop" : "Live preview"}
            </span>
          </p>
          <p className="text-lg sm:text-xl font-bold text-white truncate">{fullLabel}</p>
          <p className="text-xs sm:text-sm text-violet-200/70 mt-1">
            {official
              ? "Views, top pages, teams & creator highlights — open through the 3rd (IST)"
              : `${getNextOfficialWrapHint()} · tap to preview month-to-date`}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white group-hover:bg-violet-500">
          Open
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}

type ModalProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forcedReportMonth?: string | null;
  effectiveMonth?: string | null;
};

function useMonthlyWrapQuery(reportMonth: string | null, enabled: boolean, userKey?: string | null) {
  return useQuery({
    queryKey: ["monthly-wrap", reportMonth, userKey],
    queryFn: async () => {
      const [ideas, niches, six] = await Promise.all([
        getTrackerIdeas(),
        getTrackerNiches(),
        reportMonth ? getSixDayMonth(reportMonth).catch((e) => { console.warn("[wrap] six-day fetch failed:", e); return null; }) : Promise.resolve(null),
      ]);
      if (!reportMonth) return null;
      return buildMonthlyWrapData(reportMonth, ideas, niches, six);
    },
    enabled: enabled && !!reportMonth && !!userKey,
    staleTime: 120_000,
    retry: 1,
  });
}

/** Full-screen wrap UI (no dialog) — used by `/wrap` route. */
export function MonthlyWrapScreen({
  reportMonth,
  onExit,
}: {
  reportMonth: string;
  onExit: () => void;
}) {
  const userKey = useWrapUserKey();
  const [step, setStep] = useState(0);
  const { data, isLoading, isError, error } = useMonthlyWrapQuery(reportMonth, true, userKey);

  useEffect(() => {
    setStep(0);
  }, [reportMonth]);

  const finish = useCallback(() => {
    if (userKey && reportMonth) {
      writeWrapState(userKey, reportMonth, { completed: true, autoModalShown: true });
    }
    onExit();
  }, [userKey, reportMonth, onExit]);

  return (
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] flex-col bg-zinc-950 text-zinc-100">
      {isLoading && (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-zinc-500">
          Loading your wrap…
        </div>
      )}
      {isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-semibold text-red-400">Could not load wrap data</p>
          <p className="text-xs text-zinc-500 max-w-sm">{String((error as Error)?.message || error)}</p>
          <Button variant="outline" onClick={onExit} className="mt-2 border-zinc-700">
            Back to dashboard
          </Button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <WrapBody
          data={data}
          step={step}
          setStep={setStep}
          onClose={onExit}
          onDone={finish}
          slides={getWrapSlidePlan(data)}
        />
      )}
      {!isLoading && !isError && !data && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-zinc-400">Nothing to show for {reportMonth} yet.</p>
          <Button variant="outline" onClick={onExit} className="border-zinc-700">
            Back to dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

export function MonthlyWrapModal({
  open,
  onOpenChange,
  forcedReportMonth = null,
  effectiveMonth: effectiveMonthProp,
}: ModalProps) {
  const userKey = useWrapUserKey();
  const calMonth = getActiveReportMonth();
  const reportMonth = effectiveMonthProp ?? forcedReportMonth ?? calMonth;
  const [step, setStep] = useState(0);

  const { data, isLoading } = useMonthlyWrapQuery(reportMonth, open, userKey);

  const reset = useCallback(() => setStep(0), [open, reportMonth]);

  useEffect(() => {
    if (open) reset();
  }, [open, reportMonth, reset]);

  const finish = useCallback(() => {
    if (userKey && reportMonth) {
      writeWrapState(userKey, reportMonth, { completed: true, autoModalShown: true });
    }
    onOpenChange(false);
  }, [userKey, reportMonth, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "fixed inset-0 left-0 top-0 z-[200] flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col",
          "gap-0 border border-white/10 bg-zinc-950 p-0 shadow-none",
          "text-zinc-100",
          "overflow-hidden sm:max-w-none sm:rounded-none",
          "data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100",
          "[&>button]:hidden"
        )}
      >
        {isLoading && (
          <div className="flex min-h-0 flex-1 items-center justify-center p-10 text-center text-sm text-zinc-500">
            Loading your wrap…
          </div>
        )}
        {!isLoading && data && (
          <WrapBody
            data={data}
            step={step}
            setStep={setStep}
            onClose={() => onOpenChange(false)}
            onDone={finish}
            slides={getWrapSlidePlan(data)}
          />
        )}
        {!isLoading && !data && open && (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
            Nothing to show for this month yet.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WrapBody({
  data,
  step,
  setStep,
  onClose,
  onDone,
  slides,
}: {
  data: MonthlyWrapData;
  step: number;
  setStep: (n: number) => void;
  onClose: () => void;
  onDone: () => void;
  slides: WrapSlideKind[];
}) {
  const stepCount = slides.length;
  const slideKind = slides[step] ?? "intro";

  const next = () => {
    if (step >= stepCount - 1) onDone();
    else setStep(step + 1);
  };
  const prev = () => setStep(Math.max(0, step - 1));

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="absolute right-2 top-2 z-20 sm:right-3 sm:top-3">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <DialogHeader className="shrink-0 p-4 pb-0 pr-10 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Monthly wrap</span>
          <span>
            {step + 1} / {stepCount}
          </span>
        </div>
        <div className="h-1 mt-2 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            initial={false}
            animate={{ width: `${((step + 1) / stepCount) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
          />
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${step}-${slideKind}`}
            initial={{ opacity: 0, x: 40, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -30, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <WrapSlide kind={slideKind} data={data} onDone={onDone} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0} className="text-zinc-400">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {step < stepCount - 1 ? (
          <Button size="sm" onClick={next} className="bg-violet-600 hover:bg-violet-500 text-white">
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

const SLIDE_BG: Partial<Record<WrapSlideKind, string>> = {
  intro:                "from-violet-900 via-violet-950 to-zinc-950",
  total:                "from-blue-900 via-blue-950 to-zinc-950",
  topPage:              "from-amber-900 via-amber-950 to-zinc-950",
  top5:                 "from-fuchsia-900 via-fuchsia-950 to-zinc-950",
  team:                 "from-emerald-900 via-emerald-950 to-zinc-950",
  created:              "from-sky-900 via-sky-950 to-zinc-950",
  proven:               "from-green-900 via-green-950 to-zinc-950",
  killed:               "from-rose-900 via-rose-950 to-zinc-950",
  posts:                "from-cyan-900 via-cyan-950 to-zinc-950",
  topReel:              "from-pink-900 via-pink-950 to-zinc-950",
  personStatsGarfields: "from-purple-900 via-purple-950 to-zinc-950",
  personStatsGoofies:   "from-indigo-900 via-indigo-950 to-zinc-950",
  personStatsSherus:    "from-amber-900 via-amber-950 to-zinc-950",
  outro:                "from-fuchsia-900 via-fuchsia-950 to-zinc-950",
};

const SLIDE_GLOW: Partial<Record<WrapSlideKind, string>> = {
  intro:                "rgba(139,92,246,0.35)",
  total:                "rgba(59,130,246,0.4)",
  topPage:              "rgba(217,119,6,0.4)",
  top5:                 "rgba(192,38,211,0.4)",
  team:                 "rgba(16,185,129,0.4)",
  created:              "rgba(14,165,233,0.4)",
  proven:               "rgba(34,197,94,0.4)",
  killed:               "rgba(244,63,94,0.4)",
  posts:                "rgba(6,182,212,0.4)",
  topReel:              "rgba(236,72,153,0.4)",
  personStatsGarfields: "rgba(168,85,247,0.4)",
  personStatsGoofies:   "rgba(99,102,241,0.4)",
  personStatsSherus:    "rgba(217,119,6,0.4)",
  outro:                "rgba(192,38,211,0.35)",
};

const SLIDE_LINE_COLOR: Record<WrapSlideKind, string> = {
  intro:                "rgba(167,139,250,1)",
  total:                "rgba(96,165,250,1)",
  topPage:              "rgba(251,191,36,1)",
  top5:                 "rgba(232,121,249,1)",
  team:                 "rgba(52,211,153,1)",
  created:              "rgba(56,189,248,1)",
  proven:               "rgba(74,222,128,1)",
  killed:               "rgba(251,113,133,1)",
  posts:                "rgba(34,211,238,1)",
  reels:                "rgba(244,114,182,1)",
  topReel:              "rgba(244,114,182,1)",
  personStatsGarfields: "rgba(192,132,252,1)",
  personStatsGoofies:   "rgba(129,140,248,1)",
  personStatsSherus:    "rgba(251,191,36,1)",
  outro:                "rgba(232,121,249,1)",
};

function WrapBackground({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    let t = 0;

    const setSize = () => {
      const p = canvas.parentElement;
      canvas.width  = p ? p.offsetWidth  : window.innerWidth;
      canvas.height = p ? p.offsetHeight : window.innerHeight;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // 2D field function — superposition of sine waves gives organic hills/valleys
    const field = (x: number, y: number) =>
      Math.sin(x * 0.0085 + y * 0.006  + t * 0.22)
      + 0.7 * Math.sin(x * 0.005 - y * 0.010 + t * 0.17)
      + 0.55 * Math.cos(x * 0.011 + y * 0.008 - t * 0.19)
      + 0.35 * Math.sin(x * 0.007 + y * 0.014 + t * 0.14);

    // Marching squares: draw contour line at given level across the grid
    const CELL = 18;
    const lerp = (va: number, vb: number, level: number, pa: number, pb: number) =>
      pa + (pb - pa) * (level - va) / (vb - va);

    const drawLevel = (level: number, gw: number, gh: number, grid: Float32Array) => {
      ctx.beginPath();
      for (let gy = 0; gy < gh - 1; gy++) {
        for (let gx = 0; gx < gw - 1; gx++) {
          const tl = grid[gy * gw + gx];
          const tr = grid[gy * gw + gx + 1];
          const bl = grid[(gy + 1) * gw + gx];
          const br = grid[(gy + 1) * gw + gx + 1];
          const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0)
                     | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
          if (code === 0 || code === 15) continue;

          const x0 = gx * CELL, y0 = gy * CELL;
          const x1 = x0 + CELL, y1 = y0 + CELL;
          const tX = lerp(tl, tr, level, x0, x1), tY = y0;
          const rX = x1,                           rY = lerp(tr, br, level, y0, y1);
          const bX = lerp(bl, br, level, x0, x1),  bY = y1;
          const lX = x0,                            lY = lerp(tl, bl, level, y0, y1);

          const seg = (ax: number, ay: number, bx: number, by: number) => {
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          };
          switch (code) {
            case  1: seg(lX,lY, bX,bY); break;
            case  2: seg(bX,bY, rX,rY); break;
            case  3: seg(lX,lY, rX,rY); break;
            case  4: seg(tX,tY, rX,rY); break;
            case  5: seg(tX,tY, rX,rY); seg(lX,lY, bX,bY); break;
            case  6: seg(tX,tY, bX,bY); break;
            case  7: seg(tX,tY, lX,lY); break;
            case  8: seg(tX,tY, lX,lY); break;
            case  9: seg(tX,tY, bX,bY); break;
            case 10: seg(tX,tY, lX,lY); seg(rX,rY, bX,bY); break;
            case 11: seg(tX,tY, rX,rY); break;
            case 12: seg(lX,lY, rX,rY); break;
            case 13: seg(rX,rY, bX,bY); break;
            case 14: seg(lX,lY, bX,bY); break;
          }
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.35;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 3;
      ctx.stroke();
    };

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) { animId = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap  = "round";
      ctx.lineJoin = "round";

      const gw = Math.ceil(w / CELL) + 2;
      const gh = Math.ceil(h / CELL) + 2;
      const grid = new Float32Array(gw * gh);
      for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++)
          grid[gy * gw + gx] = field(gx * CELL, gy * CELL);

      // ~16 evenly-spaced contour levels spanning the field range [-2.6, 2.6]
      for (let l = -2.4; l <= 2.4; l += 0.32) drawLevel(l, gw, gh, grid);

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      t += 0.003;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [color]);
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full opacity-55" />;
}

function WrapSlide({
  kind,
  data,
  onDone,
}: {
  kind: WrapSlideKind;
  data: MonthlyWrapData;
  onDone: () => void;
}) {
  const bg = SLIDE_BG[kind] ?? "from-zinc-900 to-zinc-950";
  const glowColor = SLIDE_GLOW[kind] ?? "rgba(139,92,246,0.3)";
  const lineColor = SLIDE_LINE_COLOR[kind] ?? "rgba(167,139,250,1)";
  const isTeamStats = kind === "personStatsGarfields" || kind === "personStatsGoofies" || kind === "personStatsSherus";

  const content = () => {
    switch (kind) {
      case "intro":   return <StepIntro data={data} />;
      case "total":   return <StepTotal data={data} />;
      case "topPage": return <StepTopPage data={data} />;
      case "top5":    return <StepTop5 data={data} />;
      case "team":    return <StepTeam data={data} />;
      case "created": return <StepIdea data={data} kind="created" />;
      case "proven":  return <StepIdea data={data} kind="proven" />;
      case "killed":  return <StepIdea data={data} kind="killed" />;
      case "posts":   return <StepIdea data={data} kind="posts" />;
      case "reels":   return <StepIdea data={data} kind="reels" />;
      case "topReel": return <StepTopReel data={data} />;
      case "personStatsGarfields": return <StepPersonStats data={data} team="garfields" />;
      case "personStatsGoofies":   return <StepPersonStats data={data} team="goofies" />;
      case "personStatsSherus":    return <StepPersonStats data={data} team="sheruses" />;
      case "outro":   return <StepOutro data={data} onDone={onDone} />;
      default:        return null;
    }
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-gradient-to-b px-5 py-10 sm:px-8",
        isTeamStats
          ? "flex flex-col min-h-[calc(100dvh-8.5rem)]"
          : "flex flex-col items-center justify-center min-h-[calc(100dvh-8.5rem)]",
        bg,
      )}
    >
      <WrapBackground color={lineColor} />
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${glowColor}, transparent)` }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative z-10 w-full">
        {content()}
      </div>
    </div>
  );
}

function StepIntro({ data }: { data: MonthlyWrapData }) {
  return (
    <div className="flex flex-col items-center text-center justify-center min-h-[280px] gap-4">
      <motion.div
        className="text-4xl"
        aria-hidden
        initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        ✨
      </motion.div>
      <motion.h2
        className="text-2xl font-bold text-white tracking-tight"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        Your {data.monthLabel} wrap
      </motion.h2>
      <motion.p
        className="text-sm text-zinc-400 max-w-sm leading-relaxed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4 }}
      >
        A quick look at views, top pages, teams, and creator highlights — tap Next when you're ready.
      </motion.p>
      <motion.p
        className="text-[11px] text-zinc-500 max-w-sm leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.35 }}
      >
        {WRAP_ROLLOUT_EXPLAINER}
      </motion.p>
    </div>
  );
}

function useCountUp(target: number, duration = 1600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StepTotal({ data }: { data: MonthlyWrapData }) {
  useWrapConfetti(true, true);
  useWrapCelebrationSound(true);
  const counted = useCountUp(data.totalViews);
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8">
      <motion.p
        className="text-xs uppercase tracking-[0.3em] text-blue-300 font-bold"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        The big number
      </motion.p>
      <div className="flex items-end justify-center gap-4">
        <motion.span
          className="text-8xl sm:text-9xl font-black text-white tabular-nums leading-none"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 18 }}
        >
          {formatViewsShort(counted)}
        </motion.span>
        <motion.span
          className="text-3xl sm:text-4xl font-semibold text-blue-300/70 pb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          views
        </motion.span>
      </div>
      <motion.p
        className="text-sm text-zinc-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        combined across all pages this month
      </motion.p>
    </div>
  );
}

function StepTopPage({ data }: { data: MonthlyWrapData }) {
  const p = data.topPage;
  useWrapConfetti(!!p, false);
  const counted = useCountUp(p?.views ?? 0);
  if (!p) {
    return (
      <p className="text-sm text-zinc-500 text-center">
        No per-page data for this month yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-7">
      <motion.p
        className="text-xs uppercase tracking-[0.3em] text-amber-300 font-bold"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Top page
      </motion.p>
      <motion.h3
        className="text-5xl sm:text-6xl font-black text-white"
        initial={{ opacity: 0, y: 16, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 20 }}
      >
        @{p.handle}
      </motion.h3>
      <div className="flex items-end justify-center gap-3">
        <motion.span
          className="text-7xl sm:text-8xl font-black text-white tabular-nums leading-none"
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 18 }}
        >
          {formatViewsShort(counted)}
        </motion.span>
        <motion.span
          className="text-3xl font-semibold text-amber-300/70 pb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          views
        </motion.span>
      </div>
    </div>
  );
}

const top5List = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.28, delayChildren: 0.2 },
  },
};
const top5Item = {
  hidden: { opacity: 0, y: 18, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

function StepTop5({ data }: { data: MonthlyWrapData }) {
  return (
    <div className="flex flex-col items-center text-center w-full max-w-md mx-auto space-y-4 px-1">
      <motion.p
        className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-400 font-bold"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Top 5 pages
      </motion.p>
      <motion.h3
        className="text-3xl sm:text-4xl font-black text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.35 }}
      >
        Leaderboard
      </motion.h3>
      <motion.ol
        className="space-y-3 w-full"
        variants={top5List}
        initial="hidden"
        animate="show"
      >
        {data.topPages.length === 0 && <li className="text-sm text-zinc-500">No data.</li>}
        {data.topPages.map((p, i) => (
          <motion.li
            key={p.pageId}
            variants={top5Item}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.05] px-4 py-3.5 text-left"
          >
            <span className="text-zinc-400 text-base font-bold w-6 tabular-nums shrink-0">{i + 1}</span>
            <span className="flex-1 min-w-0 text-base sm:text-lg text-white font-semibold truncate text-left">
              @{p.handle}
            </span>
            <span className="text-base sm:text-lg text-zinc-100 tabular-nums font-black min-w-[4rem] text-right shrink-0">
              {formatViewsShort(p.views)}
            </span>
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}

function StepTeam({ data }: { data: MonthlyWrapData }) {
  const w = data.winningTeam;
  useWrapConfetti(!!w, false);
  if (!w) {
    return (
      <p className="text-sm text-zinc-500 text-center min-h-[240px] flex items-center justify-center">
        No team view data this month.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center text-center space-y-4 min-h-[280px] justify-center px-2">
      <motion.p
        className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Team of the month
      </motion.p>
      <motion.div
        className="flex items-center justify-center gap-3 text-5xl sm:text-6xl font-black text-white"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 shrink-0" />
        <span>
          {w.emoji} {w.label}
        </span>
      </motion.div>
      <motion.p
        className="text-base text-zinc-400 max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.35 }}
      >
        Leader by combined views on your tracked pages — {formatViewsShort(w.views)} this month.
      </motion.p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Squad</p>
      <motion.ul
        className="flex flex-wrap justify-center gap-2"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.07 } },
        }}
      >
        {w.members.map((m) => (
          <motion.li
            key={m}
            variants={{
              hidden: { opacity: 0, y: 10, scale: 0.92 },
              show: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-sm font-semibold px-4 py-1.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-500/25"
          >
            {m}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

function StepIdea({
  data,
  kind,
}: {
  data: MonthlyWrapData;
  kind: "created" | "proven" | "killed" | "posts" | "reels";
}) {
  const title =
    kind === "created"
      ? "Most ideas created"
      : kind === "proven"
        ? "Most shipped & proven"
        : kind === "killed"
          ? "Most ideas killed"
          : kind === "reels"
            ? "Most reels uploaded"
            : "Most posts";
  const row =
    kind === "created"
      ? data.individuals.mostIdeasCreated
      : kind === "proven"
        ? data.individuals.mostProven
        : kind === "killed"
          ? data.individuals.mostKilled
          : kind === "reels"
            ? data.individuals.mostReels
            : data.individuals.mostPosts;
  const Icon =
    kind === "created" ? Lightbulb
    : kind === "proven" ? Flame
    : kind === "killed" ? Skull
    : Clapperboard;
  const accent =
    kind === "posts" ? "text-emerald-400"
    : kind === "reels" ? "text-pink-400"
    : "text-sky-400";
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 gap-8">
      <motion.p
        className={`text-xs uppercase tracking-[0.3em] font-bold flex items-center justify-center gap-2 ${accent}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Icon className={`w-4 h-4 ${accent}`} />
        {title}
      </motion.p>
      {row ? (
        <>
          <motion.h3
            className="text-5xl sm:text-6xl font-black text-white leading-tight"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
          >
            {row.name}
          </motion.h3>
          <WaterRiseText delay={0.08}>
            <span className="text-8xl sm:text-9xl font-black text-white tabular-nums block leading-none">
              {row.count}
            </span>
          </WaterRiseText>
        </>
      ) : (
        <p className="text-sm text-zinc-500">No data for this stat in {data.monthLabel}.</p>
      )}
    </div>
  );
}

function StepTopReel({ data }: { data: MonthlyWrapData }) {
  const page = data.topReelPage;
  const views = useCountUp(page ? page.views : 0);
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-2 space-y-5">
      <motion.p
        className="text-[10px] uppercase tracking-[0.25em] font-bold flex items-center justify-center gap-1.5 text-pink-400"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Clapperboard className="w-3.5 h-3.5 text-pink-400" />
        Top reel page
      </motion.p>
      {page ? (
        <>
          <motion.h3
            className="text-3xl sm:text-4xl font-black text-white leading-tight"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
          >
            @{page.handle}
          </motion.h3>
          <motion.p
            className="text-5xl sm:text-6xl font-black tabular-nums text-pink-300 leading-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 240, damping: 22 }}
          >
            {views.toLocaleString()}
          </motion.p>
          <motion.p
            className="text-xs text-zinc-400 uppercase tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38, duration: 0.4 }}
          >
            reel views this month
          </motion.p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">No reel data for {data.monthLabel}.</p>
      )}
    </div>
  );
}

function StepOutro({ data, onDone }: { data: MonthlyWrapData; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center text-center justify-center min-h-[260px] gap-4">
      <motion.h3
        className="text-xl font-bold text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        That's a wrap for {data.monthLabel}
      </motion.h3>
      <motion.p
        className="text-sm text-zinc-400 max-w-sm leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        {WRAP_ROLLOUT_EXPLAINER}
      </motion.p>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 22 }}
      >
        <Button onClick={onDone} className="bg-violet-600 hover:bg-violet-500 text-white px-6">
          Done
        </Button>
      </motion.div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function StepPersonStats({ data, team }: { data: MonthlyWrapData; team: TeamKey }) {
  const meta = TEAM_META[team];
  const members = data.personStats.filter((p: PersonStat) => p.team === team);
  const accentColor = team === "garfields" ? "text-violet-400" : "text-blue-400";

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="text-center mb-1">
        <p className={`text-[10px] uppercase tracking-[0.25em] font-bold mb-1 ${accentColor}`}>
          Team breakdown
        </p>
        <h3 className="text-xl font-bold text-white">
          {meta.emoji} {meta.label}
        </h3>
      </div>
      <div className="w-full space-y-3">
        {members.map((person: PersonStat, i: number) => (
          <motion.div
            key={person.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-white/5 bg-white/[0.04] px-4 py-3"
          >
            <p className="text-sm font-bold text-white mb-2.5">
              {person.emoji} {person.name}
            </p>
            <div className="grid grid-cols-4 gap-1 divide-x divide-white/5">
              <StatBox label="Ideas" value={person.ideasCreated} color="text-sky-400" />
              <StatBox label="Posts" value={person.posts} color="text-emerald-400" />
              <StatBox label="Proven" value={person.proven} color="text-green-400" />
              <StatBox label="Killed" value={person.killed} color="text-rose-400" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Coordinates autoload, a single modal, and the tab. Wrap a layout and render
 * `<MonthlyWrapOpenButton />` as a child so the chip can open the same modal.
 */
export function MonthlyWrapRoot({ children = null }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const userKey = useWrapUserKey();
  const cal = getActiveReportMonth();
  const skipCalAuto = useRef(false);

  useEffect(() => {
    stashWrapMonthFromUrl();
  }, []);

  const goWrap = useCallback(
    (month: string, replace = false) => {
      navigate(`/wrap?month=${encodeURIComponent(month)}`, { replace });
    },
    [navigate],
  );

  useEffect(() => {
    if (!userKey) return;
    const test = getWrapMonthFromUrl();
    if (!test) return;
    skipCalAuto.current = true;
    clearPendingWrapMonth();
    goWrap(test, true);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("wrap");
      const next = u.pathname + (u.search || "") + (u.hash || "");
      window.history.replaceState({}, "", next);
    } catch {
      /* ignore */
    }
  }, [userKey, goWrap]);

  useEffect(() => {
    if (!userKey || !cal || skipCalAuto.current) return;
    const st = readWrapState(userKey, cal);
    if (shouldAutoOpenModal(true, st)) {
      goWrap(cal, true);
      writeWrapState(userKey, cal, {
        firstOpenedAt: st?.firstOpenedAt || Date.now(),
        autoModalShown: true,
      });
    }
  }, [userKey, cal, goWrap]);

  const openForMonth = useCallback((ym: string) => goWrap(ym), [goWrap]);

  return (
    <MonthlyWrapContext.Provider value={{ openForMonth }}>
      {children}
    </MonthlyWrapContext.Provider>
  );
}
