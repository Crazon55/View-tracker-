import React from "react";
import * as Icons from "lucide-react";
import { useDemo } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader } from "../components/common/PageHeader";
import IdeaList from "../components/common/IdeaList";
import { Button } from "../components/ui/button";
import { canCreateIdea } from "../domain/roles";
import { ideaProgress } from "../domain/selectors";
import { fmtDate } from "../domain/dates";

export default function BOStudio() {
  const { db, actingUser } = useDemo();
  const { openCreate } = useUI();
  const boBatches = db.batches.filter((b) => b.stream === "BO");

  return (
    <div className="p-6">
      <PageHeader title="BO Studio" icon={Icons.Compass}
        subtitle="Blue Ocean — researched, batch-produced planned content. Build the bank ~10 days ahead of HPN needs.">
        {canCreateIdea(actingUser, "BO") && (
          <Button data-testid="bo-create-btn" onClick={() => openCreate("BO")} className="bg-stone-900 hover:bg-stone-800"><Icons.Plus className="h-4 w-4 mr-1" /> New BO idea</Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {boBatches.map((b) => {
          const ready = b.ideaIds.reduce((s, id) => { const idea = db.ideas.find((i) => i.id === id); return s + (idea ? ideaProgress(db, idea).ready : 0); }, 0);
          const total = b.ideaIds.reduce((s, id) => { const idea = db.ideas.find((i) => i.id === id); return s + (idea ? ideaProgress(db, idea).total : 0); }, 0);
          return (
            <div key={b.id} className="rounded-lg border border-[#E6E1D8] bg-white p-3" data-testid={`batch-card-${b.id}`}>
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500"><Icons.Layers className="h-3.5 w-3.5" /> Batch</div>
              <div className="font-medium text-sm text-stone-900 mt-0.5 leading-tight">{b.name}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                <span>{b.ideaIds.length} ideas</span>
                <span>due {fmtDate(b.deadline)}</span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-700">{ready}/{total} versions ready</div>
            </div>
          );
        })}
      </div>

      <IdeaList stream="BO" />
    </div>
  );
}
