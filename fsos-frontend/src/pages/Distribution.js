import React, { useState, useMemo, useEffect } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../domain/store";
import { useUI } from "../components/idea/IdeaModalProvider";
import { PageHeader } from "../components/common/PageHeader";
import { StreamBadge, StatusBadge, FormatBadge, IPBadge, VersionBadge, PerfBadge } from "../components/common/badges";
import { versionsOf, ideaById, ipById, userById, activePlacementOf, publicationOf, snapshotOf, readyBankVersions, bankSummary, targetFor, classify, sameDayConflict, matchesStream, visibleIps } from "../domain/selectors";
import { formatCounts } from "../domain/constants";
import { fmtDate, weekdayShort, addDays, nowIso, istTimeStr } from "../domain/dates";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { cn, externalHref } from "../lib/utils";
import { isAdmin } from "../domain/roles";
import BulkPlacement from "../components/distribution/BulkPlacement";
import ReplacementDialog from "../components/distribution/ReplacementDialog";

const TABS = [["bank", "Bank"], ["calendar", "Calendar"], ["matrix", "Idea Matrix"], ["today", "Today"]];

export default function Distribution() {
  const [tab, setTab] = useState("matrix");
  const [bulkOpen, setBulkOpen] = useState(false);
  return (
    <div className="p-6">
      <PageHeader title="Distribution" icon={Icons.CalendarDays} subtitle="COC-controlled planning — visibility, manual & bulk placement, counts and conflict checks. FSOS never auto-allocates.">
        <Button variant="outline" size="sm" data-testid="open-bulk-btn" onClick={() => setBulkOpen(true)}><Icons.LayoutGrid className="h-4 w-4 mr-1" /> Bulk placement</Button>
      </PageHeader>
      <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5 mb-4">
        {TABS.map(([v, l]) => <button key={v} data-testid={`dist-tab-${v}`} onClick={() => setTab(v)} className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", tab === v ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>{l}</button>)}
      </div>
      {tab === "bank" && <Bank />}
      {tab === "calendar" && <CalendarView />}
      {tab === "matrix" && <IdeaMatrix />}
      {tab === "today" && <Today />}
      <BulkPlacement open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}

/* ---------------- BANK ---------------- */
function Bank() {
  const { db } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [ipf, setIpf] = useState("all");
  const [fmt, setFmt] = useState("all");
  const [alloc, setAlloc] = useState("all");
  const sum = bankSummary(db, streamFilter);
  let ready = sum.ready;
  ready = ready.filter((v) => {
    const idea = ideaById(db, v.ideaId);
    if (ipf !== "all" && v.ipId !== ipf) return false;
    if (fmt !== "all" && (fmt === "Reel" ? idea.format !== "Reel" : idea.format === "Reel")) return false;
    const placed = !!activePlacementOf(db, v.id);
    if (alloc === "allocated" && !placed) return false;
    if (alloc === "unallocated" && placed) return false;
    return true;
  });

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Ready versions" value={sum.readyCount} />
        <Stat label="Parent ideas" value={sum.ideaCount} note="ideas ≠ assets" />
        <Stat label="Unallocated" value={sum.unallocatedCount} />
        <Stat label="Ready Reels" value={sum.byFormat.Reel} />
        <Stat label="Ready Posts" value={sum.byFormat.Post} />
      </div>
      {streamFilter !== "HPN" && (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 mb-3 text-[11px] text-amber-800 flex items-center gap-2">
        <Icons.Info className="h-3.5 w-3.5" /> BO quotas per IP are unconfigured, so "days of coverage" is Not configured — no fabricated health score. Ten days is a stock target, not an expiry.
      </div>
      )}
      <div className="flex gap-2 mb-3">
        <FSel value={ipf} onChange={setIpf} options={[["all", "All IPs"], ...visibleIps(db).map((i) => [i.id, i.code])]} />
        <FSel value={fmt} onChange={setFmt} options={[["all", "All formats"], ["Reel", "Reels"], ["Post", "Posts"]]} />
        <FSel value={alloc} onChange={setAlloc} options={[["all", "All"], ["allocated", "Allocated"], ["unallocated", "Unallocated"]]} />
      </div>
      <div className="space-y-2">
        {ready.map((v) => {
          const idea = ideaById(db, v.ideaId);
          const pl = activePlacementOf(db, v.id);
          const ageDays = Math.max(0, -1 * (new Date(idea.approval.at || idea.createdAt) - new Date()) / 86400000 * -1);
          return (
            <div key={v.id} className="rounded-lg border border-[#E6E1D8] bg-white p-3 flex items-center gap-3" data-testid={`bank-row-${v.id}`}>
              <IPBadge ip={ipById(db, v.ipId)} />
              <FormatBadge format={idea.format} />
              <button onClick={() => openIdea(idea.id)} className="flex-1 text-left text-sm text-stone-800 hover:underline truncate">{idea.title}</button>
              <span className="text-[11px] text-stone-400">age {Math.round((Date.now() - new Date(idea.approval.at || idea.createdAt)) / 86400000)}d</span>
              {pl ? <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><Icons.CalendarCheck className="h-3.5 w-3.5" />{fmtDate(pl.date)}</span> : <span className="text-[11px] text-amber-700 inline-flex items-center gap-1"><Icons.CircleDashed className="h-3.5 w-3.5" />unallocated</span>}
            </div>
          );
        })}
        {!ready.length && <Empty text="No ready stock matches these filters." />}
      </div>
    </div>
  );
}

/* ---------------- IDEA MATRIX ---------------- */
function IdeaMatrix() {
  const { db } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [panel, setPanel] = useState(null); // versionId
  const [batchF, setBatchF] = useState("all");
  const [onlyUnalloc, setOnlyUnalloc] = useState(false);
  const batches = db.batches.filter((b) => streamFilter === "All" || b.stream === streamFilter);
  const activeBatch = batchF !== "all" && batches.some((b) => b.id === batchF) ? batchF : "all";
  const ideas = db.ideas.filter((i) => i.destinations.length && matchesStream(i, streamFilter) && (activeBatch === "all" || i.batchId === activeBatch));

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <FSel value={activeBatch} onChange={setBatchF} options={[["all", streamFilter === "All" ? "All batches" : `All ${streamFilter} batches`], ...batches.map((b) => [b.id, b.name])]} />
          <label className="flex items-center gap-1.5 text-xs text-stone-600"><Checkbox checked={onlyUnalloc} onCheckedChange={setOnlyUnalloc} data-testid="matrix-unalloc" /> Unallocated versions only</label>
          <div className="ml-auto flex items-center gap-3 text-[10px] text-stone-400">
            <Legend color="bg-stone-300" label="intended, not ready" /><Legend color="bg-emerald-500" label="ready" /><Legend color="bg-blue-600" label="planned" /><Legend color="bg-stone-800" label="published" />
          </div>
        </div>
        <div className="overflow-auto fsos-scroll rounded-lg border border-[#E6E1D8] bg-white max-h-[70vh]">
          <table className="text-xs border-collapse" data-testid="idea-matrix">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-[#F5F2EC] border-b border-r border-stone-200 px-3 py-2 text-left font-medium text-stone-500 min-w-[240px]">Idea</th>
                {visibleIps(db).map((ip) => (
                  <th key={ip.id} className="bg-[#F5F2EC] border-b border-stone-200 px-2 py-2 min-w-[64px]">
                    <div className="flex flex-col items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ip.hex }} /><span className="font-mono text-[10px] text-stone-600">{ip.code}</span></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea) => (
                <tr key={idea.id} className="hover:bg-stone-50/50">
                  <td className="sticky left-0 z-10 bg-white border-b border-r border-stone-100 px-3 py-2 min-w-[240px]">
                    <button onClick={() => openIdea(idea.id)} className="text-left w-full">
                      <div className="flex items-center gap-1.5 mb-0.5"><StreamBadge stream={idea.stream} /><FormatBadge format={idea.format} /></div>
                      <div className="text-[11px] text-stone-800 truncate max-w-[220px]">{idea.title}</div>
                    </button>
                  </td>
                  {visibleIps(db).map((ip) => {
                    const v = versionsOf(db, idea.id).find((x) => x.ipId === ip.id);
                    if (!v) return <td key={ip.id} className="border-b border-stone-100 text-center text-stone-200">·</td>;
                    const pub = publicationOf(db, v.id);
                    const pl = activePlacementOf(db, v.id);
                    if (onlyUnalloc && (pub || pl)) return <td key={ip.id} className="border-b border-stone-100 text-center text-stone-200">·</td>;
                    return (
                      <td key={ip.id} className="border-b border-stone-100 p-1 text-center">
                        <button data-testid={`matrix-cell-${v.id}`} onClick={() => setPanel(v.id)} className="mx-auto flex h-8 w-full max-w-[56px] items-center justify-center rounded-md border transition-colors hover:ring-2 hover:ring-stone-300"
                          style={{ background: pub ? "#1c1917" : pl ? "#2563eb" : v.reviewStatus === "ready" ? "#10b981" : "#d6d3d1", borderColor: "transparent" }}>
                          {pub ? <Icons.Check className="h-4 w-4 text-white" /> : pl ? <span className="text-[9px] font-medium text-white">{fmtDate(pl.date).split(" ")[0]}</span> : v.reviewStatus === "ready" ? <Icons.Box className="h-3.5 w-3.5 text-white" /> : <span className="text-[8px] text-stone-500">···</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!ideas.length && <div className="p-8 text-center text-sm text-stone-400">No {streamFilter === "All" ? "" : streamFilter + " "}ideas match these filters.</div>}
        </div>
      </div>
      {panel && <CellPanel versionId={panel} onClose={() => setPanel(null)} />}
    </div>
  );
}

function CellPanel({ versionId, onClose }) {
  const { db, actingUser } = useWorkspace();
  const { openIdea } = useUI();
  const v = db.versions.find((x) => x.id === versionId);
  const idea = ideaById(db, v.ideaId);
  const ip = ipById(db, v.ipId);
  const pl = activePlacementOf(db, v.id);
  const pub = publicationOf(db, v.id);
  const snap = pub && snapshotOf(db, pub.id);
  const feedback = db.comments.filter((c) => c.versionId === v.id);
  const t = targetFor(db, v.ipId, idea.format);
  const canDistribute = actingUser.roles.includes("COC") || isAdmin(actingUser);
  const canConfirm = !pub && pl && canDistribute;
  return (
    <div className="w-80 shrink-0 rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] p-4 max-h-[70vh] overflow-auto fsos-scroll" data-testid="matrix-side-panel">
      <div className="flex items-center justify-between mb-3">
        <IPBadge ip={ip} showName />
        <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><Icons.X className="h-4 w-4" /></button>
      </div>
      <button onClick={() => openIdea(idea.id, { tab: "distribution" })} className="text-left font-medium text-stone-900 hover:underline text-sm">{idea.title}</button>
      <div className="mt-2 flex items-center gap-2">{pub ? <StatusBadge state="published" /> : <VersionBadge status={v.reviewStatus} />}<FormatBadge format={idea.format} /></div>
      {!pub && !pl && v.reviewStatus === "ready" && canDistribute && <AllocateForm versionId={v.id} ipCode={ip?.code} />}
      {canConfirm && <ConfirmLiveForm versionId={v.id} ideaId={idea.id} onPublished={onClose} dateLabel={`${fmtDate(pl.date)}${pl.time ? ` · ${pl.time} IST` : ""}`} ready={v.reviewStatus === "ready"} />}
      <Field label="Hook variation" value={v.hookOverride || idea.brief?.sharedHook} />
      {idea.format === "Reel" && <Field label="Sub hook" value={v.subHook || "—"} />}
      {idea.stream === "BO" && (idea.format === "Carousel" || idea.format === "Static") && idea.approval.state === "approved" && (
        <Field label="Body text" value={v.bodyText || "—"} />
      )}
      <Field label="Assets">{v.assetLinks.length ? v.assetLinks.map((l) => <a key={l.id} href={externalHref(l.url)} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-700 hover:underline">{l.type}: {l.label}</a>) : <span className="text-[11px] text-stone-400">none</span>}</Field>
      <Field label="Reviewer feedback">{feedback.length ? feedback.map((c) => <p key={c.id} className="text-[11px] text-stone-600">· {c.text}</p>) : <span className="text-[11px] text-stone-400">no feedback</span>}</Field>
      <Field label="Placement">{pl ? <span className="text-[11px] text-stone-700">{fmtDate(pl.date)} {pl.time ? `· ${pl.time} IST` : "(untimed)"} · {pl.state}</span> : <span className="text-[11px] text-amber-700">unallocated</span>}</Field>
      {!pub && !pl && v.reviewStatus !== "ready" && (
        <p className="mt-2 text-[11px] text-stone-500">Distribute after this version is marked ready.</p>
      )}
      {!pub && !pl && v.reviewStatus === "ready" && !canDistribute && (
        <p className="mt-2 text-[11px] text-stone-500">Ask COC or admin to place this page on the calendar.</p>
      )}
      {pub && <Field label="Live link"><a href={externalHref(pub.url)} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline">{pub.url}</a></Field>}
      {pub && <CaptureViews pub={pub} snap={snap} target={t} />}
    </div>
  );
}

function AllocateForm({ versionId, ipCode }) {
  const { actions, today } = useWorkspace();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  useEffect(() => { setDate(today); setTime(""); }, [versionId, today]);
  const place = async () => {
    if (!date) { toast.error("Pick a date to place this page."); return; }
    try {
      const c = await actions.placeVersion(versionId, date, time || null);
      if (c === "same_day_repetition") toast.warning("Same idea already placed on another IP that date — needs authorised exception");
      else toast.success(`Placed on ${ipCode || "calendar"} — ${fmtDate(date)}`);
    } catch (e) { /* the store already showed the error */ }
  };
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3" data-testid={`matrix-allocate-${versionId}`}>
      <div className="text-[10px] uppercase tracking-wide text-amber-800 mb-1">Distribute</div>
      <p className="text-[11px] text-stone-600 mb-2">Unallocated — pick a date to place this page on {ipCode || "the calendar"}.</p>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs bg-white mb-2" data-testid={`matrix-place-date-${versionId}`} />
      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs bg-white mb-2" data-testid={`matrix-place-time-${versionId}`} />
      <Button size="sm" className="h-8 w-full text-xs bg-stone-900 hover:bg-stone-800" onClick={place} data-testid={`matrix-place-btn-${versionId}`}>
        <Icons.CalendarDays className="h-3 w-3 mr-1" /> Place on calendar
      </Button>
    </div>
  );
}

function CaptureViews({ pub, snap, target }) {
  const { actions } = useWorkspace();
  const [val, setVal] = useState(snap?.views ?? "");
  useEffect(() => { setVal(snap?.views ?? ""); }, [snap?.views, pub?.id]);
  const save = () => {
    if (val !== "" && Number.isNaN(Number(val))) { toast.error("Enter a number of views"); return; }
    actions.recordSnapshot(pub.id, val === "" ? null : Number(val), nowIso());
    toast.success(val === "" ? "Marked missing" : "Views recorded");
  };
  return (
    <div className="mt-3" data-testid={`matrix-capture-${pub.id}`}>
      <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">Measured views</div>
      {snap?.views != null ? (
        <p className="text-sm font-semibold text-stone-900 mb-1.5">{snap.views.toLocaleString()} {target ? <span className="text-[10px] text-stone-400">/ {target.toLocaleString()}</span> : null}{snap.ageHours > 0 && snap.ageHours !== 24 && <span className="text-[10px] text-amber-600 ml-1">@{snap.ageHours}h</span>}</p>
      ) : (
        <p className="text-[11px] text-stone-400 mb-1.5">not captured yet</p>
      )}
      <div className="flex items-center gap-1.5">
        <Input type="number" min="0" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Add views…" className="h-8 text-xs bg-white" data-testid={`matrix-views-${pub.id}`} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <Button size="sm" className="h-8 text-xs bg-stone-900 hover:bg-stone-800" data-testid={`matrix-views-save-${pub.id}`} onClick={save}>Save views</Button>
      </div>
    </div>
  );
}

function ConfirmLiveForm({ versionId, ideaId, dateLabel, ready, onPublished }) {
  const { actions } = useWorkspace();
  const { openIdea } = useUI();
  const [url, setUrl] = useState("");
  const submit = async () => {
    const link = url.trim();
    if (!link) { toast.error("Paste the live link to confirm publication."); return; }
    try {
      const r = await actions.confirmPublication(versionId, link, nowIso());
      if (r.dupUrl) toast.warning("URL already used — link as collaboration instead");
      else toast.success("Publication confirmed — add views on Performance");
    } catch (e) { /* the store already showed the error */ return; }
    if (onPublished) onPublished();
    openIdea(ideaId, { tab: "performance" });
  };
  return (
    <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/70 p-3" data-testid={`matrix-confirm-pub-${versionId}`}>
      <div className="text-[10px] uppercase tracking-wide text-blue-800 mb-1">Confirm publication</div>
      <p className="text-[11px] text-stone-600 mb-2">Planned for {dateLabel}. Paste the live link to mark this page as published.</p>
      {!ready && <p className="text-[11px] text-amber-700 mb-2">This version is not marked ready yet — confirming still records the live post.</p>}
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/…" className="h-8 text-xs bg-white mb-2" data-testid={`matrix-live-url-${versionId}`} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <Button size="sm" className="h-8 w-full text-xs bg-stone-900 hover:bg-stone-800" onClick={submit} data-testid={`matrix-confirm-pub-btn-${versionId}`}>
        <Icons.Upload className="h-3 w-3 mr-1" /> Confirm publication
      </Button>
    </div>
  );
}

function Field({ label, value, children }) {
  return <div className="mt-3"><div className="text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">{label}</div>{value ? <p className="text-[11px] text-stone-700">{value}</p> : children}</div>;
}

/* ---------------- NETWORK CALENDAR ---------------- */
function CalendarView() {
  const [mode, setMode] = useState("network");
  return (
    <div>
      <div className="inline-flex rounded-md border border-stone-200 bg-white p-0.5 mb-3">
        {[["network", "Network"], ["ip", "Individual IP"]].map(([v, l]) => (
          <button key={v} data-testid={`calendar-mode-${v}`} onClick={() => setMode(v)} className={cn("px-3 py-1 text-xs font-medium rounded transition-colors", mode === v ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800")}>{l}</button>
        ))}
      </div>
      {mode === "network" ? <NetworkCalendar /> : <IPWeekView />}
    </div>
  );
}

function IPWeekView() {
  const { db, today } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [ipId, setIpId] = useState(db.ips[0]?.id);
  const [weekStart, setWeekStart] = useState(today);
  const [displace, setDisplace] = useState(null);
  const ip = ipById(db, ipId);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <FSel value={ipId} onChange={setIpId} options={visibleIps(db).map((i) => [i.id, i.code])} />
        <div className="flex items-center gap-2 ml-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icons.ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-stone-500">{fmtDate(days[0])} – {fmtDate(days[6])}</span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setWeekStart(addDays(weekStart, 7))}><Icons.ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setWeekStart(today)}>This week</Button>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-stone-500"><IPBadge ip={ip} showName /> · floor {ip?.floors.posts}P · {ip?.floors.reels}R/day</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2" data-testid="ipweek-grid">
        {days.map((d) => {
          const pls = db.placements.filter((p) => {
            if (p.ipId !== ipId || p.date !== d || p.state === "cancelled") return false;
            const v = db.versions.find((x) => x.id === p.versionId);
            return matchesStream(v && ideaById(db, v.ideaId), streamFilter);
          });
          let planP = 0, planR = 0;
          pls.forEach((p) => { const v = db.versions.find((x) => x.id === p.versionId); const idea = v && ideaById(db, v.ideaId); if (idea) { const fc = formatCounts(idea.format); planP += fc.posts; planR += fc.reels; } });
          const shortfall = planP < (ip?.floors.posts || 0) || planR < (ip?.floors.reels || 0);
          return (
            <div key={d} className={cn("rounded-lg border bg-white p-2 min-h-[160px]", d === today ? "border-blue-300" : "border-[#E6E1D8]")} data-testid={`ipweek-day-${d}`}>
              <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-stone-100">
                <div><div className="text-[10px] text-stone-400">{weekdayShort(d)}</div><div className="font-mono text-[11px] text-stone-700">{fmtDate(d)}</div></div>
                <div className={cn("text-[9px] text-right", shortfall ? "text-amber-700" : "text-stone-400")}>{planP}P·{planR}R<div className="text-stone-300">/{ip?.floors.posts}·{ip?.floors.reels}</div></div>
              </div>
              <div className="space-y-1.5">
                {pls.map((p) => {
                  const v = db.versions.find((x) => x.id === p.versionId);
                  const idea = v && ideaById(db, v.ideaId);
                  if (!idea) return null;
                  const pub = publicationOf(db, v.id);
                  const dups = sameDayConflict(db, p); // same idea on other IPs same date (all-page context)
                  const isBO = idea.stream === "BO";
                  return (
                    <div key={p.id} className="rounded-md border border-stone-200 p-1.5" data-testid={`ipweek-card-${p.id}`}>
                      <div className="flex items-center gap-1 mb-0.5"><StreamBadge stream={idea.stream} /><FormatBadge format={idea.format} />{p.time && <span className="font-mono text-[9px] text-stone-500 ml-auto">{p.time}</span>}</div>
                      <button onClick={() => openIdea(idea.id)} className="text-left text-[11px] text-stone-800 leading-tight line-clamp-2 hover:underline">{idea.title}</button>
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        {pub ? <span className="text-[9px] rounded px-1 py-0.5 bg-stone-800 text-white">published</span> : v.reviewStatus === "ready" ? <span className="text-[9px] rounded px-1 py-0.5 bg-emerald-100 text-emerald-800">ready</span> : <span className="text-[9px] rounded px-1 py-0.5 bg-indigo-100 text-indigo-800">pending prod</span>}
                        {p.exceptionReason && <span className="text-[9px] rounded px-1 py-0.5 bg-amber-100 text-amber-800" title={p.exceptionReason}>exception</span>}
                        {dups.length > 0 && !p.exceptionReason && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] rounded px-1 py-0.5 bg-rose-100 text-rose-800" title="Same idea also placed on another IP this date — duplication needs an authorised exception">
                            <Icons.Copy className="h-2.5 w-2.5" /> also {dups.map((c) => ipById(db, c.ipId)?.code).join(", ")}
                          </span>
                        )}
                      </div>
                      {isBO && !pub && (
                        <button data-testid={`ipweek-displace-${p.id}`} onClick={() => setDisplace({ boVersionId: v.id, ipId, date: d })} className="mt-1 text-[9px] text-[#C0512F] hover:underline inline-flex items-center gap-0.5"><Icons.Zap className="h-2.5 w-2.5" /> displace with HPN</button>
                      )}
                    </div>
                  );
                })}
                {!pls.length && <div className="text-[10px] text-stone-300 text-center py-6">No content</div>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-stone-400">Readable per-IP week schedule with content previews, readiness and optional order/time. Duplication checks retain all-page context: a rose "also on …" flag means the same idea is on another IP that IST date and needs an authorised exception.</p>
      <ReplacementDialog open={!!displace} onClose={() => setDisplace(null)} boVersionId={displace?.boVersionId} ipId={displace?.ipId} date={displace?.date} />
    </div>
  );
}

function NetworkCalendar() {
  const { db, actions, today } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [start, setStart] = useState(today);
  const [sel, setSel] = useState(null); // {ipId, date}
  const [displace, setDisplace] = useState(null); // {boVersionId, ipId, date}
  const days = Array.from({ length: 10 }, (_, i) => addDays(start, i));

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setStart(addDays(start, -10))}><Icons.ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs text-stone-500">{fmtDate(days[0])} – {fmtDate(days[9])}</span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setStart(addDays(start, 10))}><Icons.ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setStart(today)}>Today</Button>
          <span className="ml-auto text-[10px] text-stone-400">Rolling 10-day network view · IST</span>
        </div>
        <div className="overflow-auto fsos-scroll rounded-lg border border-[#E6E1D8] bg-white max-h-[68vh]">
          <table className="text-xs border-collapse" data-testid="network-calendar">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-[#F5F2EC] border-b border-r border-stone-200 px-3 py-2 text-left min-w-[120px]">IP</th>
                {days.map((d) => <th key={d} className={cn("bg-[#F5F2EC] border-b border-stone-200 px-2 py-2 min-w-[92px]", d === today && "bg-blue-50")}><div className="text-[10px] text-stone-500">{weekdayShort(d)}</div><div className="font-mono text-[11px] text-stone-700">{fmtDate(d)}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {visibleIps(db).map((ip) => (
                <tr key={ip.id}>
                  <td className={cn("sticky left-0 z-10 border-b border-r border-stone-100 px-3 py-2 min-w-[120px]", ip.active ? "bg-white" : "bg-stone-50")}><IPBadge ip={ip} />{!ip.active && <span className="ml-1 text-[9px] text-amber-700">paused</span>}</td>
                  {days.map((d) => {
                    const pls = db.placements.filter((p) => {
                      if (p.ipId !== ip.id || p.date !== d || p.state === "cancelled") return false;
                      const v = db.versions.find((x) => x.id === p.versionId);
                      return matchesStream(v && ideaById(db, v.ideaId), streamFilter);
                    });
                    let planP = 0, planR = 0, conf = 0, ready = 0;
                    pls.forEach((p) => { const v = db.versions.find((x) => x.id === p.versionId); if (!v) return; const idea = ideaById(db, v.ideaId); const fc = formatCounts(idea.format); planP += fc.posts; planR += fc.reels; if (publicationOf(db, v.id)) conf++; else if (v.reviewStatus === "ready") ready++; });
                    const reservedR = Math.max(0, ip.floors.reels - planR);
                    const isSel = sel && sel.ipId === ip.id && sel.date === d;
                    return (
                      <td key={d} onClick={() => setSel({ ipId: ip.id, date: d })} data-testid={`cal-cell-${ip.id}-${d}`}
                        className={cn("border-b border-stone-100 p-1 align-top cursor-pointer hover:bg-blue-50/40", isSel && "ring-2 ring-blue-400 bg-blue-50/60")}>
                        <div className="flex items-center justify-between text-[9px] text-stone-400"><span>{planP}P/{planR}R</span><span className="text-stone-300">/ {ip.floors.posts}·{ip.floors.reels}</span></div>
                        <div className="space-y-0.5 mt-0.5">
                          {pls.slice(0, 3).map((p) => { const v = db.versions.find((x) => x.id === p.versionId); const idea = ideaById(db, v?.ideaId); const isPub = publicationOf(db, v?.id); const isBO = idea?.stream === "BO"; return (
                            <button key={p.id} data-testid={`cal-chip-${p.id}`}
                              onClick={(e) => { e.stopPropagation(); if (isBO && !isPub) setDisplace({ boVersionId: v.id, ipId: ip.id, date: d }); else openIdea(idea.id); }}
                              className={cn("block w-full text-left rounded px-1 py-0.5 text-[9px] truncate transition-colors hover:ring-1 hover:ring-stone-400", isPub ? "bg-stone-800 text-white" : v?.reviewStatus === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800")} title={isBO && !isPub ? `${idea?.title} — click to displace with HPN` : idea?.title}>{idea?.title}</button>
                          ); })}
                          {pls.length > 3 && <div className="text-[9px] text-stone-400">+{pls.length - 3} more</div>}
                          {reservedR > 0 && <div className="text-[9px] text-amber-600">{reservedR}R HPN reserve</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <BankDrawer sel={sel} onClose={() => setSel(null)} />}
      <ReplacementDialog open={!!displace} onClose={() => setDisplace(null)} boVersionId={displace?.boVersionId} ipId={displace?.ipId} date={displace?.date} />
    </div>
  );
}

function BankDrawer({ sel, onClose }) {
  const { db, actions } = useWorkspace();
  const { streamFilter } = useUI();
  const ip = ipById(db, sel.ipId);
  const eligible = readyBankVersions(db, streamFilter).filter((v) => v.ipId === sel.ipId && !activePlacementOf(db, v.id));
  const alsoUnready = db.versions.filter((v) => {
    if (v.ipId !== sel.ipId || v.reviewStatus === "ready" || publicationOf(db, v.id) || activePlacementOf(db, v.id)) return false;
    return matchesStream(ideaById(db, v.ideaId), streamFilter);
  }).slice(0, 4);
  return (
    <div className="w-72 shrink-0 rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] p-3 max-h-[68vh] overflow-auto fsos-scroll" data-testid="bank-drawer">
      <div className="flex items-center justify-between mb-2"><div className="text-xs font-medium text-stone-700 flex items-center gap-1.5"><IPBadge ip={ip} /> {fmtDate(sel.date)}</div><button onClick={onClose} className="text-stone-400 hover:text-stone-700"><Icons.X className="h-4 w-4" /></button></div>
      <p className="text-[10px] text-stone-400 mb-2">Eligible ready versions for this IP. Click to place. Calendar can also hold versions still in production, shown pending.</p>
      {eligible.map((v) => { const idea = ideaById(db, v.ideaId); return (
        <button key={v.id} data-testid={`drawer-place-${v.id}`} onClick={async () => { try { const c = await actions.placeVersion(v.id, sel.date); if (c === "same_day_repetition") toast.warning("Repetition conflict — needs authorised exception"); else toast.success("Placed"); } catch (e) { /* the store already showed the error */ } }} className="w-full text-left rounded-md border border-stone-200 bg-white p-2 mb-1.5 hover:border-blue-400 transition-colors">
          <div className="flex items-center gap-1.5 mb-0.5"><FormatBadge format={idea.format} /><span className="text-[10px] text-emerald-700">ready</span></div>
          <div className="text-[11px] text-stone-800 truncate">{idea.title}</div>
        </button>
      ); })}
      {!eligible.length && <p className="text-[11px] text-stone-400">No unallocated ready stock for this IP.</p>}
      {alsoUnready.length > 0 && <><div className="mt-2 text-[10px] uppercase tracking-wide text-stone-400">In production (pending)</div>{alsoUnready.map((v) => { const idea = ideaById(db, v.ideaId); return <div key={v.id} className="rounded-md border border-dashed border-stone-200 p-2 mt-1 text-[11px] text-stone-500 truncate">{idea.title}</div>; })}</>}
    </div>
  );
}

/* ---------------- TODAY ---------------- */
function Today() {
  const { db, actions, today } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const rows = visibleIps(db, { withPublications: false }).map((ip) => {
    const pls = db.placements.filter((p) => {
      if (p.ipId !== ip.id || p.date !== today || p.state === "cancelled") return false;
      const v = db.versions.find((x) => x.id === p.versionId);
      return matchesStream(v && ideaById(db, v.ideaId), streamFilter);
    });
    let planP = 0, planR = 0, readyP = 0, readyR = 0, confP = 0, confR = 0;
    pls.forEach((p) => { const v = db.versions.find((x) => x.id === p.versionId); if (!v) return; const idea = ideaById(db, v.ideaId); const fc = formatCounts(idea.format); planP += fc.posts; planR += fc.reels; if (publicationOf(db, v.id)) { confP += fc.posts; confR += fc.reels; } else if (v.reviewStatus === "ready") { readyP += fc.posts; readyR += fc.reels; } });
    return { ip, pls, planP, planR, readyP, readyR, confP, confR };
  });
  const execItems = db.placements.filter((p) => p.date === today && p.state !== "cancelled").map((p) => ({ p, v: db.versions.find((x) => x.id === p.versionId) })).filter((x) => x.v && matchesStream(ideaById(db, x.v.ideaId), streamFilter));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Required vs planned vs ready vs published — {fmtDate(today)}</h3>
        <table className="w-full text-xs" data-testid="today-table">
          <thead><tr className="text-stone-400 border-b border-stone-200"><th className="text-left py-1.5">IP</th><th className="text-center">Req</th><th className="text-center">Planned</th><th className="text-center">Ready</th><th className="text-center">Published</th></tr></thead>
          <tbody>{rows.map((r) => { const shortP = r.confP < r.ip.floors.posts, shortR = r.confR < r.ip.floors.reels; return (
            <tr key={r.ip.id} className="border-b border-stone-100"><td className="py-1.5"><IPBadge ip={r.ip} /></td><td className="text-center text-stone-500">{r.ip.floors.posts}P·{r.ip.floors.reels}R</td><td className="text-center">{r.planP}P·{r.planR}R</td><td className="text-center text-emerald-700">{r.readyP}P·{r.readyR}R</td><td className="text-center"><span className={cn(shortP && "text-amber-700")}>{r.confP}P</span>·<span className={cn(shortR && "text-amber-700")}>{r.confR}R</span></td></tr>
          ); })}</tbody>
        </table>
        <p className="mt-2 text-[10px] text-stone-400">Per-format floor flags: surplus reels don't cover missing Posts. During the day we show remaining, not a failed label.</p>
      </div>
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Execution list</h3>
        <div className="space-y-2 max-h-[60vh] overflow-auto fsos-scroll">
          {execItems.map(({ p, v }) => { const idea = ideaById(db, v.ideaId); const pub = publicationOf(db, v.id); const conflicts = sameDayConflict(db, p); return (
            <div key={p.id} className="rounded-md border border-stone-200 p-2.5" data-testid={`today-item-${v.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <IPBadge ip={ipById(db, v.ipId)} /><FormatBadge format={idea.format} />
                <button onClick={() => openIdea(idea.id)} className="flex-1 text-left text-xs text-stone-800 hover:underline truncate">{idea.title}</button>
                {p.exceptionReason && <span className="text-[9px] rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300" title={p.exceptionReason}>exception</span>}
                {pub ? <a href={externalHref(pub.url)} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline inline-flex items-center gap-1"><Icons.ExternalLink className="h-3 w-3" />live</a> : v.reviewStatus === "ready" ? <RecordLive versionId={v.id} /> : <span className="text-[10px] text-amber-700">pending prod</span>}
              </div>
              {conflicts.length > 0 && (
                <ConflictRow placement={p} conflicts={conflicts} today={today} />
              )}
              {!pub && v.reviewStatus === "ready" && <CollabLink versionId={v.id} date={today} />}
            </div>
          ); })}
          {!execItems.length && <Empty text="Nothing scheduled for today." />}
        </div>
      </div>
    </div>
  );
}

function ConflictRow({ placement, conflicts, today }) {
  const { db, actions, actingUser } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Deliberate collaboration / major happening");
  const canAuthorise = (db.settings.exceptionApproverIds || []).includes(actingUser.id) || isAdmin(actingUser) || actingUser.roles.includes("Short-form Lead");
  const otherIps = conflicts.map((c) => ipById(db, c.ipId)).filter(Boolean);
  return (
    <div className="mt-1.5 rounded-md border border-rose-200 bg-rose-50/60 p-2" data-testid={`conflict-${placement.id}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-rose-800">
        <Icons.AlertTriangle className="h-3.5 w-3.5" />
        Same idea also placed today on {otherIps.map((ip) => ip.code).join(", ")} — needs an authorised exception.
      </div>
      {canAuthorise ? (
        !open ? (
          <button data-testid={`authorise-exception-${placement.id}`} onClick={() => setOpen(true)} className="mt-1 text-[11px] font-medium text-rose-700 hover:underline">Authorise exception →</button>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 text-xs" placeholder="Reason (recorded)" />
            <Button size="sm" className="h-7 text-xs bg-rose-700 hover:bg-rose-800" onClick={() => { actions.authorizeException(placement.id, reason); toast.success("Exception authorised — actor & reason recorded"); setOpen(false); }}>Record</Button>
          </div>
        )
      ) : <div className="mt-1 text-[10px] text-stone-400">Only authorised editorial users can approve exceptions; COC applies ordinary scheduling changes.</div>}
    </div>
  );
}

function CollabLink({ versionId, date }) {
  const { db, actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const todaysPubs = db.publications.filter((p) => p.publishedAt.slice(0, 10) === date);
  if (!todaysPubs.length) return null;
  return (
    <div className="mt-1.5">
      {!open ? (
        <button data-testid={`collab-link-${versionId}`} onClick={() => setOpen(true)} className="text-[11px] text-purple-700 hover:underline inline-flex items-center gap-1"><Icons.Link className="h-3 w-3" /> Link as collaboration (one publication, counted once)</button>
      ) : (
        <div className="flex items-center gap-1.5">
          <Select onValueChange={(pubId) => { actions.linkCollaboration(pubId, versionId); toast.success("Linked as collaboration — satisfies this page's slot, counted once in network totals"); setOpen(false); }}>
            <SelectTrigger className="h-7 text-xs w-64" data-testid={`collab-select-${versionId}`}><SelectValue placeholder="Choose today's publication to link" /></SelectTrigger>
            <SelectContent>
              {todaysPubs.map((p) => { const v = db.versions.find((x) => x.id === p.versionIds[0]); const idea = v && ideaById(db, v.ideaId); return <SelectItem key={p.id} value={p.id}>{p.ipIds.map((id) => ipById(db, id)?.code).join("+")} · {idea?.title.slice(0, 30)}</SelectItem>; })}
            </SelectContent>
          </Select>
          <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700"><Icons.X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

function RecordLive({ versionId }) {
  const { actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  if (!open) return <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`record-live-${versionId}`} onClick={() => setOpen(true)}><Icons.Upload className="h-3 w-3 mr-1" /> Record live</Button>;
  return (
    <div className="flex items-center gap-1.5">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="live URL" className="h-7 w-40 text-xs" />
      <Button size="sm" className="h-7 text-xs" onClick={async () => { try { if (!url) { await actions.reportLivePending(versionId); toast("Reported live — link pending (not counted as confirmed)"); } else { const r = await actions.confirmPublication(versionId, url, nowIso()); if (r.dupUrl) toast.warning("URL already used — link as collaboration instead"); else toast.success("Publication confirmed"); } setOpen(false); } catch (e) { /* the store already showed the error */ } }}>Save</Button>
    </div>
  );
}

/* ---- small ---- */
function Stat({ label, value, note }) { return <div className="rounded-lg border border-[#E6E1D8] bg-white p-3"><div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div><div className="font-serif text-2xl text-stone-900">{value}</div>{note && <div className="text-[10px] text-stone-400">{note}</div>}</div>; }
function FSel({ value, onChange, options }) { return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-8 w-auto min-w-[110px] bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>; }
function Legend({ color, label }) { return <span className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-[3px]", color)} />{label}</span>; }
function Empty({ text }) { return <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-400">{text}</div>; }
