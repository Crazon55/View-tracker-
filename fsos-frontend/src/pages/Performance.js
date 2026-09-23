import React, { useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader } from "../components/common/PageHeader";
import { IPBadge, PerfBadge, FormatBadge, StreamBadge } from "../components/common/badges";
import { captureTasks, ideaById, ipById, publicationOf, snapshotOf, targetFor, classify, recentBaseline, sixDayCycles, cyclePerIp, matchesStream } from "../domain/selectors";
import { istDateTimeLabel, fmtDate, nowIso, addDays } from "../domain/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { cn } from "../lib/utils";

const TABS = [["capture", "Capture"], ["ideas", "Ideas"], ["cycles", "IP Cycles"]];

export default function Performance() {
  const [tab, setTab] = useState("capture");
  return (
    <div className="p-6">
      <PageHeader title="Performance" icon={Icons.BarChart3} subtitle="Only ~24h views are required. Missing is missing; zero is a real value; late captures show their true age.">
        <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
          {TABS.map(([v, l]) => <button key={v} data-testid={`perf-tab-${v}`} onClick={() => setTab(v)} className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", tab === v ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>{l}</button>)}
        </div>
      </PageHeader>
      {tab === "capture" && <Capture />}
      {tab === "ideas" && <IdeasPerf />}
      {tab === "cycles" && <IPCycles />}
    </div>
  );
}

function Capture() {
  const { db, actions } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const tasks = captureTasks(db, streamFilter);
  const now = new Date();
  const overdue = tasks.filter((t) => !t.done && t.overdue);
  const due = tasks.filter((t) => !t.done && !t.overdue && new Date(t.dueAt) <= now);
  const soon = tasks.filter((t) => !t.done && new Date(t.dueAt) > now);
  const done = tasks.filter((t) => t.done);

  const Group = ({ title, items, tone }) => (
    <div className="rounded-lg border border-[#E6E1D8] bg-white p-4">
      <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-stone-900">{title}</h3><span className={cn("text-xs rounded-full px-2 py-0.5", tone)}>{items.length}</span></div>
      <div className="space-y-2 max-h-[60vh] overflow-auto fsos-scroll">
        {items.map((t) => <CaptureRow key={t.pub.id} t={t} openIdea={openIdea} record={actions.recordSnapshot} />)}
        {!items.length && <p className="text-[11px] text-stone-400 py-3 text-center">None</p>}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <Group title="Overdue" items={overdue} tone="bg-rose-100 text-rose-800" />
      <Group title="Due now" items={due} tone="bg-amber-100 text-amber-800" />
      <Group title="Due soon" items={soon} tone="bg-stone-100 text-stone-600" />
      <Group title="Completed" items={done} tone="bg-emerald-100 text-emerald-800" />
    </div>
  );
}

function CaptureRow({ t, openIdea, record }) {
  const { db } = useWorkspace();
  const v = db.versions.find((x) => x.id === t.pub.versionIds[0]);
  const idea = v && ideaById(db, v.ideaId);
  const [val, setVal] = useState(t.snap?.views ?? "");
  const ageNow = Math.round((Date.now() - new Date(t.pub.publishedAt).getTime()) / 3600000);
  return (
    <div className="rounded-md border border-stone-200 p-2" data-testid={`capture-${t.pub.id}`}>
      <div className="flex items-center gap-1.5 mb-1">{t.pub.ipIds.map((id) => <IPBadge key={id} ip={ipById(db, id)} />)}{t.pub.isCollab && <span className="text-[9px] text-purple-700">collab</span>}</div>
      <button onClick={() => idea && openIdea(idea.id)} className="text-[11px] text-stone-800 hover:underline text-left truncate block w-full">{idea?.title}</button>
      <div className="text-[10px] text-stone-400 mb-1.5">pub {istDateTimeLabel(t.pub.publishedAt)} · now +{ageNow}h</div>
      {t.done ? (
        <div className="text-xs font-semibold text-stone-900">{t.snap.views == null ? "—" : t.snap.views.toLocaleString()} views {t.snap.ageHours > 0 && t.snap.ageHours !== 24 && <span className="text-[10px] text-amber-600">@{t.snap.ageHours}h</span>}</div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="views" className="h-7 text-xs" data-testid={`capture-input-${t.pub.id}`} />
          <Button size="sm" className="h-7 text-xs" data-testid={`capture-save-${t.pub.id}`} onClick={() => { record(t.pub.id, val === "" ? null : val, nowIso()); toast.success(val === "" ? "Marked missing" : `Recorded at +${ageNow}h`); }}>Save</Button>
        </div>
      )}
    </div>
  );
}

function IdeasPerf() {
  const { db } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const publishedIdeas = db.ideas.filter((i) => matchesStream(i, streamFilter) && db.versions.some((v) => v.ideaId === i.id && publicationOf(db, v.id)));
  return (
    <div className="space-y-2">
      {publishedIdeas.map((idea) => {
        const versions = db.versions.filter((v) => v.ideaId === idea.id);
        return (
          <div key={idea.id} className="rounded-lg border border-[#E6E1D8] bg-white p-3" data-testid={`perf-idea-${idea.id}`}>
            <div className="flex items-center gap-2 mb-2"><StreamBadge stream={idea.stream} /><FormatBadge format={idea.format} /><button onClick={() => openIdea(idea.id)} className="text-sm text-stone-900 hover:underline">{idea.title}</button></div>
            <div className="flex flex-wrap gap-2">
              {versions.map((v) => { const pub = publicationOf(db, v.id); const snap = pub && snapshotOf(db, pub.id); const t = targetFor(db, v.ipId, idea.format); const tier = snap && snap.views != null ? classify(snap.views, t, db.settings.thresholds) : "unrated"; const base = recentBaseline(db, v.ipId, idea.format, pub?.id, db.settings.baselineSample);
                return (
                  <div key={v.id} className="rounded-md border border-stone-200 p-2 min-w-[150px]">
                    <IPBadge ip={ipById(db, v.ipId)} />
                    {!pub ? <div className="text-[10px] text-stone-400 mt-1">remaining destination</div> : (
                      <div className="mt-1">
                        <div className="text-sm font-semibold text-stone-900">{snap?.views == null ? "—" : snap.views.toLocaleString()}</div>
                        <div className="flex items-center gap-1 mt-0.5"><PerfBadge tier={tier} />{snap?.ageHours > 0 && snap.ageHours !== 24 && <span className="text-[9px] text-amber-600">@{snap.ageHours}h</span>}</div>
                        <div className="text-[9px] text-stone-400 mt-1">baseline μ {base.avg ? base.avg.toLocaleString() : "n/a"} (n={base.n})</div>
                      </div>
                    )}
                  </div>
                ); })}
            </div>
          </div>
        );
      })}
      {!publishedIdeas.length && <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">No published ideas yet.</div>}
    </div>
  );
}

function IPCycles() {
  const { db } = useWorkspace();
  const { streamFilter } = useUI();
  const cycles = sixDayCycles(db, 6, streamFilter);
  const [sel, setSel] = useState(cycles.length - 1);
  const [fmt, setFmt] = useState("all");
  const c = cycles[sel];
  if (!c) return null;
  const per = cyclePerIp(db, c.start, c.end, streamFilter);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-stone-500">Cycle</span>
        <Select value={String(sel)} onValueChange={(v) => setSel(Number(v))}><SelectTrigger className="h-8 w-56 text-xs" data-testid="cycle-select"><SelectValue /></SelectTrigger><SelectContent>{cycles.map((x, i) => <SelectItem key={i} value={String(i)}>{fmtDate(x.start)}–{fmtDate(x.end)}{x.inProgress ? " (in progress)" : ""}</SelectItem>)}</SelectContent></Select>
        <Select value={fmt} onValueChange={setFmt}><SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Posts + Reels</SelectItem><SelectItem value="Reel">Reels only</SelectItem><SelectItem value="Post">Posts only</SelectItem></SelectContent></Select>
        <div className="ml-auto text-[11px] text-stone-500">{c.pubs} publications · {c.measured} measured · {c.due} due · {c.missing} missing</div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 mb-3 text-[11px] text-amber-800 flex items-center gap-2"><Icons.Info className="h-3.5 w-3.5" /> Demo definition: group each publication by its actual publication date, then aggregate manually-captured ~24h views. These are publication cohorts — not views gained during the calendar days and not account reach.</div>
      <div className="rounded-lg border border-[#E6E1D8] bg-white overflow-hidden">
        <table className="w-full text-xs" data-testid="cycle-table">
          <thead><tr className="text-stone-400 border-b border-stone-200"><th className="text-left py-2 pl-3">IP</th><th className="text-center">Publications</th><th className="text-center">Measured</th><th className="text-center">Missing</th><th className="text-center">Sum views</th><th className="text-center">Mean</th></tr></thead>
          <tbody>{per.map((r) => (
            <tr key={r.ip.id} className="border-b border-stone-100 hover:bg-stone-50"><td className="py-2 pl-3"><IPBadge ip={r.ip} /></td><td className="text-center">{r.pubs}</td><td className="text-center text-emerald-700">{r.measured}</td><td className="text-center text-stone-400">{r.missing}</td><td className="text-center font-medium">{r.sum.toLocaleString()}</td><td className="text-center">{r.mean.toLocaleString()}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-stone-400">Summed views are not unique people reached. Collaborations count per participating IP but dedupe by publication in network totals. {c.inProgress && "This cycle is in progress — some cohorts are incomplete."}</p>
    </div>
  );
}
