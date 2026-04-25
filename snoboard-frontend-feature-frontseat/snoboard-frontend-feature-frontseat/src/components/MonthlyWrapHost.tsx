import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronRight, ChevronLeft, Trophy, Flame, X, Lightbulb, Skull } from "lucide-react";
import {
  getActiveReportMonth,
  buildMonthlyWrapData,
  readWrapState,
  writeWrapState,
  shouldAutoOpenModal,
  findTabReportMonth,
  isTabVisible,
  formatViewsShort,
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

const STEP_COUNT = 9;

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
        className="max-w-lg border border-white/10 bg-zinc-950/95 text-zinc-100 p-0 gap-0 overflow-hidden sm:max-w-lg"
      >
        {isLoading && (
          <div className="p-10 text-center text-zinc-500 text-sm">Loading your wrap…</div>
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
          <div className="p-8 text-center text-zinc-500 text-sm">Nothing to show for this month yet.</div>
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
    <div className="relative min-h-[420px] flex flex-col">
      <div className="absolute top-2 right-2 z-20">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <DialogHeader className="p-4 pb-0 pr-10">
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
      <div className="flex-1 p-5 pt-4 min-h-[320px]">
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
            {step === 8 && <StepOutro data={data} onDone={onDone} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-zinc-800/80">
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
      <div className="text-4xl" aria-hidden>
        ✨
      </div>
      <h2 className="text-2xl font-bold text-white tracking-tight">Your {data.monthLabel} wrap</h2>
      <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
        A quick look at views, top pages, teams, and creator highlights — tap Next when you’re ready.
      </p>
    </div>
  );
}

function StepTotal({ data }: { data: MonthlyWrapData }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-violet-400 font-bold">The big number</p>
      <h3 className="text-3xl sm:text-4xl font-black text-white tabular-nums">
        {formatViewsShort(data.totalViews)}
        <span className="text-lg font-semibold text-zinc-500 ml-2">views</span>
      </h3>
      <p className="text-sm text-zinc-400">Total 6-day tracker views recorded for {data.monthLabel}.</p>
    </div>
  );
}

function StepTopPage({ data }: { data: MonthlyWrapData }) {
  const p = data.topPage;
  if (!p) {
    return <p className="text-sm text-zinc-500">No per-page data for this month yet.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">Top page</p>
      <h3 className="text-2xl font-bold text-white">@{p.handle}</h3>
      {p.name ? <p className="text-sm text-zinc-400">{p.name}</p> : null}
      <p className="text-3xl font-black text-white tabular-nums">{formatViewsShort(p.views)} views</p>
    </div>
  );
}

function StepTop5({ data }: { data: MonthlyWrapData }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-400 font-bold">Top 5 pages</p>
      <ol className="space-y-2">
        {data.topPages.length === 0 && <li className="text-sm text-zinc-500">No data.</li>}
        {data.topPages.map((p, i) => (
          <li
            key={p.pageId}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
          >
            <span className="text-zinc-500 text-xs font-bold w-5">{i + 1}</span>
            <span className="flex-1 min-w-0 text-sm text-white font-medium truncate">@{p.handle}</span>
            <span className="text-xs text-zinc-300 tabular-nums font-bold">{formatViewsShort(p.views)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepTeam({ data }: { data: MonthlyWrapData }) {
  const w = data.winningTeam;
  if (!w) {
    return <p className="text-sm text-zinc-500">No team view data this month.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold">Team of the month</p>
      <div className="flex items-center gap-2 text-2xl font-black text-white">
        <Trophy className="w-6 h-6 text-amber-400" />
        <span>
          {w.emoji} {w.label}
        </span>
      </div>
      <p className="text-sm text-zinc-400">Leader by combined views on your tracked pages — {formatViewsShort(w.views)} this month.</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Squad</p>
      <ul className="flex flex-wrap gap-2">
        {w.members.map((m) => (
          <li
            key={m}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-200 border border-violet-500/20"
          >
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepIdea({
  data,
  kind,
}: {
  data: MonthlyWrapData;
  kind: "created" | "proven" | "killed";
}) {
  const title =
    kind === "created"
      ? "Most ideas created"
      : kind === "proven"
        ? "Most shipped & proven"
        : "Most ideas killed";
  const sub =
    kind === "created"
      ? "New ideas added in the tracker this month (by created date)."
      : kind === "proven"
        ? "Ideas that reached proven / posted / scheduled stages (by update in this month — best-effort from current data)."
        : "Ideas moved to “kill” this month (by update in this month).";
  const row =
    kind === "created"
      ? data.individuals.mostIdeasCreated
      : kind === "proven"
        ? data.individuals.mostProven
        : data.individuals.mostKilled;
  const Icon = kind === "created" ? Lightbulb : kind === "proven" ? Flame : Skull;
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-sky-400 font-bold flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-sky-400" />
        {title}
      </p>
      <p className="text-xs text-zinc-500 leading-relaxed">{sub}</p>
      {row ? (
        <>
          <h3 className="text-2xl font-bold text-white">{row.name}</h3>
          <p className="text-3xl font-black text-white tabular-nums">{row.count}</p>
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
      <h3 className="text-xl font-bold text-white">That’s a wrap for {data.monthLabel}</h3>
      <p className="text-sm text-zinc-400">See you next month — we’ll be here on the last day (and 2 days after).</p>
      <Button onClick={onDone} className="bg-violet-600 hover:bg-violet-500 text-white px-6">
        Done
      </Button>
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

  useEffect(() => {
    if (!userKey || !cal) return;
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
