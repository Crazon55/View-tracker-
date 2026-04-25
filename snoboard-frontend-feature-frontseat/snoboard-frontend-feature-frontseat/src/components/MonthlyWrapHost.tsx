import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronRight, ChevronLeft, Trophy, Flame, X, Lightbulb, Skull, Clapperboard } from "lucide-react";
import {
  getActiveReportMonth,
  getTestWrapMonthFromUrl,
  buildMonthlyWrapData,
  readWrapState,
  writeWrapState,
  shouldAutoOpenModal,
  findTabReportMonth,
  isTabVisible,
  formatViewsShort,
  WRAP_ROLLOUT_EXPLAINER,
  type MonthlyWrapData,
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
import { useWrapConfetti, WaterRiseText } from "./MonthlyWrapEffects";

const STEP_COUNT = 10;

const MonthlyWrapContext = createContext<{
  openForMonth: (ym: string) => void;
} | null>(null);

function useWrapUserKey() {
  const { user } = useAuth();
  return user?.id || user?.email || null;
}

function useMonthlyWrapState() {
  const userKey = useWrapUserKey();
  const [tick, setTick] = useState(0);
  const tabMonth = userKey ? findTabReportMonth(userKey) : null;
  const st = tabMonth && userKey ? readWrapState(userKey, tabMonth) : null;
  const visible = !!(isTabVisible(st) && !st?.completed);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [userKey, tabMonth]);
  void tick;
  return { tabMonth, showTab: visible, label: tabMonth ? shortMonthLabel(tabMonth) : "" };
}

function shortMonthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "Monthly";
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function MonthlyWrapOpenButton({ className = "" }: { className?: string }) {
  const ctx = useContext(MonthlyWrapContext);
  const { tabMonth, showTab, label } = useMonthlyWrapState();
  const userKey = useWrapUserKey();
  if (!showTab || !tabMonth) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (userKey) {
          const st = readWrapState(userKey, tabMonth);
          writeWrapState(userKey, tabMonth, {
            firstOpenedAt: st?.firstOpenedAt || Date.now(),
          });
        }
        ctx?.openForMonth(tabMonth);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-violet-500/35 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25 transition-colors ${className}`}
    >
      <Sparkles className="w-3.5 h-3.5" />
      {label} wrap
    </button>
  );
}

type ModalProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When opening from the tab (outside the calendar window). */
  forcedReportMonth?: string | null;
  /** Resolved month for the open session (forced || calendar). */
  effectiveMonth?: string | null;
};

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

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-wrap", reportMonth],
    queryFn: async () => {
      const [ideas, niches, six] = await Promise.all([
        getTrackerIdeas(),
        getTrackerNiches(),
        reportMonth ? getSixDayMonth(reportMonth) : Promise.resolve(null),
      ]);
      if (!reportMonth) return null;
      return buildMonthlyWrapData(reportMonth, ideas, niches, six);
    },
    enabled: open && !!reportMonth,
    staleTime: 120_000,
  });

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
          "fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col",
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
}: {
  data: MonthlyWrapData;
  step: number;
  setStep: (n: number) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const next = () => {
    if (step >= STEP_COUNT - 1) onDone();
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
            {step + 1} / {STEP_COUNT}
          </span>
        </div>
        <div className="h-1 mt-2 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            initial={false}
            animate={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
          />
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40, filter: "blur(8px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -30, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {step === 0 && <StepIntro data={data} />}
            {step === 1 && <StepTotal data={data} />}
            {step === 2 && <StepTopPage data={data} />}
            {step === 3 && <StepTop5 data={data} />}
            {step === 4 && <StepTeam data={data} />}
            {step === 5 && <StepIdea data={data} kind="created" />}
            {step === 6 && <StepIdea data={data} kind="proven" />}
            {step === 7 && <StepIdea data={data} kind="killed" />}
            {step === 8 && <StepIdea data={data} kind="posts" />}
            {step === 9 && <StepOutro data={data} onDone={onDone} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0} className="text-zinc-400">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {step < STEP_COUNT - 1 ? (
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
        A quick look at views, top pages, teams, and creator highlights — tap Next when you’re ready.
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

function StepTotal({ data }: { data: MonthlyWrapData }) {
  useWrapConfetti(true, true);
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-2 space-y-6">
      <motion.p
        className="text-[10px] uppercase tracking-[0.25em] text-violet-400 font-bold"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        The big number
      </motion.p>
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        <WaterRiseText>
          <span className="text-5xl sm:text-6xl font-black text-white tabular-nums leading-none block">
            {formatViewsShort(data.totalViews)}
          </span>
        </WaterRiseText>
        <motion.span
          className="text-xl sm:text-2xl font-semibold text-zinc-500"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.72, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          views
        </motion.span>
      </div>
    </div>
  );
}

function StepTopPage({ data }: { data: MonthlyWrapData }) {
  const p = data.topPage;
  useWrapConfetti(!!p, false);
  if (!p) {
    return (
      <p className="text-sm text-zinc-500 text-center min-h-[280px] flex items-center justify-center">
        No per-page data for this month yet.
      </p>
    );
  }
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-2 space-y-5">
      <motion.p
        className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Top page
      </motion.p>
      <motion.h3
        className="text-2xl sm:text-3xl font-bold text-white break-all max-w-full px-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        @{p.handle}
      </motion.h3>
      <div className="flex flex-wrap items-baseline justify-center gap-x-2.5">
        <WaterRiseText delay={0.08}>
          <span className="text-5xl sm:text-6xl font-black text-white tabular-nums leading-none block">
            {formatViewsShort(p.views)}
          </span>
        </WaterRiseText>
        <motion.span
          className="text-xl font-medium text-zinc-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.35 }}
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
        className="text-lg font-bold text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.35 }}
      >
        Leaderboard
      </motion.h3>
      <motion.ol
        className="space-y-2.5 w-full"
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
            className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left"
          >
            <span className="text-zinc-500 text-xs font-bold w-5 tabular-nums shrink-0">{i + 1}</span>
            <span className="flex-1 min-w-0 text-sm text-white font-medium truncate text-left">
              @{p.handle}
            </span>
            <span className="text-xs text-zinc-200 tabular-nums font-bold min-w-[3.5rem] text-right shrink-0">
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
        className="flex items-center justify-center gap-2 text-2xl sm:text-3xl font-black text-white"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 shrink-0" />
        <span>
          {w.emoji} {w.label}
        </span>
      </motion.div>
      <motion.p
        className="text-sm text-zinc-400 max-w-sm"
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
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-200 border border-violet-500/20"
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
  kind: "created" | "proven" | "killed" | "posts";
}) {
  const title =
    kind === "created"
      ? "Most ideas created"
      : kind === "proven"
        ? "Most shipped & proven"
        : kind === "killed"
          ? "Most ideas killed"
          : "Most posts";
  const row =
    kind === "created"
      ? data.individuals.mostIdeasCreated
      : kind === "proven"
        ? data.individuals.mostProven
        : kind === "killed"
          ? data.individuals.mostKilled
          : data.individuals.mostPosts;
  const Icon = kind === "created" ? Lightbulb : kind === "proven" ? Flame : kind === "killed" ? Skull : Clapperboard;
  const accent = kind === "posts" ? "text-emerald-400" : "text-sky-400";
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center px-2 space-y-6">
      <motion.p
        className={`text-[10px] uppercase tracking-[0.25em] font-bold flex items-center justify-center gap-1.5 ${accent}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Icon className={`w-3.5 h-3.5 ${accent}`} />
        {title}
      </motion.p>
      {row ? (
        <>
          <motion.h3
            className="text-2xl sm:text-3xl font-bold text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {row.name}
          </motion.h3>
          <WaterRiseText delay={0.08}>
            <span className="text-4xl sm:text-5xl font-black text-white tabular-nums block leading-none">
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

function StepOutro({ data, onDone }: { data: MonthlyWrapData; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center text-center justify-center min-h-[260px] gap-4">
      <motion.h3
        className="text-xl font-bold text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        That’s a wrap for {data.monthLabel}
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

/**
 * Coordinates autoload, a single modal, and the tab. Wrap a layout and render
 * `<MonthlyWrapOpenButton />` as a child so the chip can open the same modal.
 */
export function MonthlyWrapRoot({ children = null }: { children?: ReactNode }) {
  const userKey = useWrapUserKey();
  const [open, setOpen] = useState(false);
  const [forcedMonth, setForcedMonth] = useState<string | null>(null);
  const cal = getActiveReportMonth();
  const reportForModal = forcedMonth || cal;
  const skipCalAuto = useRef(false);

  /** `?wrap=1` in dev: force the real wrap open for testing (no rollout-window wait). */
  useEffect(() => {
    if (!userKey) return;
    const test = getTestWrapMonthFromUrl();
    if (!test) return;
    skipCalAuto.current = true;
    setForcedMonth(test);
    setOpen(true);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("wrap");
      const next = u.pathname + (u.search || "") + (u.hash || "");
      window.history.replaceState({}, "", next);
    } catch {
      /* ignore */
    }
  }, [userKey]);

  useEffect(() => {
    if (!userKey || !cal || skipCalAuto.current) return;
    const st = readWrapState(userKey, cal);
    if (shouldAutoOpenModal(true, st)) {
      setForcedMonth(null);
      setOpen(true);
      writeWrapState(userKey, cal, {
        firstOpenedAt: st?.firstOpenedAt || Date.now(),
        autoModalShown: true,
      });
    }
  }, [userKey, cal]);

  const openForMonth = useCallback((ym: string) => {
    setForcedMonth(ym);
    setOpen(true);
  }, []);

  return (
    <MonthlyWrapContext.Provider value={{ openForMonth }}>
      {children}
      <MonthlyWrapModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setForcedMonth(null);
        }}
        forcedReportMonth={forcedMonth}
        effectiveMonth={open ? reportForModal : null}
      />
    </MonthlyWrapContext.Provider>
  );
}
