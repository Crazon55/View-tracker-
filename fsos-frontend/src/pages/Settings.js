import React, { useState } from "react";
import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../domain/store";
import { PageHeader } from "../components/common/PageHeader";
import { IPBadge, Avatar } from "../components/common/badges";
import { ROLES, STREAMS } from "../domain/constants";
import { TRACKER_GROUPS } from "../domain/toolSelectors";
import { ipMeta } from "../domain/sixDay";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { CategorySettings, BatchSettings } from "../components/settings/Taxonomy";

const TABS = [["ips", "IPs"], ["people", "People & roles"], ["cats", "Categories"], ["batches", "Batches"], ["rules", "Approvals & rules"]];

export default function Settings() {
  const [tab, setTab] = useState("ips");
  return (
    <div className="p-6">
      <PageHeader title="Settings" icon={Icons.Settings} subtitle="Configure IPs, people, categories, approvals and rules — the core workflow stays stable; entities are configurable without code.">
        <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
          {TABS.map(([v, l]) => <button key={v} data-testid={`settings-tab-${v}`} onClick={() => setTab(v)} className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", tab === v ? "bg-white shadow-sm text-stone-900" : "text-stone-500 hover:text-stone-800")}>{l}</button>)}
        </div>
      </PageHeader>
      {tab === "ips" && <IPSettings />}
      {tab === "people" && <PeopleSettings />}
      {tab === "cats" && <CategorySettings />}
      {tab === "batches" && <BatchSettings />}
      {tab === "rules" && <RulesSettings />}
    </div>
  );
}

function IPSettings() {
  const { db, actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", hex: "#2563EB", posts: 0, reels: 0 });
  return (
    <div>
      <div className="flex justify-end mb-3"><Button size="sm" data-testid="add-ip-btn" onClick={() => { setForm({ name: "", code: "", hex: "#2563EB", posts: 0, reels: 0 }); setOpen(true); }} className="bg-stone-900"><Icons.Plus className="h-4 w-4 mr-1" /> Add IP</Button></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {db.ips.map((ip) => (
          <div key={ip.id} className={cn("rounded-lg border bg-white p-4", ip.active ? "border-[#E6E1D8]" : "border-amber-300 bg-amber-50/30")} data-testid={`ip-setting-${ip.id}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><span className="h-6 w-6 rounded-md" style={{ background: ip.hex }} /><div><div className="text-sm font-medium text-stone-900">{ip.name}</div><div className="font-mono text-[10px] text-stone-500">{ip.code}</div></div></div>
              <label className="flex items-center gap-2 text-xs text-stone-500">{ip.active ? "Active" : "Paused"}<Switch checked={ip.active} onCheckedChange={(c) => { actions.updateIP(ip.id, { active: c }); toast(c ? "IP active" : "IP paused — placements preserved & flagged"); }} data-testid={`ip-active-${ip.id}`} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <NumField label="Posts floor / day" value={ip.floors.posts} onChange={(v) => actions.updateIP(ip.id, { floors: { ...ip.floors, posts: v } })} />
              <NumField label="Reels floor / day" value={ip.floors.reels} onChange={(v) => actions.updateIP(ip.id, { floors: { ...ip.floors, reels: v } })} />
              <NumField label="BO Posts quota" value={ip.boTarget?.posts ?? ""} placeholder="unset" onChange={(v) => actions.updateIP(ip.id, { boTarget: { ...(ip.boTarget || {}), posts: v } })} />
              <NumField label="BO Reels quota" value={ip.boTarget?.reels ?? ""} placeholder="unset" onChange={(v) => actions.updateIP(ip.id, { boTarget: { ...(ip.boTarget || {}), reels: v } })} />
              <NumField label="Reel view target" value={ip.perfTarget?.reel ?? ""} onChange={(v) => actions.updateIP(ip.id, { perfTarget: { ...ip.perfTarget, reel: v } })} />
              <NumField label="Post view target" value={ip.perfTarget?.post ?? ""} onChange={(v) => actions.updateIP(ip.id, { perfTarget: { ...ip.perfTarget, post: v } })} />
            </div>
            <TrackerFields ip={ip} onChange={(patch) => actions.updateIP(ip.id, patch)} />
            {ip.perfTarget?.note && <p className="mt-2 text-[10px] text-stone-400">{ip.perfTarget.note}</p>}
            {ip.menu?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{ip.menu.slice(0, 6).map((m, i) => <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] text-stone-500">{m}</span>)}</div>}
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="add-ip-dialog">
          <DialogHeader><DialogTitle className="font-serif text-lg">Add IP</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-stone-600">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="ip-name" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-stone-600">Short code</label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="ip-code" className="mt-1" /></div>
              <div><label className="text-xs text-stone-600">Colour</label><Input type="color" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} className="mt-1 h-9 p-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-stone-600">Posts floor</label><Input type="number" value={form.posts} onChange={(e) => setForm({ ...form, posts: Number(e.target.value) })} className="mt-1" /></div>
              <div><label className="text-xs text-stone-600">Reels floor</label><Input type="number" value={form.reels} onChange={(e) => setForm({ ...form, reels: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <p className="text-[10px] text-stone-400">New IPs appear everywhere immediately — destinations, matrix columns, calendar rows, filters — with no fabricated history.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button data-testid="ip-save" onClick={() => { if (!form.name || !form.code) { toast.error("Name and code required"); return; } actions.addIP({ name: form.name, code: form.code, hex: form.hex, floors: { posts: form.posts, reels: form.reels } }); toast.success("IP added across the system"); setOpen(false); }} className="bg-stone-900">Add IP</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PeopleSettings() {
  const { db, actions } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", roles: [], streams: [], skills: "" });
  const toggleRole = (r) => setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  const toggleStream = (s) => setForm((f) => ({ ...f, streams: f.streams.includes(s) ? f.streams.filter((x) => x !== s) : [...f.streams, s] }));
  return (
    <div>
      <div className="flex items-center justify-between mb-3"><p className="text-[11px] text-stone-500">Page access (who sees what, view vs edit) lives in <Link to="/users-roles" className="underline hover:text-stone-900">Users &amp; Roles</Link>.</p><Button size="sm" data-testid="add-user-btn" onClick={() => { setForm({ name: "", roles: [], streams: [], skills: "" }); setOpen(true); }} className="bg-stone-900"><Icons.UserPlus className="h-4 w-4 mr-1" /> Add teammate</Button></div>
      <div className="rounded-lg border border-[#E6E1D8] bg-white overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="text-stone-400 border-b border-stone-200"><th className="text-left py-2 pl-3">Person</th><th className="text-left">Roles</th><th className="text-left">Streams</th><th className="text-left">Skills</th><th className="text-center">Active</th></tr></thead>
          <tbody>{db.users.map((u) => (
            <tr key={u.id} className={cn("border-b border-stone-100", !u.active && "opacity-60")} data-testid={`user-setting-${u.id}`}>
              <td className="py-2 pl-3"><div className="flex items-center gap-2"><Avatar user={u} size={24} /> {u.name}</div></td>
              <td>{u.roles.join(", ")}</td><td>{u.streams.join(", ")}</td><td className="text-stone-500">{(u.skills || []).join(", ")}</td>
              <td className="text-center"><Switch checked={u.active} onCheckedChange={(c) => { actions.updateUser(u.id, { active: c }); toast(c ? "Reactivated" : "Deactivated — history preserved, unfinished work surfaced for reassignment"); }} data-testid={`user-active-${u.id}`} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="add-user-dialog">
          <DialogHeader><DialogTitle className="font-serif text-lg">Add teammate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-stone-600">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name" className="mt-1" /></div>
            <div><label className="text-xs text-stone-600">Roles</label><div className="mt-1 flex flex-wrap gap-1.5">{ROLES.map((r) => <button key={r} type="button" onClick={() => toggleRole(r)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", form.roles.includes(r) ? "border-stone-800 bg-stone-100" : "border-stone-200")}>{r}</button>)}</div></div>
            <div><label className="text-xs text-stone-600">Streams</label><div className="mt-1 flex gap-1.5">{Object.values(STREAMS).map((s) => <button key={s} type="button" onClick={() => toggleStream(s)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", form.streams.includes(s) ? "border-stone-800 bg-stone-100" : "border-stone-200")}>{s}</button>)}</div></div>
            <div><label className="text-xs text-stone-600">Skills (comma-separated)</label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button data-testid="user-save" onClick={() => { if (!form.name) { toast.error("Name required"); return; } actions.addUser({ name: form.name, roles: form.roles, streams: form.streams, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean) }); toast.success("Teammate added — assignable immediately"); setOpen(false); }} className="bg-stone-900">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RulesSettings() {
  const { db, actions } = useWorkspace();
  const s = db.settings;
  const approvers = db.users.filter((u) => u.roles.some((r) => ["Founder/Admin", "COA", "Short-form Lead", "CS"].includes(r)));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Approval owners</h3>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-600">Current BO approver</label>
            <Select value={s.approverBoId || undefined} onValueChange={(v) => { actions.updateSettings({ approverBoId: v }); toast.success("BO approver updated — workflow keeps working"); }}><SelectTrigger className="mt-1" data-testid="bo-approver"><SelectValue /></SelectTrigger><SelectContent>{approvers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
            <p className="mt-1 text-[10px] text-stone-400">Delegating to the Short-form Lead replaces Jaskaran as approver without breaking the flow.</p>
          </div>
          <div><label className="text-xs text-stone-600">Short-form Lead</label>
            <Select value={s.shortFormLeadId || undefined} onValueChange={(v) => actions.updateSettings({ shortFormLeadId: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{approvers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Performance classification <span className="text-[10px] font-normal text-amber-700">(demo assumption)</span></h3>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Good ≥ % of target" value={s.thresholds.good} onChange={(v) => actions.updateSettings({ thresholds: { ...s.thresholds, good: v } })} />
          <NumField label="Average ≥ % of target" value={s.thresholds.average} onChange={(v) => actions.updateSettings({ thresholds: { ...s.thresholds, average: v } })} />
          <NumField label="Baseline sample size" value={s.baselineSample} onChange={(v) => actions.updateSettings({ baselineSample: v })} />
          <div><label className="text-[10px] uppercase tracking-wide text-stone-400">6-day cycle anchor</label><Input type="date" value={s.cycleAnchor || ""} onChange={(e) => actions.updateSettings({ cycleAnchor: e.target.value })} className="h-8 mt-1 text-xs" data-testid="cycle-anchor" /></div>
        </div>
        <p className="mt-2 text-[10px] text-stone-400">Illustrative thresholds, not agreed Frontseat policy. Without a configured target, items show Unrated.</p>
      </div>
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold text-stone-900 mb-2">Optional calendar spacing</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-600">Minimum gap (minutes) between same-IP posts</span>
          <Input type="number" placeholder="unset" value={s.spacingMinutes ?? ""} onChange={(e) => actions.updateSettings({ spacingMinutes: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-28 text-xs" data-testid="spacing-minutes" />
        </div>
        <p className="mt-1 text-[10px] text-stone-400">Initially unset. We show same-time clustering and a spacing review prompt, but never invent a 30/60-minute rule.</p>
      </div>
    </div>
  );
}

// Handle / 6-Day tracker group / Growth stage — used by the 6-Day Tracker and Growth.
function TrackerFields({ ip, onChange }) {
  const meta = ipMeta(ip);
  return (
    <div className="mt-3 grid grid-cols-3 gap-3 border-t border-stone-100 pt-3 text-xs">
      <div><label className="text-[10px] uppercase tracking-wide text-stone-400 block">Instagram handle</label>
        <Input defaultValue={meta.handle} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== meta.handle && onChange({ handle: e.target.value.trim().replace(/^@/, "") })} className="h-8 mt-1 text-xs" data-testid={`ip-handle-${ip.id}`} /></div>
      <div><label className="text-[10px] uppercase tracking-wide text-stone-400 block">Tracker group</label>
        <Select value={meta.group} onValueChange={(v) => onChange({ group: v })}>
          <SelectTrigger className="h-8 mt-1 text-xs" data-testid={`ip-group-${ip.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No group</SelectItem>
            {TRACKER_GROUPS.filter((g) => g.key !== "inactive").map((g) => <SelectItem key={g.key} value={g.key}>{g.emoji} {g.label}</SelectItem>)}
          </SelectContent>
        </Select></div>
      <div><label className="text-[10px] uppercase tracking-wide text-stone-400 block">Growth stage</label>
        <Select value={String(meta.stage)} onValueChange={(v) => onChange({ stage: Number(v) })}>
          <SelectTrigger className="h-8 mt-1 text-xs" data-testid={`ip-stage-${ip.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>{[3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>Stage {n}{n === 3 ? " — main IP" : ""}</SelectItem>)}</SelectContent>
        </Select></div>
    </div>
  );
}

function NumField({ label, value, onChange, placeholder }) {
  return <div><label className="text-[10px] uppercase tracking-wide text-stone-400 block">{label}</label><Input type="number" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="h-8 mt-1 text-xs" /></div>;
}
