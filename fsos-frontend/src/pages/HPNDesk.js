import React, { useState } from "react";
import * as Icons from "lucide-react";
import { useDemo } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader } from "../components/common/PageHeader";
import IdeaList from "../components/common/IdeaList";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { externalHref } from "../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ideaById } from "../domain/selectors";
import { canCreateIdea } from "../domain/roles";
import { toast } from "sonner";

export default function HPNDesk() {
  const { db, actingUser } = useDemo();
  const { openCreate } = useUI();
  const [quickIdea, setQuickIdea] = useState(null);

  return (
    <div className="p-6">
      <PageHeader title="HPN Desk" icon={Icons.Flame}
        subtitle="Happenings — fast, collaborative, often in-person production. Target TAT 30 min from create to live.">
        {canCreateIdea(actingUser, "HPN") && (
          <Button data-testid="hpn-create-btn" onClick={() => openCreate("HPN")} className="bg-[#C0512F] hover:bg-[#a84325]"><Icons.Plus className="h-4 w-4 mr-1" /> New HPN idea</Button>
        )}
      </PageHeader>

      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 mb-5 flex items-start gap-2">
        <Icons.Info className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">Happenings skip idea approval — go straight to production. Use the <b>quick record drawer</b> to log owner, assets and review outcome in one step. Version review is still recorded before anything is marked ready.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {db.ideas.filter((i) => i.stream === "HPN").slice(0, 6).map((i) => (
          <button key={i.id} onClick={() => setQuickIdea(i.id)} data-testid={`hpn-quick-${i.id}`} className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs hover:border-stone-400 transition-colors inline-flex items-center gap-1.5">
            <Icons.Zap className="h-3.5 w-3.5 text-[#C0512F]" /> Quick record — {i.title.slice(0, 28)}…
          </button>
        ))}
      </div>

      <IdeaList stream="HPN" />

      <QuickRecordDrawer ideaId={quickIdea} onClose={() => setQuickIdea(null)} />
    </div>
  );
}

function QuickRecordDrawer({ ideaId, onClose }) {
  const { db, actions } = useDemo();
  const idea = ideaId ? ideaById(db, ideaId) : null;
  const [owner, setOwner] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [outcome, setOutcome] = useState("approved");
  const [linkUrl, setLinkUrl] = useState("");
  if (!idea) return null;
  const producers = db.users.filter((u) => u.active && u.roles.some((r) => ["Designer", "Editor"].includes(r)));
  const reviewers = db.users.filter((u) => u.active && u.roles.some((r) => ["CS", "Founder/Admin", "COA", "Short-form Lead"].includes(r)));

  return (
    <Dialog open={!!ideaId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="hpn-quick-drawer">
        <DialogHeader><DialogTitle className="font-serif text-lg">Quick record — {idea.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-stone-500">Record the actual owner, assets and final review outcome in one interaction. We retain who recorded this and won't fabricate intermediate timestamps.</p>
          <div>
            <label className="text-xs font-medium text-stone-600">Actual production owner</label>
            <Select value={owner} onValueChange={setOwner}><SelectTrigger className="mt-1" data-testid="quick-owner"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{producers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Final reviewer</label>
            <Select value={reviewer} onValueChange={setReviewer}><SelectTrigger className="mt-1" data-testid="quick-reviewer"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{reviewers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Deliverable link (optional)</label>
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste Canva or Drive link…" className="mt-1 h-8 text-xs" data-testid="quick-link" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Review outcome</label>
            <Select value={outcome} onValueChange={setOutcome}><SelectTrigger className="mt-1" data-testid="quick-outcome"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="approved">Approved — ready</SelectItem><SelectItem value="changes">Changes requested</SelectItem></SelectContent></Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="quick-record-submit" className="bg-[#C0512F] hover:bg-[#a84325]" onClick={() => {
            const url = linkUrl.trim();
            actions.hpnQuickRecord(idea.id, { ownerId: owner, links: url ? { type: "drive", url: externalHref(url), label: url } : null, reviewerId: reviewer, outcome });
            toast.success("HPN outcome recorded");
            onClose();
          }}>Record outcome</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
