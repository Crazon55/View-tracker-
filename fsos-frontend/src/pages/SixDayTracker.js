import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace, useAccess } from "../domain/store";
import { PageHeader, StatCard } from "../components/common/PageHeader";
import { IPBadge } from "../components/common/badges";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { fmtDate } from "../domain/dates";
import { monthOf, shiftMonth, ipMeta } from "../domain/sixDay";
import {
  TRACKER_GROUPS, trackerGroup, sixDayMonth, sixDayOverdue, pageSummaries, isIPFilled, fmtCompact, monthLabel,
} from "../domain/toolSelectors";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const COLS = 3;
const rowsOf = (items) => {
  const out = [];
  for (let i = 0; i < items.length; i += COLS) out.push(items.slice(i, i + COLS));
  return out;
};

export default function SixDayTracker() {
  const { db, today, actions } = useWorkspace();
  const { canEdit: canEditArea } = useAccess();
  const canEdit = canEditArea("six_day");
  const [tab, setTab] = useState("cycles");
  const [month, setMonth] = useState(() => monthOf(today));
  const [expanded, setExpanded] = useState(null);
  const [groups, setGroups] = useState([]);

  const allIps = db.ips;
  const groupCounts = useMemo(() => {
    const c = {};
    allIps.forEach((ip) => { const g = trackerGroup(ip); c[g] = (c[g] || 0) + 1; });
    return c;
  }, [allIps]);
  const activeCount = allIps.filter((ip) => trackerGroup(ip) !== "inactive").length;

  // Default "All" hides Inactive — pick the Inactive pill to see paused IPs.
  const ips = useMemo(() => allIps.filter((ip) => {
    const g = trackerGroup(ip);
    return groups.length ? groups.includes(g) : g !== "inactive";
  }), [allIps, groups]);
  const ipIds = useMemo(() => new Set(ips.map((i) => i.id)), [ips]);

  const cycles = useMemo(() => sixDayMonth(db, month, today), [db, month, today]);
  const overdue = useMemo(() => (month === monthOf(today) ? sixDayOverdue(db, today) : []), [db, month, today]);
  const summaries = useMemo(() => pageSummaries(db, month).filter((s) => ipIds.has(s.ip.id)), [db, month, ipIds]);
  const totalViews = summaries.reduce((s, p) => s + p.cycleViewsSum, 0);
  const assignee = db.users.find((u) => u.id === db.sixDay.config.assigneeId);

  const toggleGroup = (k) => setGroups((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));
  const shift = (d) => { setMonth((m) => shiftMonth(m, d)); setExpanded(null); };

  return (
    <div className="p-6" data-testid="six-day-page">
      <PageHeader title="6-Day Tracker" icon={Icons.Timer} subtitle="Cycle tracking — auto-cycles from the 1st of every month (1–6, 7–12, 13–18, 19–24, 25–end). Views logged here feed Growth.">
        <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
          {[["cycles", "Cycles"], ["reconcile", "Month-end fix"]].map(([v, l]) => (
            <button key={v} data-testid={`six-day-tab-${v}`} onClick={() => setTab(v)}
              className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", tab === v ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>{l}</button>
          ))}
        </div>
      </PageHeader>

      {overdue.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" data-testid="six-day-overdue">
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-60" /><span className="relative h-2.5 w-2.5 rounded-full bg-amber-500" /></span>
          <div>
            <p className="text-sm font-semibold text-amber-900">{overdue.length} cycle{overdue.length > 1 ? "s" : ""} overdue</p>
            <p className="text-xs text-amber-800/80 mt-0.5">
              {overdue.map((c) => `Cycle ${c.cycle} (${fmtDate(c.start)}–${fmtDate(c.end)}): ${c.missingCount} IP${c.missingCount === 1 ? "" : "s"} unfilled`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#E6E1D8] bg-white px-3 py-2">
        <button onClick={() => shift(-1)} className="rounded-md p-1.5 hover:bg-stone-100" aria-label="Previous month" data-testid="six-day-prev"><Icons.ChevronLeft className="h-4 w-4" /></button>
        <h2 className="w-36 text-center font-serif text-base text-stone-900" data-testid="six-day-month">{monthLabel(month)}</h2>
        <button onClick={() => shift(1)} className="rounded-md p-1.5 hover:bg-stone-100" aria-label="Next month" data-testid="six-day-next"><Icons.ChevronRight className="h-4 w-4" /></button>
        <div className="flex items-baseline gap-1.5 pl-1">
          <span className="font-serif text-xl text-stone-900 tabular-nums">{fmtCompact(totalViews)}</span>
          <span className="text-[11px] text-stone-500">total views</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-stone-500">
          <Icons.BellRing className="h-3.5 w-3.5" /> Overdue alerts go to
          {canEdit ? (
            <Select value={db.sixDay.config.assigneeId || ""} onValueChange={(v) => { actions.setSixDayAssignee(v); toast.success("6-day assignee updated"); }}>
              <SelectTrigger className="h-8 w-44 text-xs" data-testid="six-day-assignee"><SelectValue placeholder="Nobody" /></SelectTrigger>
              <SelectContent>{db.users.filter((u) => u.active).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : <span className="font-medium text-stone-800">{assignee?.name || "nobody"}</span>}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400 font-mono">Filter by group</span>
        <Pill on={!groups.length} onClick={() => setGroups([])} testid="six-day-group-all">All <Count n={activeCount} /></Pill>
        {TRACKER_GROUPS.filter((g) => groupCounts[g.key]).map((g) => (
          <Pill key={g.key} on={groups.includes(g.key)} onClick={() => toggleGroup(g.key)} testid={`six-day-group-${g.key}`}>
            <span aria-hidden>{g.emoji}</span>{g.label}<Count n={groupCounts[g.key]} />
          </Pill>
        ))}
        {groupCounts.none > 0 && !groups.length && <span className="ml-auto text-[10px] text-stone-400">{groupCounts.none} IP{groupCounts.none === 1 ? "" : "s"} not in a group yet — set one in Settings → IPs</span>}
      </div>

      {!canEdit && <p className="mb-3 text-[11px] text-stone-500"><Icons.Eye className="mr-1 inline h-3 w-3" />View only — ask an admin for Edit on the 6-Day Tracker to log views.</p>}

      {ips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">No IPs in this group. Switch the filter above.</div>
      ) : tab === "cycles" ? (
        <div className="space-y-2.5">
          {cycles.map((c) => (
            <CycleCard key={`${month}-${c.cycle}`} cycle={c} month={month} ips={ips} ipIds={ipIds} canEdit={canEdit}
              expanded={expanded === c.cycle} onToggle={() => setExpanded(expanded === c.cycle ? null : c.cycle)} />
          ))}
        </div>
      ) : (
        <ReconcileView month={month} summaries={summaries} canEdit={canEdit} />
      )}
    </div>
  );
}

function Pill({ on, onClick, children, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={on}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        on ? "border-stone-800 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}>
      {children}
    </button>
  );
}
const Count = ({ n }) => <span className="font-mono text-[10px] opacity-70 tabular-nums">{n}</span>;

function CycleCard({ cycle, month, ips, ipIds, canEdit, expanded, onToggle }) {
  const { db } = useWorkspace();
  const [openId, setOpenId] = useState(null);
  useEffect(() => { if (!expanded) setOpenId(null); }, [expanded]);

  const entries = cycle.entries.filter((e) => ipIds.has(e.ipId));
  const totalViews = entries.reduce((s, e) => s + (e.views || 0), 0);
  const filled = ips.filter((ip) => isIPFilled(db, month, cycle.cycle, ip.id)).length;
  const pct = ips.length ? Math.round((filled / ips.length) * 100) : 0;
  const tone = {
    done: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "Done", Icon: Icons.CheckCircle2, icon: "text-emerald-600" },
    active: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-800 border-amber-200", label: "Active", Icon: Icons.Clock, icon: "text-amber-600" },
    upcoming: { bar: "bg-stone-300", badge: "bg-stone-50 text-stone-500 border-stone-200", label: "Upcoming", Icon: Icons.Clock, icon: "text-stone-400" },
  }[cycle.status];
  const openIp = ips.find((i) => i.id === openId);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#E6E1D8] bg-white" data-testid={`cycle-${cycle.cycle}`}>
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", tone.bar)} />
      <button onClick={onToggle} className="flex w-full items-center justify-between py-4 pl-6 pr-5 text-left hover:bg-stone-50/70" data-testid={`cycle-toggle-${cycle.cycle}`}>
        <div className="flex items-center gap-3">
          <tone.Icon className={cn("h-4 w-4", tone.icon)} />
          <span className="font-serif text-base text-stone-900">Cycle {cycle.cycle}</span>
          <span className="text-xs text-stone-500">{fmtDate(cycle.start)} — {fmtDate(cycle.end)}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", tone.badge)}>{tone.label}</span>
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden text-right sm:block">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-mono">Views</p>
            <p className="font-serif text-xl leading-none text-stone-900 tabular-nums">{fmtCompact(totalViews)}</p>
          </div>
          <div className="hidden min-w-[84px] text-right sm:block">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-mono">IPs filled</p>
            <p className="text-sm font-semibold leading-none text-stone-900">{filled}<span className="text-stone-400">/{ips.length}</span></p>
            <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-stone-100"><div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} /></div>
          </div>
          {expanded ? <Icons.ChevronUp className="h-4 w-4 text-stone-400" /> : <Icons.ChevronDown className="h-4 w-4 text-stone-400" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-stone-100 p-3">
          {rowsOf(ips).map((row, i) => (
            <Fragment key={i}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {row.map((ip) => (
                  <IPChip key={ip.id} ip={ip} cycle={cycle} month={month} selected={openId === ip.id}
                    onSelect={() => setOpenId(openId === ip.id ? null : ip.id)} />
                ))}
              </div>
              {openIp && row.some((ip) => ip.id === openId) && (
                <IPDetailSheet key={`${month}-${cycle.cycle}-${openIp.id}`} ip={openIp} cycle={cycle} month={month} canEdit={canEdit} onClose={() => setOpenId(null)} />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function IPChip({ ip, cycle, month, selected, onSelect }) {
  const { db } = useWorkspace();
  const e = cycle.entries.find((x) => x.ipId === ip.id);
  const hasData = isIPFilled(db, month, cycle.cycle, ip.id);
  const { handle } = ipMeta(ip);
  return (
    <button type="button" onClick={onSelect} data-testid={`ip-chip-${cycle.cycle}-${ip.id}`}
      className={cn("flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
        selected ? "border-stone-800 bg-[#F5F2EC]" : "border-stone-200 bg-white hover:border-stone-300")}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", hasData ? "bg-emerald-500" : "bg-stone-300")} />
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: ip.hex }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-stone-900">{ip.name}</span>
        <span className="block truncate text-[11px] text-stone-500">@{handle}</span>
      </span>
      {(e?.views > 0 || e?.reelPct != null || e?.postPct != null) && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          {e.views > 0 && <span className="text-xs font-semibold text-stone-900 tabular-nums">{fmtCompact(e.views)}</span>}
          <span className="flex gap-1">
            {e.reelPct != null && <span className="rounded bg-violet-50 px-1 py-0.5 text-[9px] font-semibold text-violet-700 tabular-nums">R {e.reelPct}%</span>}
            {e.postPct != null && <span className="rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 tabular-nums">P {e.postPct}%</span>}
          </span>
        </span>
      )}
      <Icons.ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform", selected && "rotate-180")} />
    </button>
  );
}

const optPct = (s) => { const t = String(s).trim(); if (t === "") return null; const n = Number(t); return Number.isNaN(n) ? null : Math.max(0, Math.min(100, Math.round(n))); };
const optNum = (s) => { const t = String(s).trim(); if (t === "") return null; const n = Number(t); return Number.isNaN(n) ? null : n; };
const str = (v) => (v == null ? "" : String(v));

function IPDetailSheet({ ip, cycle, month, canEdit, onClose }) {
  const { actions } = useWorkspace();
  const entry = cycle.entries.find((x) => x.ipId === ip.id);
  const items = cycle.topContent.filter((t) => t.ipId === ip.id).sort((a, b) => (b.views || 0) - (a.views || 0));
  const init = { views: str(entry?.views ?? 0), reelPct: str(entry?.reelPct), postPct: str(entry?.postPct), reelPerf: str(entry?.reelPerf), postPerf: str(entry?.postPerf) };
  const [form, setForm] = useState(init);
  const saved = useRef(init);
  const formRef = useRef(form);
  formRef.current = form;
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ link: "", views: "", type: "reel" });
  const { handle } = ipMeta(ip);

  const save = (f = formRef.current) => {
    if (!canEdit) return;
    const s = saved.current;
    if (Object.keys(f).every((k) => f[k] === s[k])) return;
    actions.upsertSixDayEntry({
      month, cycle: cycle.cycle, ipId: ip.id,
      views: Math.max(0, Number(f.views) || 0),
      reelPct: optPct(f.reelPct), postPct: optPct(f.postPct),
      reelPerf: optNum(f.reelPerf), postPerf: optNum(f.postPerf),
    });
    saved.current = { ...f };
  };
  // auto-save any unsaved edits when the sheet closes
  useEffect(() => () => save(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const field = (key, label, w, props = {}) => (
    <div className={w}>
      <p className="mb-1 text-[9px] uppercase tracking-wide text-stone-400 font-mono">{label}</p>
      <Input type="number" value={form[key]} disabled={!canEdit} data-testid={`sd-${key}`}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} onBlur={() => save()}
        className="h-8 px-2 text-xs tabular-nums" {...props} />
    </div>
  );

  const addItem = () => {
    if (!newItem.link) return;
    actions.addSixDayTopContent({ month, cycle: cycle.cycle, ipId: ip.id, link: newItem.link, views: Number(newItem.views) || 0, type: newItem.type });
    setNewItem({ link: "", views: "", type: "reel" });
    setAdding(false);
  };

  return (
    <div className="rounded-lg border border-stone-300 bg-[#FAF8F5]" data-testid="ip-detail-sheet">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
        <div className="flex items-center gap-2"><IPBadge ip={ip} showName /><span className="text-xs text-stone-500">@{handle}</span></div>
        <div className="flex items-center gap-3">
          {entry?.views > 0 && <span className="text-sm font-semibold text-stone-800 tabular-nums">{fmtCompact(entry.views)}</span>}
          <button onClick={() => { save(); onClose(); }} className="rounded-md p-1 text-stone-500 hover:bg-stone-200/60" aria-label="Close"><Icons.ChevronUp className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          {field("views", "Total", "w-32", { min: 0 })}
          {field("reelPct", "Reel %", "w-16", { min: 0, max: 100 })}
          {field("postPct", "Post %", "w-16", { min: 0, max: 100 })}
          {field("reelPerf", "Reel baseline", "w-24", { step: "0.01" })}
          {field("postPerf", "Post baseline", "w-24", { step: "0.01" })}
          {canEdit && <span className="pb-2 text-[10px] text-stone-400">Saves when you leave a field</span>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 font-mono">Topline posts / reels</p>
            {items.length > 0 && <span className="text-[10px] text-stone-500">Sum: <b className="text-stone-800 tabular-nums">{fmtCompact(items.reduce((s, t) => s + (t.views || 0), 0))}</b></span>}
          </div>
          {items.length > 0 && (
            <div className="space-y-1 rounded-md border border-stone-200 bg-white p-2">
              {items.map((it) => <TopContentRow key={it.id} item={it} canEdit={canEdit} />)}
            </div>
          )}
          {canEdit && (adding ? (
            <div className="space-y-2 rounded-md border border-stone-200 bg-white p-3">
              <div className="flex flex-wrap gap-2">
                <Input value={newItem.link} onChange={(e) => setNewItem({ ...newItem, link: e.target.value })} placeholder="Instagram link…" className="h-8 min-w-[160px] flex-1 text-xs" data-testid="topline-link" />
                <Input type="number" min={0} value={newItem.views} onChange={(e) => setNewItem({ ...newItem, views: e.target.value })} placeholder="Views" className="h-8 w-28 text-xs tabular-nums" data-testid="topline-views" />
                <Select value={newItem.type} onValueChange={(v) => setNewItem({ ...newItem, type: v })}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="reel">Reel</SelectItem><SelectItem value="post">Post</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
                <Button size="sm" className="h-7 bg-stone-900 text-xs" disabled={!newItem.link} onClick={addItem} data-testid="topline-add">Add link</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900" data-testid="topline-open"><Icons.Plus className="h-3.5 w-3.5" /> Add topline link</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopContentRow({ item, canEdit }) {
  const { actions } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ link: item.link, views: String(item.views || 0), type: item.type });
  useEffect(() => setF({ link: item.link, views: String(item.views || 0), type: item.type }), [item.link, item.views, item.type]);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-stone-50 p-2">
        <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} className="h-7 min-w-[160px] flex-1 text-xs" />
        <Input type="number" value={f.views} onChange={(e) => setF({ ...f, views: e.target.value })} className="h-7 w-28 text-right text-xs tabular-nums" />
        <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
          <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="reel">Reel</SelectItem><SelectItem value="post">Post</SelectItem></SelectContent>
        </Select>
        <Button size="sm" className="h-7 bg-stone-900 px-2" onClick={() => { actions.updateSixDayTopContent(item.id, { link: f.link, views: Number(f.views) || 0, type: f.type }); setEditing(false); }}><Icons.Save className="h-3 w-3" /></Button>
        <button onClick={() => setEditing(false)} className="px-1 text-xs text-stone-400 hover:text-stone-700">✕</button>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50">
      <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", item.type === "reel" ? "border-violet-200 text-violet-700" : "border-emerald-200 text-emerald-700")}>{item.type}</span>
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-stone-700 hover:text-stone-950">
        <Icons.ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{item.link.replace(/https?:\/\/(www\.)?instagram\.com\//, "").slice(0, 44)}</span>
      </a>
      <span className="shrink-0 text-xs font-semibold text-stone-900 tabular-nums">{fmtCompact(item.views)}</span>
      {canEdit && (
        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="px-1 text-xs text-stone-500 hover:text-stone-900">Edit</button>
          <button onClick={() => actions.deleteSixDayTopContent(item.id)} className="text-rose-400 hover:text-rose-600" aria-label="Delete"><Icons.Trash2 className="h-3 w-3" /></button>
        </span>
      )}
    </div>
  );
}

function ReconcileView({ month, summaries, canEdit }) {
  const { actions } = useWorkspace();
  const [drafts, setDrafts] = useState({});
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    setDrafts(Object.fromEntries(summaries.map((s) => [s.ip.id, s.actualViews != null ? String(s.actualViews) : ""])));
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOne = (ipId) => {
    const v = drafts[ipId];
    if (v === "" || v === undefined) return;
    const s = summaries.find((x) => x.ip.id === ipId);
    if (String(s?.actualViews ?? "") === v) return;
    actions.upsertSixDayActual(month, ipId, Number(v) || 0);
  };
  const saveAll = () => {
    let n = 0;
    summaries.forEach((s) => { const v = drafts[s.ip.id]; if (v !== "" && v !== undefined && v !== String(s.actualViews ?? "")) { actions.upsertSixDayActual(month, s.ip.id, Number(v) || 0); n++; } });
    toast.success(n ? `Saved ${n} dashboard total${n === 1 ? "" : "s"}` : "Nothing to save");
  };

  const totalCycle = summaries.reduce((s, p) => s + p.cycleViewsSum, 0);
  const totalActual = summaries.reduce((s, p) => { const d = drafts[p.ip.id]; return s + (d !== undefined && d !== "" ? Number(d) || 0 : p.actualViews ?? 0); }, 0);
  const drift = totalActual - totalCycle;
  const driftOf = (s) => { const d = drafts[s.ip.id]; return d !== "" && d !== undefined && !Number.isNaN(Number(d)) ? Number(d) - s.cycleViewsSum : null; };

  return (
    <div className="space-y-4" data-testid="reconcile-view">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Cycle sum" value={fmtCompact(totalCycle)} sub="from all 5 cycles" />
        <StatCard label="IG dashboard" value={totalActual > 0 ? fmtCompact(totalActual) : "—"} sub="actual monthly views" />
        <StatCard label="Drift" tone={totalActual === 0 ? "default" : drift > 0 ? "good" : drift < 0 ? "bad" : "default"}
          value={totalActual > 0 ? `${drift > 0 ? "+" : ""}${fmtCompact(drift)}` : "—"} sub="dashboard vs cycles" />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E6E1D8] bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Monthly reconciliation</h3>
          <p className="mt-0.5 text-xs text-stone-500">Enter actual IG dashboard totals per IP. Drift shows how far cycle logging was off.</p>
        </div>
        {canEdit && <Button size="sm" onClick={saveAll} className="bg-stone-900" data-testid="reconcile-save-all"><Icons.Save className="mr-1 h-3.5 w-3.5" /> Save all</Button>}
      </div>
      <div className="space-y-2">
        {rowsOf(summaries).map((row, i) => {
          const open = row.find((s) => s.ip.id === openId);
          return (
            <Fragment key={i}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {row.map((s) => {
                  const d = driftOf(s);
                  return (
                    <button key={s.ip.id} onClick={() => setOpenId(openId === s.ip.id ? null : s.ip.id)} data-testid={`reconcile-chip-${s.ip.id}`}
                      className={cn("flex items-center gap-2.5 rounded-md border px-3 py-2 text-left", openId === s.ip.id ? "border-stone-800 bg-[#F5F2EC]" : "border-stone-200 bg-white hover:border-stone-300")}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", d != null ? "bg-violet-500" : "bg-stone-300")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-stone-900">{s.ip.name}</span>
                        <span className="mt-0.5 block text-[10px] text-stone-500 tabular-nums">Cycle {fmtCompact(s.cycleViewsSum)}
                          {d != null && <span className={d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : ""}> · {d > 0 ? "+" : ""}{fmtCompact(d)} drift</span>}
                        </span>
                      </span>
                      <Icons.ChevronDown className={cn("h-3.5 w-3.5 text-stone-400 transition-transform", openId === s.ip.id && "rotate-180")} />
                    </button>
                  );
                })}
              </div>
              {open && (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-stone-300 bg-[#FAF8F5] p-4 sm:grid-cols-3">
                  <div><p className="text-[9px] uppercase text-stone-400 font-mono">Cycle sum</p><p className="font-serif text-lg text-stone-900 tabular-nums">{fmtCompact(open.cycleViewsSum)}</p></div>
                  <div>
                    <p className="text-[9px] uppercase text-stone-400 font-mono">IG dashboard</p>
                    <Input type="number" value={drafts[open.ip.id] ?? ""} disabled={!canEdit} placeholder="Enter views…" data-testid="reconcile-input"
                      onChange={(e) => setDrafts((p) => ({ ...p, [open.ip.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveOne(open.ip.id); }} onBlur={() => canEdit && saveOne(open.ip.id)}
                      className="mt-0.5 h-9 text-sm tabular-nums" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-stone-400 font-mono">Drift</p>
                    {driftOf(open) != null ? (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold tabular-nums", driftOf(open) > 0 ? "text-emerald-700" : driftOf(open) < 0 ? "text-rose-700" : "text-stone-500")}>
                        {driftOf(open) > 0 ? <Icons.TrendingUp className="h-3.5 w-3.5" /> : driftOf(open) < 0 ? <Icons.TrendingDown className="h-3.5 w-3.5" /> : null}
                        {driftOf(open) > 0 ? "+" : ""}{fmtCompact(driftOf(open))}
                      </span>
                    ) : <span className="text-sm text-stone-400">—</span>}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
