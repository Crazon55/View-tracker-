// The network calendar as a calendar.
//
// It was a table of IPs down the side and ten days across the top, which is dense and
// precise but reads like a spreadsheet — you can't see a week at a glance, and "what's
// happening next Tuesday" means tracing a column. This is the month, laid out the way a
// calendar is, with the same numbers in it.
//
// Each day answers the question the floors exist to answer: how much is meant to go out
// today, and how much actually is. Posts and reels are counted separately because the
// IP floors are set that way — a day can be full on reels and empty on posts.
import React, { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../../domain/store";
import { useUI } from "../idea/IdeaModalProvider";
import { ideaById, publicationOf, matchesStream, visibleIps } from "../../domain/selectors";
import { formatCounts } from "../../domain/constants";
import { addDays, fmtDate } from "../../domain/dates";
import { IPBadge } from "../common/badges";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const ymd = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Monday-first weekday index for a YYYY-MM-DD string, without timezone surprises. */
function dowIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The six-week grid a month sits in, so the layout doesn't jump between months. */
function monthGrid(year, month) {
  const first = ymd(year, month, 1);
  const start = addDays(first, -dowIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export default function MonthCalendar({ onPlace, onDisplace }) {
  const { db, today } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [openDay, setOpenDay] = useState(null);

  const ips = useMemo(() => visibleIps(db), [db]);
  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  // Everything each day needs, worked out once rather than per cell render.
  const byDay = useMemo(() => {
    const map = {};
    const capP = ips.reduce((s, ip) => s + (ip.floors?.posts || 0), 0);
    const capR = ips.reduce((s, ip) => s + (ip.floors?.reels || 0), 0);
    for (const d of days) {
      const items = [];
      let planP = 0, planR = 0, live = 0;
      for (const p of db.placements) {
        if (p.date !== d || p.state === "cancelled") continue;
        const v = db.versions.find((x) => x.id === p.versionId);
        if (!v) continue;
        const idea = ideaById(db, v.ideaId);
        if (!matchesStream(idea, streamFilter)) continue;
        const fc = formatCounts(idea.format);
        planP += fc.posts;
        planR += fc.reels;
        const published = !!publicationOf(db, v.id);
        if (published) live += 1;
        items.push({ placement: p, version: v, idea, ip: ips.find((i) => i.id === p.ipId), published });
      }
      map[d] = { items, planP, planR, capP, capR, live };
    }
    return map;
  }, [db, days, ips, streamFilter]);

  const move = (delta) => setCursor(({ year, month }) => {
    const m = month + delta;
    return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });
  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
  };

  const inMonth = (d) => Number(d.slice(5, 7)) === cursor.month + 1;

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => move(-1)} data-testid="cal-prev">
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-sm font-medium text-stone-800">
            {MONTH[cursor.month]} {cursor.year}
          </span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => move(1)} data-testid="cal-next">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={goToday}>Today</Button>
          <span className="ml-auto text-[10px] text-stone-400">
            Planned vs the floors across {ips.length} IPs · IST
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#E6E1D8] bg-white">
          <div className="grid grid-cols-7 border-b border-stone-200 bg-[#F5F2EC]">
            {DOW.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-stone-500">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7" data-testid="month-calendar">
            {days.map((d, i) => {
              const cell = byDay[d];
              const isToday = d === today;
              const dim = !inMonth(d);
              const fullP = cell.capP > 0 && cell.planP >= cell.capP;
              const fullR = cell.capR > 0 && cell.planR >= cell.capR;
              return (
                <button
                  key={d}
                  onClick={() => setOpenDay(d)}
                  data-testid={`day-${d}`}
                  className={cn(
                    "min-h-[104px] border-b border-r border-stone-100 p-1.5 text-left align-top transition-colors hover:bg-blue-50/50",
                    i % 7 === 6 && "border-r-0",
                    dim && "bg-stone-50/60",
                    isToday && "bg-blue-50/70 ring-1 ring-inset ring-blue-300",
                    openDay === d && "ring-2 ring-inset ring-blue-400",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={cn("text-xs font-medium", dim ? "text-stone-300" : isToday ? "text-blue-700" : "text-stone-700")}>
                      {Number(d.slice(8, 10))}
                    </span>
                    {(cell.planP > 0 || cell.planR > 0) && (
                      <span className="text-[9px] text-stone-400">{cell.live}/{cell.items.length} live</span>
                    )}
                  </div>

                  {/* What the floors ask for, and what's actually booked against them. */}
                  <div className="mt-0.5 flex gap-1 text-[9px]">
                    <span className={cn("rounded px-1", fullP ? "bg-emerald-100 text-emerald-700" : cell.planP ? "bg-stone-100 text-stone-600" : "text-stone-300")}>
                      {cell.planP}/{cell.capP} P
                    </span>
                    <span className={cn("rounded px-1", fullR ? "bg-emerald-100 text-emerald-700" : cell.planR ? "bg-stone-100 text-stone-600" : "text-stone-300")}>
                      {cell.planR}/{cell.capR} R
                    </span>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {cell.items.slice(0, 3).map(({ placement, version, idea, ip, published }) => (
                      <span
                        key={placement.id}
                        role="button"
                        tabIndex={0}
                        data-testid={`cal-chip-${placement.id}`}
                        title={`${ip?.code || ""} · ${idea?.title || ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (idea?.stream === "BO" && !published) onDisplace({ boVersionId: version.id, ipId: placement.ipId, date: d });
                          else openIdea(idea.id);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); openIdea(idea.id); } }}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[9px]",
                          published ? "bg-stone-800 text-white"
                            : version.reviewStatus === "ready" ? "bg-emerald-100 text-emerald-800"
                              : "bg-indigo-100 text-indigo-800",
                        )}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: ip?.hex || "#999" }} />
                        <span className="truncate">{idea?.title}</span>
                      </span>
                    ))}
                    {cell.items.length > 3 && (
                      <span className="block text-[9px] text-stone-400">+{cell.items.length - 3} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {openDay && (
        <DayPanel
          date={openDay}
          ips={ips}
          cell={byDay[openDay]}
          onClose={() => setOpenDay(null)}
          onPlace={onPlace}
        />
      )}
    </div>
  );
}

/**
 * One day, per IP. The month grid answers "how full is this day"; placing something
 * needs to know which page it goes on, and that's what this is for.
 */
function DayPanel({ date, ips, cell, onClose, onPlace }) {
  const { db } = useWorkspace();
  const { openIdea } = useUI();

  return (
    <aside className="w-72 shrink-0 rounded-lg border border-[#E6E1D8] bg-white p-3" data-testid="day-panel">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-stone-800">{fmtDate(date)}</p>
          <p className="text-[10px] text-stone-400">
            {cell.planP}/{cell.capP} posts · {cell.planR}/{cell.capR} reels
          </p>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><Icons.X className="h-4 w-4" /></button>
      </div>

      <div className="max-h-[52vh] space-y-1.5 overflow-auto fsos-scroll">
        {ips.map((ip) => {
          const mine = cell.items.filter((x) => x.placement.ipId === ip.id);
          const reelsLeft = Math.max(0, (ip.floors?.reels || 0) - mine.reduce((s, x) => s + formatCounts(x.idea.format).reels, 0));
          return (
            <div key={ip.id} className="rounded-md border border-stone-200 p-2">
              <div className="flex items-center justify-between">
                <IPBadge ip={ip} />
                <button
                  onClick={() => onPlace({ ipId: ip.id, date })}
                  data-testid={`place-${ip.id}-${date}`}
                  className="text-[10px] text-blue-700 hover:underline"
                >
                  Place here
                </button>
              </div>
              {mine.length > 0 ? (
                <div className="mt-1 space-y-0.5">
                  {mine.map(({ placement, idea, published }) => (
                    <button
                      key={placement.id}
                      onClick={() => openIdea(idea.id)}
                      className={cn("block w-full truncate rounded px-1 py-0.5 text-left text-[10px]",
                        published ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-700")}
                    >
                      {idea.title}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-stone-400">Nothing placed</p>
              )}
              {/* Reels left on an IP's floor are what HPN moves into late in the day. */}
              {reelsLeft > 0 && (
                <p className="mt-1 text-[10px] text-amber-600">{reelsLeft} reel slot{reelsLeft === 1 ? "" : "s"} open</p>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
