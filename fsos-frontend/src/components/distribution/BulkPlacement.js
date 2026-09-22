import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { useDemo } from "../../domain/store";
import { versionsOf, ideaById, ipById, publicationOf, activePlacementOf } from "../../domain/selectors";
import { formatCounts } from "../../domain/constants";
import { addDays, fmtDate } from "../../domain/dates";
import { StreamBadge, FormatBadge, IPBadge } from "../common/badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export default function BulkPlacement({ open, onOpenChange }) {
  const { db, actions, today } = useDemo();
  const [step, setStep] = useState(1);
  const [batchId, setBatchId] = useState("all");
  const [selIdeas, setSelIdeas] = useState([]);
  const [start, setStart] = useState(addDays(today, 1));
  const [offset, setOffset] = useState(1);
  const [proposals, setProposals] = useState([]); // {versionId, ideaId, ipId, date, excluded}

  const candidateIdeas = db.ideas.filter((i) => i.stream === "BO" && i.destinations.length && versionsOf(db, i.id).some((v) => v.reviewStatus === "ready" && !publicationOf(db, v.id)) && (batchId === "all" || i.batchId === batchId));

  const buildProposals = () => {
    const props = [];
    selIdeas.forEach((ideaId) => {
      const idea = ideaById(db, ideaId);
      const readyVersions = versionsOf(db, ideaId).filter((v) => v.reviewStatus === "ready" && !publicationOf(db, v.id));
      readyVersions.forEach((v, j) => {
        props.push({ versionId: v.id, ideaId, ipId: v.ipId, date: addDays(start, j * offset), excluded: false });
      });
    });
    setProposals(props);
    setStep(2);
  };

  const conflicts = useMemo(() => {
    const map = {};
    proposals.filter((p) => !p.excluded).forEach((p) => { const key = p.ideaId + "|" + p.date; map[key] = (map[key] || 0) + 1; });
    return new Set(Object.entries(map).filter(([, n]) => n > 1).map(([k]) => k));
  }, [proposals]);

  const perIp = useMemo(() => {
    const m = {};
    proposals.filter((p) => !p.excluded).forEach((p) => { m[p.ipId] = (m[p.ipId] || 0) + 1; });
    return m;
  }, [proposals]);

  const confirm = () => {
    const active = proposals.filter((p) => !p.excluded);
    if (conflicts.size) { toast.warning("Resolve same-day repetition conflicts first (adjust dates or exclude)."); return; }
    actions.bulkPlace(active.map((p) => ({ versionId: p.versionId, date: p.date })));
    toast.success(`${active.length} placements confirmed — nothing was auto-optimised`);
    reset(); onOpenChange(false);
  };
  const reset = () => { setStep(1); setSelIdeas([]); setProposals([]); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl" data-testid="bulk-placement-dialog">
        <DialogHeader><DialogTitle className="font-serif text-xl">Manual bulk placement</DialogTitle></DialogHeader>
        <p className="text-xs text-stone-500 -mt-2">Destinations come from the idea cards. FSOS never infers new IPs, rebalances or commits without your confirmation.</p>

        {step === 1 && (
          <div className="space-y-3 max-h-[55vh] overflow-auto fsos-scroll">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Batch</span>
              <Select value={batchId} onValueChange={setBatchId}><SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All BO batches</SelectItem>{db.batches.filter((b) => b.stream === "BO").map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelIdeas(candidateIdeas.map((i) => i.id))}>Select all</Button>
            </div>
            {candidateIdeas.map((i) => {
              const readyN = versionsOf(db, i.id).filter((v) => v.reviewStatus === "ready" && !publicationOf(db, v.id)).length;
              return (
                <label key={i.id} className="flex items-center gap-3 rounded-md border border-stone-200 bg-white p-2.5 cursor-pointer hover:border-stone-400" data-testid={`bulk-select-${i.id}`}>
                  <Checkbox checked={selIdeas.includes(i.id)} onCheckedChange={() => setSelIdeas((s) => s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id])} />
                  <StreamBadge stream={i.stream} /><FormatBadge format={i.format} />
                  <span className="flex-1 text-xs text-stone-800 truncate">{i.title}</span>
                  <span className="text-[10px] text-emerald-700">{readyN} ready</span>
                </label>
              );
            })}
            {!candidateIdeas.length && <p className="text-sm text-stone-400 py-6 text-center">No BO ideas with unplaced ready versions.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div><label className="text-[10px] text-stone-400 block">Start date</label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-40 text-xs" /></div>
              <div><label className="text-[10px] text-stone-400 block">Destination offset (days)</label><Input type="number" min={0} value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="h-8 w-24 text-xs" /></div>
              <Button size="sm" variant="outline" className="h-8 mt-4" onClick={buildProposals}>Recompute dates</Button>
              <div className="ml-auto mt-4 text-[11px] text-stone-500">{proposals.filter((p) => !p.excluded).length} placements · {conflicts.size} conflicts</div>
            </div>
            <div className="flex gap-1.5 flex-wrap">{Object.entries(perIp).map(([ipId, n]) => <span key={ipId} className="inline-flex items-center gap-1 text-[10px]"><IPBadge ip={ipById(db, ipId)} /> ×{n}</span>)}</div>
            <div className="max-h-[45vh] overflow-auto fsos-scroll rounded-md border border-stone-200">
              <table className="w-full text-xs" data-testid="bulk-preview-table">
                <thead className="bg-stone-50 sticky top-0"><tr className="text-stone-400"><th className="text-left py-1.5 pl-2">Idea</th><th className="text-left">IP</th><th className="text-left">Date</th><th className="w-16"></th></tr></thead>
                <tbody>
                  {proposals.map((p, idx) => { const conflict = conflicts.has(p.ideaId + "|" + p.date) && !p.excluded; return (
                    <tr key={p.versionId} className={cn("border-t border-stone-100", p.excluded && "opacity-40", conflict && "bg-rose-50")}>
                      <td className="py-1 pl-2 truncate max-w-[220px]">{ideaById(db, p.ideaId).title}</td>
                      <td><IPBadge ip={ipById(db, p.ipId)} /></td>
                      <td><Input type="date" value={p.date} onChange={(e) => setProposals((ps) => ps.map((x, i) => i === idx ? { ...x, date: e.target.value } : x))} className="h-7 w-36 text-xs" />{conflict && <span className="ml-1 text-[9px] text-rose-600">same-day repeat</span>}</td>
                      <td><button onClick={() => setProposals((ps) => ps.map((x, i) => i === idx ? { ...x, excluded: !x.excluded } : x))} className="text-[10px] text-stone-400 hover:text-stone-700">{p.excluded ? "include" : "exclude"}</button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button data-testid="bulk-next" disabled={!selIdeas.length} onClick={buildProposals} className="bg-stone-900">Next: choose dates ({selIdeas.length})</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button data-testid="bulk-confirm" onClick={confirm} className="bg-stone-900">Confirm placements</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
