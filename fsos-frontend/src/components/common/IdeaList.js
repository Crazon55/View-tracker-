import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../../domain/store";
import { useUI } from "../idea/IdeaModalProvider";
import { versionsOf, ideaById, ipById, userById, ideaDerivedState, ideaProgress , visibleIps } from "../../domain/selectors";
import { IDEA_STATES, FORMATS } from "../../domain/constants";
import { StreamBadge, StatusBadge, FormatBadge, IPBadge, Avatar } from "./badges";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export default function IdeaList({ stream }) {
  const { db } = useWorkspace();
  const { openIdea, streamFilter } = useUI();
  const [format, setFormat] = useState("all");
  const [ipf, setIpf] = useState("all");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [q, setQ] = useState("");

  const ideas = useMemo(() => {
    return db.ideas.filter((i) => {
      if (stream && i.stream !== stream) return false;
      if (!stream && streamFilter !== "All" && i.stream !== streamFilter) return false;
      if (ideaProgress(db, i).published === ideaProgress(db, i).total && ideaProgress(db, i).total > 0 && stream) {
        // keep published in stream lists too, but they naturally show
      }
      if (format !== "all" && i.format !== format) return false;
      if (ipf !== "all" && !i.destinations.includes(ipf)) return false;
      if (owner !== "all" && i.productionOwnerId !== owner) return false;
      if (status !== "all" && ideaDerivedState(db, i) !== status) return false;
      if (q && !i.title.toLowerCase().includes(q.toLowerCase()) && !i.code.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [db, stream, streamFilter, format, ipf, status, owner, q]);

  const activeFilters = [format !== "all" && ["Format", format, () => setFormat("all")], ipf !== "all" && ["IP", ipById(db, ipf)?.code, () => setIpf("all")], status !== "all" && ["Status", IDEA_STATES[status]?.label, () => setStatus("all")], owner !== "all" && ["Owner", userById(db, owner)?.name, () => setOwner("all")]].filter(Boolean);

  return (
    <div>
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Icons.Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter ideas…" className="pl-8 h-9 w-56 bg-white" data-testid="idealist-search" />
        </div>
        <FilterSelect value={format} onChange={setFormat} placeholder="Format" testid="filter-format" options={[["all", "All formats"], ...FORMATS.map((f) => [f, f])]} />
        <FilterSelect value={ipf} onChange={setIpf} placeholder="IP" testid="filter-ip" options={[["all", "All IPs"], ...visibleIps(db).map((i) => [i.id, i.code])]} />
        <FilterSelect value={status} onChange={setStatus} placeholder="Status" testid="filter-status" options={[["all", "All statuses"], ...Object.entries(IDEA_STATES).map(([k, v]) => [k, v.label])]} />
        <FilterSelect value={owner} onChange={setOwner} placeholder="Owner" testid="filter-owner" options={[["all", "All owners"], ...db.users.filter((u) => u.roles.some((r) => ["Designer", "Editor"].includes(r))).map((u) => [u.id, u.name])]} />
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 ml-1">
            {activeFilters.map(([k, v, clear], idx) => (
              <button key={idx} onClick={clear} className="inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200">
                {k}: {v} <Icons.X className="h-3 w-3" />
              </button>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-stone-500" onClick={() => { setFormat("all"); setIpf("all"); setStatus("all"); setOwner("all"); }}>Clear all</Button>
          </div>
        )}
        <span className="ml-auto text-xs text-stone-400">{ideas.length} ideas</span>
      </div>

      {/* list */}
      <div className="space-y-2">
        {ideas.map((idea) => {
          const state = ideaDerivedState(db, idea);
          const prog = ideaProgress(db, idea);
          const owner = userById(db, idea.productionOwnerId);
          return (
            <button key={idea.id} data-testid={`idea-row-${idea.id}`} onClick={() => openIdea(idea.id)}
              className="w-full text-left rounded-lg border border-[#E6E1D8] bg-white p-3.5 hover:border-stone-400 hover:shadow-sm transition-all">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-stone-400">{idea.code}</span>
                    <StreamBadge stream={idea.stream} />
                    <FormatBadge format={idea.format} />
                    <StatusBadge state={state} />
                    {idea.bypassUsed && idea.stream === "BO" && <span className="text-[10px] text-orange-700 inline-flex items-center gap-0.5"><Icons.Zap className="h-3 w-3" />bypass</span>}
                  </div>
                  <div className="font-medium text-stone-900 truncate">{idea.title}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {idea.destinations.slice(0, 6).map((ipId) => <IPBadge key={ipId} ip={ipById(db, ipId)} />)}
                  </div>
                </div>
                <div className="text-right shrink-0 w-40">
                  <div className="flex items-center justify-end gap-2 mb-1.5">
                    {owner ? <><Avatar user={owner} size={22} /><span className="text-xs text-stone-600">{owner.name.split(" ")[0]}</span></> : <span className="text-[11px] text-stone-400">Unassigned</span>}
                  </div>
                  <ProgressBar prog={prog} />
                  <div className="text-[10px] text-stone-400 mt-1">{prog.ready}/{prog.total} ready · {prog.published} live</div>
                </div>
              </div>
            </button>
          );
        })}
        {!ideas.length && <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-400">No ideas match these filters.</div>}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options, testid }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[120px] bg-white text-xs" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ProgressBar({ prog }) {
  const seg = (n, cls) => n > 0 && <div className={cls} style={{ width: `${(n / Math.max(prog.total, 1)) * 100}%` }} />;
  return (
    <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden flex">
      {seg(prog.published, "bg-stone-800")}
      {seg(prog.ready, "bg-emerald-500")}
      {seg(prog.awaiting_review, "bg-purple-400")}
      {seg(prog.changes_requested, "bg-rose-400")}
      {seg(prog.in_production, "bg-indigo-400")}
      {seg(prog.not_started, "bg-stone-300")}
    </div>
  );
}
