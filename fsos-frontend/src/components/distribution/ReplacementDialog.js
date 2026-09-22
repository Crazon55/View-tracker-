import React, { useState, useMemo, useEffect } from "react";
import * as Icons from "lucide-react";
import { useDemo } from "../../domain/store";
import { ideaById, ipById, publicationOf, candidateGaps, activePlacementOf } from "../../domain/selectors";
import { StreamBadge, FormatBadge, IPBadge } from "../common/badges";
import { fmtDate, addDays } from "../../domain/dates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export default function ReplacementDialog({ open, onClose, boVersionId, ipId, date }) {
  const { db, actions } = useDemo();
  const boV = boVersionId && db.versions.find((x) => x.id === boVersionId);
  const boIdea = boV && ideaById(db, boV.ideaId);
  const [hpnVersionId, setHpnVersionId] = useState("");
  const [boAction, setBoAction] = useState("reschedule");
  const [newDate, setNewDate] = useState("");

  // Sync defaults every time the dialog opens on a new slot (dialog stays mounted in parent).
  useEffect(() => {
    if (open && date) {
      setHpnVersionId("");
      setBoAction("reschedule");
      setNewDate(addDays(date, 1));
    }
  }, [open, date, boVersionId]);

  const hpnOptions = useMemo(() => {
    if (!open) return [];
    return db.versions.filter((v) => {
      const idea = ideaById(db, v.ideaId);
      return idea && idea.stream === "HPN" && v.reviewStatus === "ready" && !publicationOf(db, v.id);
    }).sort((a) => (a.ipId === ipId ? -1 : 1));
  }, [db, open, ipId]);

  const gaps = useMemo(() => (open && boIdea && date ? candidateGaps(db, ipId, boIdea.format, addDays(date, 1), 12) : []), [db, open, boIdea, ipId, date]);

  if (!open || !boV) return null;

  const confirm = () => {
    if (!hpnVersionId) { toast.error("Select an HPN version to take the slot"); return; }
    if (boAction === "reschedule" && !newDate) { toast.error("Pick a new date for the BO version"); return; }
    actions.replaceBOWithHPN({ boVersionId, hpnVersionId, ipId, date, boAction, newDate });
    toast.success(boAction === "reschedule" ? `HPN placed · BO rescheduled to ${newDate}` : "HPN placed · BO returned to bank (age & approval intact)");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="replacement-dialog">
        <DialogHeader><DialogTitle className="font-serif text-lg">HPN takes this BO slot</DialogTitle>
          <DialogDescription className="sr-only">Place an HPN version into a BO calendar slot and choose whether to reschedule or return the displaced BO version.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-2.5">
            <div className="flex items-center gap-2 text-[11px] text-blue-800 mb-1"><StreamBadge stream="BO" /> displaced from <IPBadge ip={ipById(db, ipId)} /> · {fmtDate(date)}</div>
            <div className="text-sm text-stone-800">{boIdea?.title}</div>
            <div className="text-[10px] text-stone-500 mt-0.5">The BO version is never lost or moved automatically — you choose below.</div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-600">HPN version to take the slot</label>
            <Select value={hpnVersionId} onValueChange={setHpnVersionId}>
              <SelectTrigger className="mt-1" data-testid="repl-hpn-select"><SelectValue placeholder="Select a ready HPN version" /></SelectTrigger>
              <SelectContent>
                {hpnOptions.map((v) => { const idea = ideaById(db, v.ideaId); return <SelectItem key={v.id} value={v.id}>{ipById(db, v.ipId)?.code} · {idea.title.slice(0, 40)}</SelectItem>; })}
                {!hpnOptions.length && <div className="px-3 py-2 text-xs text-stone-400">No ready HPN versions available.</div>}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-600">What happens to the BO version?</label>
            <div className="mt-1.5 flex gap-2">
              {[["reschedule", "Reschedule"], ["unallocate", "Return to bank"]].map(([v, l]) => (
                <button key={v} data-testid={`repl-action-${v}`} onClick={() => setBoAction(v)} className={cn("flex-1 rounded-md border px-3 py-2 text-xs transition-colors", boAction === v ? "border-stone-800 bg-stone-100 font-medium" : "border-stone-200 hover:border-stone-400")}>{l}</button>
              ))}
            </div>
          </div>

          {boAction === "reschedule" && (
            <div>
              <label className="text-xs font-medium text-stone-600">New date (candidate gaps for {ipById(db, ipId)?.code})</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1 h-8 text-xs" data-testid="repl-newdate" />
              {gaps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gaps.slice(0, 8).map((g) => (
                    <button key={g.date} onClick={() => setNewDate(g.date)} className={cn("rounded-full border px-2 py-0.5 text-[10px] transition-colors", newDate === g.date ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-stone-200 hover:border-stone-400")}>
                      {fmtDate(g.date)} · {g.planned}/{g.floor}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] text-stone-400">Suggestions where this IP has spare capacity. Collision checks re-run on confirm.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="repl-confirm" onClick={confirm} className="bg-[#C0512F] hover:bg-[#a84325]">Confirm displacement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
