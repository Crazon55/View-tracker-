import React, { useState, useMemo, useEffect } from "react";
import * as Icons from "lucide-react";
import { useWorkspace, useAccess } from "../../domain/store";
import { versionsOf, ideaById, ipById, userById, ideaDerivedState, ideaProgress, activePlacementOf, publicationOf, snapshotOf, targetFor, classify, needsIdeaApproval } from "../../domain/selectors";
import { StreamBadge, StatusBadge, FormatBadge, IPBadge, VersionBadge, PerfBadge, PriorityBadge, Avatar } from "../common/badges";
import { nowIso, istDateTimeLabel, fmtDate } from "../../domain/dates";
import { PRIORITIES, PRIORITY_KEYS, DEFAULT_PRIORITY } from "../../domain/constants";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { SavedField } from "../common/SavedField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn, externalHref } from "../../lib/utils";
import { assetLinkError } from "../../lib/links";
import { hasDeliverable, submittableWithLinks, submitBlocker, pendingLinkPayload } from "../../domain/submit";
import { isAdmin, canEditProduction, canAssignProduction } from "../../domain/roles";

function canApprove(user, stream, settings) {
  if (isAdmin(user)) return true;
  if (stream === "BO") return user.id === settings.approverBoId || user.id === settings.shortFormLeadId;
  return user.id === settings.shortFormLeadId || user.roles.includes("Short-form Lead");
}

const ELEVATED_ROLES = ["Founder/Admin", "COA", "COC", "CS", "Short-form Lead"];
function isAssignedProducerView(user) {
  if (ELEVATED_ROLES.some((r) => user.roles.includes(r))) return false;
  return user.roles.some((r) => ["Designer", "Editor"].includes(r));
}
function canSubmitProduction(user, idea, ownerWorkspace = false) {
  return canEditProduction(user, idea, ownerWorkspace);
}
function submitIdeaIfReady(actions, idea, versions, pending = {}) {
  const blocked = submitBlocker(idea, versions, pending);
  if (blocked) {
    toast.error(blocked);
    return false;
  }
  const extras = versions.map((v) => pendingLinkPayload(v.id, pending)).filter(Boolean);
  actions.submitIdeaForReview(idea.id, extras);
  toast.success("Submitted for review");
  return true;
}

export default function IdeaCard({ ideaId, mode, initialTab, onClose, onOpenIdea }) {
  const { db, actions, actingUser } = useWorkspace();
  const { canEdit } = useAccess();
  const idea = ideaId ? ideaById(db, ideaId) : null;
  const [tab, setTab] = useState("brief");
  const [highlightAnchor, setHighlightAnchor] = useState(null);
  const [pendingLinks, setPendingLinks] = useState({});
  // Off by default: sharing one file across every page is common but not automatic,
  // and silently fanning a link out would be the worse surprise.
  const [linkAll, setLinkAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Two different things used to share one flag. `ownerWorkspace` is the focused "my
  // work" view on the Production page, which deliberately shows one tab. `producerRole`
  // is a Designer or Editor opening a card anywhere: they need to see the whole story —
  // who is reviewing, when it goes out, how the last one did — and change nothing
  // outside Production & Review.
  const producerRole = !!actingUser && isAssignedProducerView(actingUser);
  const producerView = mode === "owner";

  useEffect(() => {
    setTab(producerView || producerRole ? "production" : (initialTab || "brief"));
    setHighlightAnchor(null);
    setPendingLinks({});
    setLinkAll(false);
    setConfirmDelete(false);
  }, [ideaId, producerView, producerRole, initialTab]);

  // How much real history deleting this would take with it.
  const publishedCount = useMemo(() => {
    if (!idea) return 0;
    const mine = new Set(versionsOf(db, idea.id).map((v) => v.id));
    return db.publications.filter((pub) => (pub.versionIds || []).some((v) => mine.has(v))).length;
  }, [db, idea]);

  if (!idea) return null;
  const versions = versionsOf(db, idea.id);
  const state = ideaDerivedState(db, idea);
  const progress = ideaProgress(db, idea);
  const owner = userById(db, idea.productionOwnerId);
  const reviewer = userById(db, idea.reviewerId);
  const creator = userById(db, idea.creatorId);
  const batch = db.batches.find((b) => b.id === idea.batchId);
  const comments = db.comments.filter((c) => c.ideaId === idea.id);

  const jumpTo = (anchor) => { setHighlightAnchor(anchor); if (anchor?.type === "slide") setTab("brief"); else if (anchor?.type === "asset" || anchor?.versionId) setTab("versions"); };

  const allTabs = [["brief", "Brief"], ["versions", "Page Versions"], ["production", "Production & Review"], ["distribution", "Distribution"], ["performance", "Performance"], ["activity", "Activity"]];
  const visibleTabs = producerView ? [["production", "Production & Review"]] : allTabs;

  return (
    <Dialog open={!!ideaId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-6xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col" data-testid="idea-card-modal">
        <DialogTitle className="sr-only">{idea.title}</DialogTitle>
        {/* Header */}
        <div className="border-b border-stone-200 px-6 py-4 bg-[#FAF8F5]">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-stone-400">{idea.code}</span>
                <StreamBadge stream={idea.stream} />
                <FormatBadge format={idea.format} />
                <StatusBadge state={state} />
                <PriorityPicker idea={idea} canSet={canEdit(idea.stream === "BO" ? "bo_studio" : "hpn_desk")} />
                {idea.bypassUsed && needsIdeaApproval(idea) && <span className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-800"><Icons.Zap className="h-3 w-3" /> Pre-approval bypass</span>}
              </div>
              <h2 className="font-serif text-2xl text-stone-900 leading-snug pr-8">{idea.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1"><Icons.Tag className="h-3 w-3" /> {idea.category}</span>
                <span className="inline-flex items-center gap-1"><Icons.User className="h-3 w-3" /> Added by {creator?.name}</span>
                <span className="inline-flex items-center gap-1"><Icons.Clock className="h-3 w-3" /> {istDateTimeLabel(idea.createdAt)}</span>
                {batch && <span className="inline-flex items-center gap-1"><Icons.Layers className="h-3 w-3" /> {batch.name}</span>}
              </div>
            </div>
            <button onClick={onClose} data-testid="idea-card-close" className="rounded-md p-1.5 hover:bg-stone-200 transition-colors"><Icons.X className="h-4 w-4" /></button>
          </div>

          {/* destinations + progress + approve */}
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-stone-500 mr-1">Destinations:</span>
              {idea.destinations.map((ipId) => <IPBadge key={ipId} ip={ipById(db, ipId)} />)}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-stone-500">{progress.done}/{progress.total} ready · {progress.published} live</span>
              {canSubmitProduction(actingUser, idea, producerView) && ["in_production", "changes_requested"].includes(state) && (
                <Button size="sm" className="h-8" data-testid="submit-idea-review-btn"
                  disabled={!!submitBlocker(idea, versions, pendingLinks)}
                  title={submitBlocker(idea, versions, pendingLinks) || "Send every version with a deliverable to the reviewer"}
                  onClick={() => {
                    if (submitIdeaIfReady(actions, idea, versions, pendingLinks)) setPendingLinks({});
                  }}>
                  <Icons.Send className="h-4 w-4 mr-1" /> Submit for review
                </Button>
              )}
              {canSubmitProduction(actingUser, idea, producerView) && ["in_production", "changes_requested"].includes(state) && (!idea.productionOwnerId || !idea.reviewerId) && (
                <span className="text-[11px] text-amber-700" data-testid="submit-needs-owner">
                  {!idea.productionOwnerId && !idea.reviewerId ? "Unassigned" : !idea.productionOwnerId ? "No owner" : "No reviewer"} — finish the assignment in Production &amp; Review.
                </span>
              )}
              {needsIdeaApproval(idea) && ["pending", "rejected"].includes(idea.approval.state) && !idea.bypassUsed && canApprove(actingUser, idea.stream, db.settings) && (
                <Button size="sm" data-testid="approve-idea-btn" onClick={() => { actions.approveIdea(idea.id); toast.success("Idea approved"); }} className="h-8 bg-emerald-700 hover:bg-emerald-800">
                  <Icons.Check className="h-4 w-4 mr-1" /> {idea.approval.state === "rejected" ? "Approve anyway" : "Approve idea"}
                </Button>
              )}
              {needsIdeaApproval(idea) && idea.approval.state === "pending" && !idea.bypassUsed && canApprove(actingUser, idea.stream, db.settings) && (
                <RejectIdeaBtn idea={idea} />
              )}
              {needsIdeaApproval(idea) && idea.approval.state === "approved" && <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><Icons.CheckCircle2 className="h-3.5 w-3.5" /> Approved by {userById(db, idea.approval.by)?.name}</span>}
              {idea.approval.state === "rejected" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-rose-700" data-testid="idea-rejected-note">
                  <Icons.XCircle className="h-3.5 w-3.5" />
                  Rejected by {userById(db, idea.approval.by)?.name}
                  {idea.approval.note && <span className="text-rose-600">— {idea.approval.note}</span>}
                </span>
              )}
              {canEdit(idea.stream === "BO" ? "bo_studio" : "hpn_desk") && (
                <button
                  title="Delete this idea"
                  data-testid="delete-idea-btn"
                  onClick={() => setConfirmDelete(true)}
                  className="grid h-8 w-8 place-items-center rounded-md border border-stone-200 text-stone-400 hover:border-rose-300 hover:text-rose-600">
                  <Icons.Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{idea.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {publishedCount > 0
                  ? `This idea has been published ${publishedCount === 1 ? "once" : `${publishedCount} times`}. Deleting it removes those publications and their view captures as well — that's real history, not a draft.`
                  : "Its versions, comments and activity go with it. Nothing has been published, so nothing is lost beyond the draft itself."}
                {" "}This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-[#C0512F] hover:bg-[#a84325]"
                data-testid="confirm-delete-idea"
                onClick={async () => {
                  setConfirmDelete(false);
                  try {
                    await actions.deleteIdea(idea.id);
                    toast.success("Idea deleted");
                    onClose();
                  } catch (e) { /* the store already showed the error */ }
                }}>
                Delete idea
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Body */}
        <Tabs value={producerView ? "production" : tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <div className="border-b border-stone-200 px-6 bg-white">
            <TabsList className="h-11 bg-transparent gap-1 p-0">
              {visibleTabs.map(([v, l]) => (
                <TabsTrigger key={v} value={v} data-testid={`idea-tab-${v}`} className="data-[state=active]:bg-stone-100 data-[state=active]:shadow-none rounded-md px-3 text-sm">{l}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto fsos-scroll p-6 bg-[#FAF8F5]">
            {producerView ? (
              <TabsContent value="production" className="mt-0" data-testid="idea-owner-workspace">
                <ProductionTab idea={idea} versions={versions} ownerWorkspace pendingLinks={pendingLinks} setPendingLinks={setPendingLinks} linkAll={linkAll} setLinkAll={setLinkAll} />
              </TabsContent>
            ) : (
              <>
                <TabsContent value="brief" className="mt-0"><BriefTab idea={idea} highlight={highlightAnchor} /></TabsContent>
                <TabsContent value="versions" className="mt-0"><VersionsTab idea={idea} versions={versions} readOnly={producerRole} pendingLinks={pendingLinks} setPendingLinks={setPendingLinks} /></TabsContent>
                <TabsContent value="production" className="mt-0"><ProductionTab idea={idea} versions={versions} pendingLinks={pendingLinks} setPendingLinks={setPendingLinks} linkAll={linkAll} setLinkAll={setLinkAll} /></TabsContent>
                <TabsContent value="distribution" className="mt-0"><DistributionTab idea={idea} versions={versions} /></TabsContent>
                <TabsContent value="performance" className="mt-0"><PerformanceTab idea={idea} versions={versions} readOnly={producerRole} /></TabsContent>
                <TabsContent value="activity" className="mt-0"><ActivityTab idea={idea} comments={comments} onJump={jumpTo} /></TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The priority, and a way to change it for people who own the stream.
 *
 * Read-only for everyone else rather than hidden: a producer needs to see that their
 * work is Urgent far more than they need to be able to set it.
 */
function PriorityPicker({ idea, canSet }) {
  const { actions } = useWorkspace();
  const current = idea.priority || DEFAULT_PRIORITY;
  if (!canSet) return <PriorityBadge priority={current} />;
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (next === current) return;
        actions.setPriority(idea.id, next);
        toast.success(`Priority set to ${next} — ${PRIORITIES[next].short.toLowerCase()}`);
      }}
    >
      <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent p-0 shadow-none focus:ring-0" data-testid="idea-priority-select">
        <PriorityBadge priority={current} />
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_KEYS.map((k) => (
          <SelectItem key={k} value={k}>
            <span className="font-semibold">{k}</span>
            <span className="ml-2 text-stone-500">{PRIORITIES[k].short}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="rounded-lg border border-[#E6E1D8] bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 font-mono">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * Turning an idea down, with a reason.
 *
 * The reason is asked for rather than optional-in-passing: a rejection with no note
 * reaches the person who raised the idea as a bare "no", and they come back and ask
 * anyway. Cheaper to type it once here.
 */
function RejectIdeaBtn({ idea }) {
  const { actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="outline" data-testid="reject-idea-btn" onClick={() => setOpen(true)}
        className="h-8 border-rose-300 text-rose-700 hover:bg-rose-50">
        <Icons.X className="h-4 w-4 mr-1" /> Reject
      </Button>
    );
  }
  const send = () => {
    actions.rejectIdea(idea.id, reason.trim());
    toast.success("Idea rejected — the person who raised it has been told");
    setOpen(false);
    setReason("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? They will see this…"
        data-testid="reject-idea-reason"
        className="h-8 w-64 text-xs"
        onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) send(); if (e.key === "Escape") setOpen(false); }}
      />
      <Button size="sm" data-testid="reject-idea-confirm" disabled={!reason.trim()} onClick={send}
        className="h-8 bg-rose-700 hover:bg-rose-800">Reject</Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

function CommentAnchorBtn({ idea, anchor }) {
  const { actions, actingUser } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <>
      <button data-testid="add-anchor-comment" onClick={() => setOpen(!open)} className="text-stone-400 hover:text-[#C0512F] transition-colors"><Icons.MessageSquarePlus className="h-3.5 w-3.5" /></button>
      {open && (
        <div className="mt-2 flex gap-2">
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Comment on ${anchor.type}…`} className="h-8 text-xs" />
          <Button size="sm" className="h-8" onClick={() => { if (text.trim()) { actions.addComment(idea.id, { anchor, text }); toast.success("Comment added"); setText(""); setOpen(false); } }}>Post</Button>
        </div>
      )}
    </>
  );
}

/**
 * Where this idea actually stands, on the tab people open first.
 *
 * The detail lives in Production, Distribution and Performance, one tab each — fine
 * when you're doing that job, useless when someone asks "is the Zerodha one out yet?"
 * and you have to visit three tabs per destination to answer. This is one line per
 * page: who made it, who checks it, when it goes out, where it went, how it did.
 */
function BriefSummary({ idea }) {
  const { db, today } = useWorkspace();
  const versions = versionsOf(db, idea.id);
  const owner = userById(db, idea.productionOwnerId);
  const reviewer = userById(db, idea.reviewerId);
  const overdue = idea.deadline && idea.deadline < today && versions.some((v) => !publicationOf(db, v.id));

  return (
    <Section title="Status">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <Icons.PenTool className="h-3.5 w-3.5 text-stone-400" />
          <span className="text-stone-500">Owner</span>
          {owner
            ? <span className="inline-flex items-center gap-1.5"><Avatar user={owner} size={18} /><b className="text-stone-800">{owner.name}</b></span>
            : <span className="text-amber-700">Unassigned</span>}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icons.Eye className="h-3.5 w-3.5 text-stone-400" />
          <span className="text-stone-500">Reviewer</span>
          {reviewer
            ? <span className="inline-flex items-center gap-1.5"><Avatar user={reviewer} size={18} /><b className="text-stone-800">{reviewer.name}</b></span>
            : <span className="text-amber-700">Unassigned</span>}
        </span>
        {idea.deadline && (
          <span className="inline-flex items-center gap-1.5">
            <Icons.CalendarClock className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-stone-500">Due</span>
            <b className={cn(overdue ? "text-[#C0512F]" : "text-stone-800")}>{fmtDate(idea.deadline)}</b>
            {overdue && <span className="text-[10px] text-[#C0512F]">overdue</span>}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-stone-200" data-testid="brief-summary">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F5F2EC] text-left text-[10px] uppercase tracking-wide text-stone-500">
              <th className="px-2.5 py-1.5 font-medium">Page</th>
              <th className="px-2.5 py-1.5 font-medium">Production</th>
              <th className="px-2.5 py-1.5 font-medium">Scheduled</th>
              <th className="px-2.5 py-1.5 font-medium">Live</th>
              <th className="px-2.5 py-1.5 font-medium">~24h views</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const ip = ipById(db, v.ipId);
              const pl = activePlacementOf(db, v.id);
              const pub = publicationOf(db, v.id);
              const snap = pub && snapshotOf(db, pub.id);
              const target = targetFor(db, v.ipId, idea.format);
              // Missing is not zero: a published page with no capture yet is blank, not "0".
              const tier = snap && snap.views != null ? classify(snap.views, target, db.settings.thresholds) : "unrated";
              return (
                <tr key={v.id} className="border-t border-stone-100" data-testid={`brief-row-${v.id}`}>
                  <td className="px-2.5 py-1.5"><IPBadge ip={ip} /></td>
                  <td className="px-2.5 py-1.5">{pub ? <StatusBadge state="published" /> : <VersionBadge status={v.reviewStatus} />}</td>
                  <td className="px-2.5 py-1.5 text-stone-700">
                    {pl ? <>{fmtDate(pl.date)}{pl.time && <span className="ml-1 font-mono text-[10px] text-stone-400">{pl.time} IST</span>}</> : <span className="text-stone-300">not placed</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {pub
                      ? <a href={externalHref(pub.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Icons.ExternalLink className="h-3 w-3" /> open</a>
                      : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {!pub ? <span className="text-stone-300">—</span>
                      : snap?.views == null ? <span className="text-amber-700">missing</span>
                        : (
                          <span className="inline-flex items-center gap-1.5">
                            <b className="text-stone-900">{snap.views.toLocaleString()}</b>
                            {target ? <span className="text-[10px] text-stone-400">/ {target.toLocaleString()}</span> : null}
                            <PerfBadge tier={tier} />
                          </span>
                        )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function BriefTab({ idea, highlight }) {
  const { db, actions } = useWorkspace();
  return (
    <div>
      <BriefSummary idea={idea} />

      <Section title="Sources">
        <div className="space-y-2">
          {idea.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <Icons.Link2 className="h-3.5 w-3.5 text-stone-400" />
              <a href={externalHref(s.url)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{s.label}</a>
              {(s.start || s.end) && <span className="font-mono text-[11px] text-stone-500">{s.start}–{s.end}</span>}
            </div>
          ))}
        </div>
      </Section>

      {idea.format === "Reel" && (
        <Section title="Reel direction">
          <div className="space-y-2 text-sm text-stone-800">
            <div><span className="text-stone-500">Editing:</span> {idea.brief.editingDirection}</div>
            <div className="flex items-center gap-2"><span className="text-stone-500">Music:</span> {idea.brief.musicNotes} {idea.brief.musicLink && <a className="text-blue-700 hover:underline" href={externalHref(idea.brief.musicLink)} target="_blank" rel="noreferrer">ref</a>}
              <CommentAnchorBtn idea={idea} anchor={{ type: "music" }} />
            </div>
          </div>
        </Section>
      )}

      {idea.format === "Carousel" && idea.brief.visualHook && (
        <Section title="Visual hook">
          <p className="text-xs text-stone-600">{idea.brief.visualHook}</p>
        </Section>
      )}

      {idea.format === "Static" && (
        <Section title="Static copy & visual">
          <p className="text-sm text-stone-800">{idea.brief.bodyCopy}</p>
          {idea.brief.visualHook && <p className="mt-2 text-xs text-stone-500"><span className="font-semibold">Visual hook:</span> {idea.brief.visualHook}</p>}
        </Section>
      )}
    </div>
  );
}

function VersionRow({ idea, v, ownerWorkspace = false, readOnly = false, linkAll = false, pendingLinks = {}, setPendingLinks }) {
  const { db, actions, actingUser } = useWorkspace();
  const ip = ipById(db, v.ipId);
  const pub = publicationOf(db, v.id);
  const pending = pendingLinks[v.id] || { type: "canva", url: "" };
  const linkType = pending.type || "canva";
  const linkUrl = pending.url || "";
  const canReview = !readOnly && (actingUser.id === idea.reviewerId || isAdmin(actingUser) || actingUser.roles.includes("CS") || actingUser.roles.includes("Short-form Lead"));
  const canSubmit = !readOnly && canSubmitProduction(actingUser, idea, ownerWorkspace);
  const canEditCopy = !readOnly && (canSubmit || actingUser.roles.some((r) => ["CS", "Short-form Lead"].includes(r)));
  const versionFeedback = db.comments.filter((c) => c.versionId === v.id);
  // Same two conditions as the idea-level button: somebody owns it, and there is
  // something to look at.
  const assigned = !!idea.productionOwnerId && !!idea.reviewerId;
  const readyToSubmit = assigned && (hasDeliverable(v) || !!linkUrl.trim());
  const setPending = (patch) => {
    if (!setPendingLinks) return;
    setPendingLinks((p) => {
      if (patch == null) {
        const next = { ...p };
        delete next[v.id];
        return next;
      }
      return { ...p, [v.id]: { type: "canva", url: "", ...p[v.id], ...patch } };
    });
  };
  const commitLink = () => {
    const url = linkUrl.trim();
    if (!url) return false;
    // Checked here rather than only on save, so nobody gets to the end of their work
    // and finds out the thing they pasted an hour ago was never going to open.
    const complaint = assetLinkError(url);
    if (complaint) { toast.error(complaint); return false; }
    const link = { type: linkType, url: externalHref(url), label: url };
    if (linkAll) {
      // One call for the whole idea, rather than one per page: the server knows which
      // pages are still empty, and this is one reload instead of six.
      actions.addLinkToEveryPage(idea.id, link).then((res) => {
        if (!res) return;
        toast.success(res.skipped
          ? `Added to ${res.applied} page${res.applied === 1 ? "" : "s"} — ${res.skipped} already had a link`
          : `Added to all ${res.applied} pages`);
      });
    } else {
      actions.addVersionLink(v.id, link);
      toast.success("Link added");
    }
    setPending(null);
    return true;
  };

  return (
    <div className="rounded-lg border border-[#E6E1D8] bg-white p-4" data-testid={`version-row-${v.id}`}>
      <div className="flex items-center justify-between mb-2">
        <IPBadge ip={ip} showName />
        {pub ? <PerfBadge tier="unrated" className="hidden" /> : null}
        {pub ? <StatusBadge state="published" /> : <VersionBadge status={v.reviewStatus} />}
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <label className="text-[10px] uppercase tracking-wide text-stone-400">Hook variation</label>
          <SavedField value={v.hookOverride} placeholder={`Hook for ${ip?.code || "this page"}…`} onSave={(text) => updateVersion(actions, v.id, { hookOverride: text })} disabled={!canEditCopy} className="h-8 text-sm mt-0.5" />
        </div>
        {idea.format === "Reel" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-stone-400">Sub hook</label>
            <SavedField
              data-testid={`sub-hook-${v.id}`}
              value={v.subHook || ""}
              placeholder="Follow-up line after the opening hook…"
              onSave={(text) => updateVersion(actions, v.id, { subHook: text })}
              disabled={!canEditCopy}
              className="h-8 text-sm mt-0.5"
            />
          </div>
        )}
        {/* Body text is where the copy lives now that the slide-by-slide editor is
            gone, so it can't stay behind BO-and-approved — an HPN carousel, or a BO one
            still waiting on approval, would have nowhere to put it. */}
        {(idea.format === "Carousel" || idea.format === "Static") && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-stone-400">Body text</label>
            <SavedField
              multiline
              data-testid={`body-text-${v.id}`}
              value={v.bodyText || ""}
              placeholder={idea.format === "Static" ? "Body copy for this page…" : "All the slides, in order — paste the whole thing…"}
              onSave={(text) => updateVersion(actions, v.id, { bodyText: text })}
              disabled={!canEditCopy}
              className="text-sm mt-0.5 min-h-[140px]"
            />
          </div>
        )}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-stone-400">Caption</label>
          <SavedField multiline value={v.caption} onSave={(text) => updateVersion(actions, v.id, { caption: text })} disabled={!canEditCopy} className="text-xs mt-0.5 min-h-[48px]" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-stone-400">Deliverable links</label>
          <div className="mt-1 space-y-1.5">
            {v.assetLinks.map((l) => (
              <AssetLinkRow key={l.id} versionId={v.id} link={l} canManage={canSubmit} />
            ))}
            {!v.assetLinks.length && !linkUrl.trim() && <span className="text-[11px] text-stone-400">No links yet — paste a Canva or Drive URL.</span>}
          </div>
          {/* One deliverable, not a pile of them. Three Canva links on a version and
              nobody can tell which one the reviewer is meant to open, so the add row is
              only here while there is nothing to open. A wrong URL is fixed with Edit,
              and a rework after changes were requested goes through Replace, which
              swaps the file rather than adding a second one to guess between. */}
          {canSubmit && !v.assetLinks.length && (
            <div className="mt-2 flex items-center gap-2">
              <Select value={linkType} onValueChange={(type) => setPending({ type })}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="canva">Canva</SelectItem><SelectItem value="drive">Drive</SelectItem></SelectContent>
              </Select>
              <Input
                value={linkUrl}
                onChange={(e) => setPending({ url: e.target.value })}
                placeholder={linkType === "canva" ? "Paste Canva link…" : "Paste Drive link…"}
                className="h-7 text-xs flex-1"
                data-testid={`link-url-${v.id}`}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLink(); } }}
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`add-link-${v.id}`} onClick={() => {
                // commitLink reports both outcomes — an empty box and a link to nowhere
                // deserve different sentences, and "added to all 6 pages" is not "added".
                if (!commitLink() && !linkUrl.trim()) toast.error("Paste the Canva or Drive link.");
              }}><Icons.Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
          )}
        </div>
      </div>

      {versionFeedback.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-rose-100 pt-3" data-testid={`version-feedback-${v.id}`}>
          <label className="text-[10px] uppercase tracking-wide text-rose-500">What needs changing</label>
          {versionFeedback.map((c) => (
            <VersionFeedbackNote key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* actions */}
      {!pub && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
          {["not_started", "in_production", "changes_requested"].includes(v.reviewStatus) && canSubmit && readyToSubmit && (
            <Button size="sm" className="h-7 text-xs" data-testid={`submit-review-${v.id}`} onClick={() => {
              actions.submitForReview(v.id, pendingLinkPayload(v.id, pendingLinks));
              setPending(null);
              toast.success("Submitted for review");
            }}><Icons.Send className="h-3 w-3 mr-1" /> Submit for review</Button>
          )}
          {["not_started", "in_production", "changes_requested"].includes(v.reviewStatus) && canSubmit && !readyToSubmit && (
            <span className="text-[11px] text-amber-700" data-testid={`submit-blocked-${v.id}`}>
              {!assigned
                ? `Assign ${!idea.productionOwnerId && !idea.reviewerId ? "an owner and a reviewer" : !idea.productionOwnerId ? "a production owner" : "a reviewer"} before submitting — a review needs someone to do it and someone to send changes back to.`
                : "Add a Canva or Drive link before submitting — nothing to review without a deliverable."}
            </span>
          )}
          {v.reviewStatus === "awaiting_review" && canReview && (
            <>
              <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800" data-testid={`approve-version-${v.id}`} onClick={() => { actions.approveVersion(v.id); toast.success("Version approved — Ready"); }}><Icons.Check className="h-3 w-3 mr-1" /> Approve</Button>
              <RequestChangesBtn versionId={v.id} />
            </>
          )}
          {v.reviewStatus === "changes_requested" && canReview && (
            <RequestChangesBtn versionId={v.id} />
          )}
          {["ready", "changes_requested"].includes(v.reviewStatus) && canSubmit && (v.assetLinks || []).length > 0 && (
            <ReplaceAssetBtn versionId={v.id} status={v.reviewStatus} />
          )}
        </div>
      )}
    </div>
  );
}

function VersionFeedbackNote({ comment: c }) {
  const { db, actions } = useWorkspace();
  const [reply, setReply] = useState("");
  const author = userById(db, c.authorId);
  return (
    <div className={cn("rounded-md border p-2.5", c.resolved ? "border-stone-200 bg-stone-50 opacity-70" : "border-rose-200 bg-rose-50/70")} data-testid={`comment-${c.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={author} size={20} />
          <span className="text-xs font-medium text-stone-800 truncate">{author?.name}</span>
          <span className="text-[10px] text-stone-400 shrink-0">{istDateTimeLabel(c.at)}</span>
        </div>
        <button onClick={() => actions.resolveComment(c.id, !c.resolved)} className="text-[10px] text-stone-400 hover:text-emerald-600 shrink-0">{c.resolved ? "Reopen" : "Resolve"}</button>
      </div>
      <p className="mt-1.5 text-sm text-stone-800">{c.text}</p>
      {c.replies.map((r) => (
        <div key={r.id} className="mt-2 ml-6 border-l-2 border-rose-200 pl-2">
          <span className="text-[11px] font-medium text-stone-700">{userById(db, r.authorId)?.name}: </span>
          <span className="text-[11px] text-stone-600">{r.text}</span>
        </div>
      ))}
      <div className="mt-2 flex gap-2">
        <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="h-7 text-xs bg-white" data-testid={`reply-feedback-${c.id}`} />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (reply.trim()) { actions.replyComment(c.id, reply); setReply(""); } }}>Reply</Button>
      </div>
    </div>
  );
}

function updateVersion(actions, versionId, patch) {
  actions.updateVersion(versionId, patch);
}

function AssetLinkRow({ versionId, link, canManage }) {
  const { actions } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(link.type || "canva");
  const [url, setUrl] = useState(link.url || "");
  useEffect(() => {
    setType(link.type || "canva");
    setUrl(link.url || "");
  }, [link.type, link.url]);
  const save = () => {
    const next = url.trim();
    if (!next) { toast.error("Paste a Canva or Drive link."); return; }
    actions.updateVersionLink(versionId, link.id, { type, url: externalHref(next), label: next });
    setEditing(false);
    toast.success("Link updated");
  };
  return (
    <div className="flex items-center gap-2 text-xs min-w-0" data-testid={`asset-link-${link.id}`}>
      {editing && canManage ? (
        <>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-7 w-24 text-xs shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="canva">Canva</SelectItem><SelectItem value="drive">Drive</SelectItem></SelectContent>
          </Select>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="h-7 text-xs flex-1" data-testid={`edit-link-url-${link.id}`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
          <Button size="sm" className="h-7 text-xs shrink-0" data-testid={`save-link-${link.id}`} onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => { setEditing(false); setType(link.type || "canva"); setUrl(link.url || ""); }}>Cancel</Button>
        </>
      ) : (
        <>
          <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] shrink-0", link.type === "canva" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800")}>{link.type}</span>
          <a href={externalHref(link.url)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate min-w-0">{link.label || link.url}</a>
          {canManage && (
            <span className="ml-auto flex items-center gap-2 shrink-0">
              <button type="button" data-testid={`edit-link-${link.id}`} onClick={() => setEditing(true)} className="text-[11px] text-stone-500 hover:text-stone-800">Edit</button>
              <button type="button" data-testid={`remove-link-${link.id}`} onClick={() => { actions.removeVersionLink(versionId, link.id); toast.success("Link removed"); }} className="text-[11px] text-rose-600 hover:text-rose-800">Remove</button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

function RequestChangesBtn({ versionId }) {
  const { actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) return <Button size="sm" variant="outline" className="h-7 text-xs border-rose-300 text-rose-700 hover:bg-rose-50" data-testid={`request-changes-${versionId}`} onClick={() => setOpen(true)}><Icons.RotateCcw className="h-3 w-3 mr-1" /> Request changes</Button>;
  return (
    <div className="flex items-center gap-2 w-full">
      <Input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs changing?" className="h-7 text-xs" />
      <Button size="sm" className="h-7 text-xs" onClick={() => { actions.requestChanges(versionId, note); toast("Changes requested"); setNote(""); setOpen(false); }}>Send</Button>
    </div>
  );
}

function ReplaceAssetBtn({ versionId, status }) {
  const { actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  if (!open) return <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`replace-asset-${versionId}`} onClick={() => setOpen(true)}><Icons.RefreshCw className="h-3 w-3 mr-1" /> {status === "changes_requested" ? "Submit the reworked file" : "Replace approved asset"}</Button>;
  return (
    <div className="flex items-center gap-2 w-full">
      <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the new Canva or Drive link…" className="h-7 text-xs" data-testid={`replace-asset-url-${versionId}`} />
      <Button size="sm" className="h-7 text-xs" onClick={() => {
        const link = url.trim();
        if (!link) { toast.error("Paste the new link — nothing is added automatically."); return; }
        const complaint = assetLinkError(link);
        if (complaint) { toast.error(complaint); return; }
        // The type follows the host rather than being hardcoded to drive — a Canva
        // rework was being filed as a Drive link, which made the list read wrong.
        const type = /(^|\.)canva\.(com|site)$/.test(new URL(externalHref(link)).hostname) ? "canva" : "drive";
        actions.replaceAsset(versionId, { type, url: externalHref(link), label: link });
        toast("Asset replaced — returned to review");
        setUrl("");
        setOpen(false);
      }}>Save</Button>
    </div>
  );
}

function VersionsTab({ idea, versions, readOnly = false, pendingLinks, setPendingLinks }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {readOnly && <p className="col-span-full text-[11px] text-stone-400">The copy and files are edited in Production &amp; Review.</p>}
      {versions.map((v) => <VersionRow key={v.id} idea={idea} v={v} readOnly={readOnly} pendingLinks={pendingLinks} setPendingLinks={setPendingLinks} />)}
      {!versions.length && <p className="text-sm text-stone-500">No page versions yet. Add destinations in Production & Review.</p>}
    </div>
  );
}

function ProductionTab({ idea, versions, ownerWorkspace = false, pendingLinks, setPendingLinks, linkAll, setLinkAll }) {
  const { db, actions, actingUser, today } = useWorkspace();
  const isCoa = canAssignProduction(actingUser);
  const producers = db.users.filter((u) => u.active && u.roles.some((r) => ["Designer", "Editor"].includes(r)));
  const reviewers = db.users.filter((u) => u.active && u.roles.some((r) => ["CS", "Founder/Admin", "COA", "Short-form Lead"].includes(r)));
  const [owner, setOwner] = useState(idea.productionOwnerId || "");
  const [deadline, setDeadline] = useState(idea.deadline || "");
  const [reviewer, setReviewer] = useState(idea.reviewerId || "");
  // HPN is same-day work. A date picker on a news idea is noise — everyone already
  // knows the day, what they need to agree is the hour. BO keeps the date.
  const sameDay = idea.stream === "HPN";
  const [deadlineTime, setDeadlineTime] = useState((idea.deadlineTime || "").slice(0, 5));

  return (
    <div>
      <Section title="Assignment (one owner per idea)">
        {needsIdeaApproval(idea) && idea.approval.state !== "approved" && !idea.bypassUsed && <p className="text-xs text-amber-700 mb-3 inline-flex items-center gap-1"><Icons.AlertTriangle className="h-3.5 w-3.5" /> Idea not yet approved — BO cannot bypass required approval.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-stone-400">Production owner</label>
            <Select value={owner} onValueChange={setOwner} disabled={!isCoa}>
              <SelectTrigger className="h-9 mt-1" data-testid="assign-owner-select"><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>{producers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.roles[0]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-stone-400">
              {sameDay ? "Due by (today, IST)" : "Deadline"}
            </label>
            {sameDay ? (
              <Input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} disabled={!isCoa} className="h-9 mt-1" data-testid="assign-deadline-time" />
            ) : (
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!isCoa} className="h-9 mt-1" data-testid="assign-deadline" />
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-stone-400">Reviewer</label>
            <Select value={reviewer} onValueChange={setReviewer} disabled={!isCoa}>
              <SelectTrigger className="h-9 mt-1" data-testid="assign-reviewer-select"><SelectValue placeholder="Select reviewer" /></SelectTrigger>
              <SelectContent>{reviewers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.roles[0]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {isCoa && <Button size="sm" className="mt-3 h-8" data-testid="save-assignment-btn" onClick={() => {
          // An HPN time is stored against today, so the deadline still answers "which
          // day" for everything that reads it — the time is the part people argue over.
          actions.assignProduction([idea.id], owner, sameDay ? (deadline || today) : deadline, reviewer, sameDay ? deadlineTime : null);
          toast.success("Assignment saved — all versions keep one owner");
        }}><Icons.Save className="h-3.5 w-3.5 mr-1" /> Save assignment</Button>}
        <div className="mt-3 text-xs text-stone-500 flex flex-wrap gap-4">
          {idea.productionOwnerId && <span>Owner: <b>{userById(db, idea.productionOwnerId)?.name}</b></span>}
          {idea.reviewerId && <span>Reviewer: <b>{userById(db, idea.reviewerId)?.name}</b></span>}
          {sameDay && idea.deadlineTime && <span>Due by: <b>{idea.deadlineTime.slice(0, 5)} IST today</b></span>}
          {!sameDay && idea.deadline && <span>Due: <b>{fmtDate(idea.deadline)}</b></span>}
          {idea.previousOwners?.length ? <span className="text-stone-400">Prev owners retained: {idea.previousOwners.length}</span> : null}
        </div>
      </Section>

      {!ownerWorkspace && isCoa && (
        <Section title="Review requests" right={
          <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="request-review-btn" onClick={() => { actions.requestReview(idea.id, idea.reviewerId || reviewer); toast.success("Review requested (in-app)"); }}><Icons.Send className="h-3 w-3 mr-1" /> Request review from reviewer</Button>
        }>
          <p className="text-xs text-stone-500">COA sends an in-app review request to the assigned reviewer. Individual versions are approved separately below.</p>
        </Section>
      )}

      {versions.length > 1 && (
        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-stone-600" data-testid="link-all-toggle">
          <Switch checked={!!linkAll} onCheckedChange={setLinkAll} />
          Same file on every page
          <span className="text-[10px] text-stone-400">
            {linkAll
              ? "Adding a link fills every page that has not got one."
              : "Links are added to one page at a time."}
          </span>
        </label>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {versions.map((v) => <VersionRow key={v.id} idea={idea} v={v} ownerWorkspace={ownerWorkspace} linkAll={linkAll} pendingLinks={pendingLinks} setPendingLinks={setPendingLinks} />)}
      </div>
    </div>
  );
}

function DistributionTab({ idea, versions }) {
  const { db, actions, actingUser } = useWorkspace();
  const isCoc = actingUser.roles.includes("COC") || isAdmin(actingUser);
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">Placement is separate from production and approval. A version can be scheduled while still awaiting approval; moving it does not change its production state.</p>
      {versions.map((v) => {
        const ip = ipById(db, v.ipId);
        const pl = activePlacementOf(db, v.id);
        const pub = publicationOf(db, v.id);
        return (
          <div key={v.id} className="rounded-lg border border-[#E6E1D8] bg-white p-3 flex items-center gap-4 flex-wrap" data-testid={`dist-row-${v.id}`}>
            <IPBadge ip={ip} />
            {pub ? <StatusBadge state="published" /> : <VersionBadge status={v.reviewStatus} />}
            <div className="flex items-center gap-2 text-sm">
              <Icons.Calendar className="h-3.5 w-3.5 text-stone-400" />
              <Input type="date" value={pl?.date || ""} disabled={!isCoc || !!pub} onChange={async (e) => { try { const c = await actions.placeVersion(v.id, e.target.value); if (c === "same_day_repetition") toast.warning("Same idea already placed on another IP that date — needs authorised exception"); else toast.success("Placed"); } catch (err) { /* the store already showed the error */ } }} className="h-8 w-40 text-sm" />
              {pl?.time && <span className="font-mono text-[11px] text-stone-500">{pl.time} IST</span>}
              {pl && <span className="text-[10px] rounded px-1.5 py-0.5 border border-stone-200 text-stone-500">{pl.state}</span>}
            </div>
            {pub && <a href={externalHref(pub.url)} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"><Icons.ExternalLink className="h-3 w-3" /> Live link</a>}
            {!pub && v.reviewStatus === "ready" && isCoc && pl && (
              <PublishBtn versionId={v.id} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PublishBtn({ versionId }) {
  const { actions } = useWorkspace();
  return <Button size="sm" className="h-7 text-xs ml-auto bg-stone-900" data-testid={`publish-${versionId}`} onClick={async () => { try { const r = await actions.confirmPublication(versionId, "https://instagram.com/reel/" + Math.random().toString(36).slice(2, 8), nowIso()); if (r.dupUrl) toast.warning("URL already used — consider collaboration linkage"); else toast.success("Publication confirmed — 24h capture task created"); } catch (e) { /* the store already showed the error */ } }}><Icons.Upload className="h-3 w-3 mr-1" /> Confirm publication</Button>;
}

function PerformanceTab({ idea, versions, readOnly = false }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        {readOnly
          ? "Captured ~24h views for each published page. Missing means nobody has recorded a number yet — it is not zero."
          : "Paste ~24h views for each published page. Missing stays missing until you save a number (zero is a real value)."}
      </p>
      {versions.map((v) => <PerfVersionRow key={v.id} idea={idea} v={v} readOnly={readOnly} />)}
    </div>
  );
}

function PerfVersionRow({ idea, v, readOnly = false }) {
  const { db, actions } = useWorkspace();
  const ip = ipById(db, v.ipId);
  const pub = publicationOf(db, v.id);
  const snap = pub && snapshotOf(db, pub.id);
  const t = targetFor(db, v.ipId, idea.format);
  const [val, setVal] = useState(snap?.views ?? "");
  useEffect(() => { setVal(snap?.views ?? ""); }, [snap?.views, pub?.id]);
  const tier = snap && snap.views != null ? classify(snap.views, t, db.settings.thresholds) : "unrated";
  const save = () => {
    if (!pub) return;
    actions.recordSnapshot(pub.id, val === "" ? null : val, nowIso());
    toast.success(val === "" ? "Marked missing" : "Views recorded");
  };
  return (
    <div className="rounded-lg border border-[#E6E1D8] bg-white p-3 flex items-center gap-4 flex-wrap" data-testid={`idea-perf-${v.id}`}>
      <IPBadge ip={ip} />
      {!pub && <span className="text-xs text-stone-400">Not published — remaining destination</span>}
      {pub && (
        <>
          <span className="text-xs text-stone-500">Published {istDateTimeLabel(pub.publishedAt)}</span>
          <span className="text-sm font-semibold text-stone-900">{snap?.views == null ? "— (missing)" : snap.views.toLocaleString() + " views"}</span>
          {snap?.ageHours > 0 && snap.ageHours !== 24 && <span className="text-[10px] text-amber-700">captured at {snap.ageHours}h</span>}
          <span className="text-[11px] text-stone-400">target {t ? t.toLocaleString() : "—"}</span>
          <PerfBadge tier={tier} />
          <div className="ml-auto flex items-center gap-1.5">
            {!readOnly && (
              <>
                <Input
                  type="number"
                  min="0"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder="Add views…"
                  className="h-8 w-28 text-xs"
                  data-testid={`idea-perf-views-${v.id}`}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                />
                <Button size="sm" className="h-8 text-xs bg-stone-900" data-testid={`idea-perf-save-${v.id}`} onClick={save}>Save views</Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActivityTab({ idea, comments, onJump }) {
  const { db, actions } = useWorkspace();
  const events = db.activity.filter((a) => a.ideaId === idea.id).slice().reverse();
  const [reply, setReply] = useState({});
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title={`Comments (${comments.length})`}>
        {!comments.length && <p className="text-xs text-stone-400">No comments yet. Anchor comments to the brief, music notes or assets from the Brief and Versions tabs.</p>}
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className={cn("rounded-md border p-2.5", c.resolved ? "border-stone-200 bg-stone-50 opacity-70" : "border-stone-200")} data-testid={`comment-${c.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar user={userById(db, c.authorId)} size={20} />
                  <span className="text-xs font-medium text-stone-800">{userById(db, c.authorId)?.name}</span>
                  <button onClick={() => onJump(c.anchor.versionId ? { ...c.anchor, versionId: c.versionId } : c.anchor)} className="text-[10px] rounded bg-stone-100 px-1.5 py-0.5 text-stone-500 hover:text-[#C0512F]">@{c.anchor?.type || "general"}</button>
                </div>
                <button onClick={() => actions.resolveComment(c.id, !c.resolved)} className="text-[10px] text-stone-400 hover:text-emerald-600">{c.resolved ? "Reopen" : "Resolve"}</button>
              </div>
              <p className="mt-1 text-sm text-stone-700">{c.text}</p>
              {c.replies.map((r) => (
                <div key={r.id} className="mt-2 ml-6 border-l-2 border-stone-200 pl-2">
                  <span className="text-[11px] font-medium text-stone-700">{userById(db, r.authorId)?.name}: </span>
                  <span className="text-[11px] text-stone-600">{r.text}</span>
                </div>
              ))}
              <div className="mt-2 flex gap-2">
                <Input value={reply[c.id] || ""} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} placeholder="Reply…" className="h-7 text-xs" />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (reply[c.id]?.trim()) { actions.replyComment(c.id, reply[c.id]); setReply({ ...reply, [c.id]: "" }); } }}>Reply</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3"><GeneralComment idea={idea} /></div>
      </Section>

      <Section title="Activity & history">
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs">
              <Icons.Dot className="h-4 w-4 text-stone-300 mt-0.5" />
              <div>
                <span className="text-stone-800">{e.text}</span>
                <span className="block text-[10px] text-stone-400">{istDateTimeLabel(e.at)}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function GeneralComment({ idea }) {
  const { actions } = useWorkspace();
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a general comment…" className="h-8 text-sm" data-testid="general-comment-input" />
      <Button size="sm" className="h-8" onClick={() => { if (text.trim()) { actions.addComment(idea.id, { anchor: { type: "general" }, text }); setText(""); toast.success("Comment added"); } }}>Post</Button>
    </div>
  );
}
