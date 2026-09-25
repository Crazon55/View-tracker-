import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader } from "../components/common/PageHeader";
import { StreamBadge, StatusBadge, FormatBadge, IPBadge, VersionBadge, PriorityBadge, Avatar } from "../components/common/badges";
import { versionsOf, ideaById, ipById, userById, ideaDerivedState, ideaProgress, myWork, productionIssues, needsIdeaApproval } from "../domain/selectors";
import { fmtDate } from "../domain/dates";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { isProducerRole, canAssignProduction } from "../domain/roles";

const VIEWS = [["board", "Stage board"], ["table", "Task table"], ["people", "People / workload"], ["mine", "My Work"]];
const STAGES = ["approved_unassigned", "in_production", "awaiting_review", "changes_requested", "ready"];

export default function Production() {
  const { actingUser } = useWorkspace();
  const producerOnly = isProducerRole(actingUser);
  const [view, setView] = useState(producerOnly ? "mine" : "board");
  useEffect(() => { setView(producerOnly ? "mine" : "board"); }, [actingUser.id, producerOnly]);
  const views = producerOnly ? VIEWS.filter(([v]) => v === "mine") : VIEWS;

  return (
    <div className="p-6">
      <PageHeader title="Production" icon={Icons.Clapperboard} subtitle={producerOnly ? "Your assigned ideas — one owner per idea." : "Stage board, task table, workloads and My Work — one owner per idea, never split across owners."}>
        {!producerOnly && (
          <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
            {views.map(([v, l]) => (
              <button key={v} data-testid={`prod-view-${v}`} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", view === v ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>{l}</button>
            ))}
          </div>
        )}
      </PageHeader>

      {view === "board" && !producerOnly && <StageBoard />}
      {view === "table" && !producerOnly && <TaskTable />}
      {view === "people" && !producerOnly && <PeopleWorkload />}
      {(view === "mine" || producerOnly) && <MyWork />}
    </div>
  );
}

function useProdIdeas() {
  const { db } = useWorkspace();
  const { streamFilter } = useUI();
  return db.ideas.filter((i) => {
    if (streamFilter !== "All" && i.stream !== streamFilter) return false;
    return !needsIdeaApproval(i) || i.approval.state === "approved" || i.bypassUsed || versionsOf(db, i.id).some((v) => v.assetLinks.length);
  });
}

function StageBoard() {
  const { db } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const ideas = useProdIdeas();
  const groups = STAGES.map((s) => ({ s, items: ideas.filter((i) => ideaDerivedState(db, i) === s) }));
  return (
    <div>
      <p className="mb-3 text-[11px] text-stone-400">{streamFilter === "All" ? "Showing BO and HPN" : `Showing ${streamFilter} only`} · {ideas.length} ideas</p>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {groups.map(({ s, items }) => (
          <div key={s} className="rounded-lg bg-[#F5F2EC] border border-[#E6E1D8] p-2" data-testid={`stage-col-${s}`}>
            <div className="flex items-center justify-between px-1 py-1.5 mb-1">
              <StatusBadge state={s} />
              <span className="text-[11px] text-stone-400">{items.length}</span>
            </div>
            <div className="space-y-2 max-h-[65vh] overflow-auto fsos-scroll">
              {items.map((i) => {
                const p = ideaProgress(db, i);
                const owner = userById(db, i.productionOwnerId);
                return (
                  <button key={i.id} onClick={() => openIdea(i.id, { tab: "production" })} data-testid={`board-card-${i.id}`} className="w-full text-left rounded-md border border-stone-200 bg-white p-2.5 hover:border-stone-400 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1"><StreamBadge stream={i.stream} /><FormatBadge format={i.format} /></div>
                    <div className="text-xs font-medium text-stone-800 leading-snug line-clamp-2">{i.title}</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex gap-1 flex-wrap">{i.destinations.slice(0, 4).map((id) => <span key={id} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ipById(db, id)?.hex }} />)}</div>
                      {owner ? <Avatar user={owner} size={20} /> : <span className="text-[10px] text-stone-400">—</span>}
                    </div>
                    <div className="mt-1 text-[10px] text-stone-400">{p.ready}/{p.total} ready {i.deadline && <>· due {fmtDate(i.deadline)}</>}</div>
                  </button>
                );
              })}
              {!items.length && <div className="text-[11px] text-stone-400 text-center py-4">Empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskTable() {
  const { db, actions, actingUser } = useWorkspace();
  const { openIdea } = useUI();
  const ideas = useProdIdeas();
  const [sel, setSel] = useState([]);
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const isCoa = canAssignProduction(actingUser);
  const producers = db.users.filter((u) => u.active && u.roles.some((r) => ["Designer", "Editor"].includes(r)));

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <div>
      {isCoa && sel.length > 0 && (
        <div className="mb-3 rounded-lg border border-stone-300 bg-white p-3 flex items-center gap-3 flex-wrap" data-testid="bulk-assign-bar">
          <span className="text-sm font-medium text-stone-700">{sel.length} selected</span>
          <Select value={owner} onValueChange={setOwner}><SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Assign owner" /></SelectTrigger><SelectContent>{producers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-8 w-40 text-xs" />
          <span className="text-[11px] text-stone-400">Preview: {sel.length} ideas → {producers.find((p) => p.id === owner)?.name || "—"}{deadline ? `, due ${deadline}` : ""}</span>
          <Button size="sm" className="h-8" data-testid="bulk-assign-apply" disabled={!owner} onClick={() => { actions.assignProduction(sel, owner, deadline); toast.success(`Assigned ${sel.length} ideas (one owner each)`); setSel([]); }}>Apply</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSel([])}>Clear</Button>
        </div>
      )}
      <div className="rounded-lg border border-[#E6E1D8] bg-white overflow-hidden">
        <table className="w-full text-xs" data-testid="task-table">
          <thead><tr className="border-b border-stone-200 text-stone-400">
            {isCoa && <th className="w-8 py-2"></th>}
            <th className="text-left font-medium py-2 pl-3">Idea</th><th className="text-left font-medium">Owner</th><th className="text-left font-medium">Stream</th><th className="text-left font-medium">Batch</th><th className="text-left font-medium">Due</th><th className="text-left font-medium">Versions</th><th className="text-left font-medium">Reviewer</th>
          </tr></thead>
          <tbody>
            {ideas.map((i) => {
              const p = ideaProgress(db, i);
              const batch = db.batches.find((b) => b.id === i.batchId);
              const overdue = i.deadline && i.deadline < db.meta.anchor && ideaDerivedState(db, i) !== "ready" && ideaDerivedState(db, i) !== "published";
              return (
                <tr key={i.id} className="border-b border-stone-100 hover:bg-stone-50">
                  {isCoa && <td className="pl-3"><Checkbox checked={sel.includes(i.id)} onCheckedChange={() => toggle(i.id)} data-testid={`task-check-${i.id}`} /></td>}
                  <td className="py-2 pl-3 max-w-xs"><button onClick={() => openIdea(i.id, { tab: "production" })} className="text-left text-stone-800 hover:underline truncate block max-w-[240px]">{i.title}</button></td>
                  <td>{i.productionOwnerId ? <span className="inline-flex items-center gap-1"><Avatar user={userById(db, i.productionOwnerId)} size={18} /> {userById(db, i.productionOwnerId)?.name.split(" ")[0]}</span> : <span className="text-stone-400">Unassigned</span>}</td>
                  <td><StreamBadge stream={i.stream} /></td>
                  <td className="text-stone-500 truncate max-w-[120px]">{batch?.name || "—"}</td>
                  <td className={cn(overdue ? "text-rose-600 font-medium" : "text-stone-500")}>{fmtDate(i.deadline)}</td>
                  <td className="text-stone-600">{p.ready}/{p.total} ready</td>
                  <td className="text-stone-500">{userById(db, i.reviewerId)?.name.split(" ")[0] || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeopleWorkload() {
  const { db } = useWorkspace();
  const { openIdea } = useUI();
  const prodIdeas = useProdIdeas();
  const producers = db.users.filter((u) => u.roles.some((r) => ["Designer", "Editor"].includes(r)));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {producers.map((u) => {
        const ideas = prodIdeas.filter((i) => i.productionOwnerId === u.id);
        const pending = ideas.reduce((s, i) => s + ideaProgress(db, i).awaiting_review + ideaProgress(db, i).in_production + ideaProgress(db, i).changes_requested, 0);
        const late = ideas.filter((i) => i.deadline && i.deadline < db.meta.anchor && ideaDerivedState(db, i) !== "ready" && ideaDerivedState(db, i) !== "published").length;
        return (
          <div key={u.id} className={cn("rounded-lg border bg-white p-4", !u.active && "opacity-60")} data-testid={`workload-${u.id}`}>
            <div className="flex items-center gap-2 mb-3">
              <Avatar user={u} size={32} />
              <div><div className="text-sm font-medium text-stone-900">{u.name} {!u.active && <span className="text-[10px] text-rose-600">(inactive)</span>}</div><div className="text-[11px] text-stone-500">{u.roles.join(", ")}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div><div className="font-serif text-xl text-stone-900">{ideas.length}</div><div className="text-[10px] text-stone-400">active ideas</div></div>
              <div><div className="font-serif text-xl text-stone-900">{pending}</div><div className="text-[10px] text-stone-400">pending versions</div></div>
              <div><div className={cn("font-serif text-xl", late ? "text-rose-600" : "text-stone-900")}>{late}</div><div className="text-[10px] text-stone-400">late</div></div>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-auto fsos-scroll">
              {ideas.slice(0, 5).map((i) => <button key={i.id} onClick={() => openIdea(i.id, { tab: "production" })} className="block w-full text-left text-[11px] text-stone-500 hover:text-stone-900 truncate">· {i.title}</button>)}
            </div>
            <p className="mt-2 text-[10px] text-stone-400">Factual workload counts — no invented hours or capacity estimates.</p>
          </div>
        );
      })}
    </div>
  );
}

function MyWork() {
  const { db, actions, actingUser } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const producerOnly = isProducerRole(actingUser);
  const [user, setUser] = useState(actingUser.id);
  useEffect(() => { setUser(actingUser.id); }, [actingUser.id]);
  const items = myWork(db, user).filter(({ idea }) => streamFilter === "All" || idea.stream === streamFilter);
  const producers = db.users.filter((u) => u.roles.some((r) => ["Designer", "Editor"].includes(r)));
  return (
    <div>
      {!producerOnly && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-stone-500">Viewing work for</span>
          <Select value={user} onValueChange={setUser}><SelectTrigger className="h-8 w-52 bg-white text-xs" data-testid="mywork-user"><SelectValue /></SelectTrigger><SelectContent>{producers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          <span className="text-[11px] text-stone-400">Same records, filtered — you can inspect other permitted work too.</span>
        </div>
      )}
      {!items.length && <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">No assigned ideas.</div>}
      <div className="space-y-2">
        {items.map(({ idea, progress }) => {
          const overdue = idea.deadline && idea.deadline < db.meta.anchor;
          const feedback = db.comments.filter((c) => c.ideaId === idea.id && !c.resolved);
          const state = ideaDerivedState(db, idea);
          const linkedToSubmit = versionsOf(db, idea.id).some((v) => ["not_started", "in_production", "changes_requested"].includes(v.reviewStatus) && v.assetLinks.length);
          return (
            <div key={idea.id} className="rounded-lg border border-[#E6E1D8] bg-white p-3.5 hover:border-stone-400 transition-colors" data-testid={`mywork-${idea.id}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => openIdea(idea.id, { mode: "owner", tab: "production" })} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1"><PriorityBadge priority={idea.priority} /><StreamBadge stream={idea.stream} /><FormatBadge format={idea.format} /><StatusBadge state={state} />{overdue && <span className="text-[10px] text-rose-600 font-medium">OVERDUE</span>}</div>
                  <span className="font-medium text-stone-900 hover:underline">{idea.title}</span>
                  <p className="mt-1 text-xs text-stone-500 line-clamp-1">{db.versions.find((v) => v.ideaId === idea.id && v.hookOverride)?.hookOverride || idea.brief?.sharedHook}</p>
                  {feedback.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {feedback.slice(0, 3).map((c) => (
                        <div key={c.id} className="text-[11px] text-rose-700 flex items-start gap-1">
                          <Icons.MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{c.text}</span>
                        </div>
                      ))}
                      {feedback.length > 3 && <div className="text-[10px] text-rose-500">+{feedback.length - 3} more</div>}
                    </div>
                  )}
                </button>
                <div className="text-right shrink-0">
                  <div className="text-xs text-stone-500 mb-1">{idea.deadline ? `Due ${fmtDate(idea.deadline)}` : "No deadline"}</div>
                  <div className="text-[11px] text-stone-400 mb-2">{progress.done}/{progress.total} ready</div>
                  {["in_production", "changes_requested"].includes(state) && (
                    <Button size="sm" className="h-7 text-xs" data-testid={`mywork-submit-${idea.id}`} onClick={(e) => {
                      e.stopPropagation();
                      if (!linkedToSubmit) {
                        toast.error("Add a Canva or Drive link first — the reviewer needs a deliverable to review.");
                        return;
                      }
                      actions.submitIdeaForReview(idea.id);
                      toast.success("Submitted for review");
                    }}><Icons.Send className="h-3 w-3 mr-1" /> Submit for review</Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
