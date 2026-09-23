import React, { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace, useAccess } from "../domain/store";
import { PageHeader } from "../components/common/PageHeader";
import { Avatar } from "../components/common/badges";
import { AccessMatrix } from "../components/access/AccessMatrix";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ROLES, STREAMS } from "../domain/constants";
import { AREA_KEYS, LOCKED_ROLE, ROLE_ACCESS_DEFAULTS, resolvePersonAccess, resolveRoleAccess, countLevels } from "../domain/access";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { toast } from "sonner";

const TABS = [["people", "People"], ["roles", "Role defaults"]];

export default function UsersRoles() {
  const { db } = useWorkspace();
  const { canEdit, canPreview, preview, setPreview } = useAccess();
  const editable = canEdit("users_roles");
  const [tab, setTab] = useState("people");
  const pending = db.users.filter((u) => u.active && !u.roles.length).length;

  return (
    <div className="p-6" data-testid="users-roles-page">
      <PageHeader title="Users & Roles" icon={Icons.ShieldCheck} subtitle="Who can open which area, and whether they can change things there. Role defaults apply to everyone with that role; per-person access overrides them.">
        {canPreview && (
          <Select
            value={preview?.kind === "role" ? preview.role : "__none"}
            onValueChange={(v) => {
              setPreview(v === "__none" ? null : { kind: "role", role: v });
              if (v !== "__none") toast(`Previewing as ${v}`, { description: "Nav and page access now follow that role's defaults." });
            }}>
            <SelectTrigger className="h-9 w-52 bg-white" data-testid="preview-role-select"><Icons.Eye className="mr-1 h-3.5 w-3.5 text-stone-500" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Preview as role…</SelectItem>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-0.5">
          {TABS.map(([v, l]) => (
            <button key={v} data-testid={`ur-tab-${v}`} onClick={() => setTab(v)}
              className={cn("rounded px-3 py-1.5 text-xs font-medium transition-colors", tab === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>{l}</button>
          ))}
        </div>
      </PageHeader>
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-testid="pending-banner">
          <Icons.UserRoundCheck className="h-4 w-4" /> {pending} teammate{pending === 1 ? " is" : "s are"} waiting for access — assign a role below.
        </div>
      )}
      {!editable && <p className="mb-3 text-[11px] text-stone-500"><Icons.Eye className="mr-1 inline h-3 w-3" />View only — you can see access but not change it.</p>}
      {tab === "people" ? <PeopleAccess editable={editable} /> : <RoleDefaults editable={editable} />}
    </div>
  );
}

// Only the areas where the person differs from their roles' defaults are stored.
function diffFrom(base, matrix) {
  const d = {};
  AREA_KEYS.forEach((k) => { if (matrix[k] !== base[k]) d[k] = matrix[k]; });
  return Object.keys(d).length ? d : null;
}

function PeopleAccess({ editable }) {
  const { db, actions, actingUser } = useWorkspace();
  const { canPreview, setPreview } = useAccess();
  const [roleDraft, setRoleDraft] = useState({});
  const [matrixDraft, setMatrixDraft] = useState({});
  const [open, setOpen] = useState(null); // `${id}:roles` | `${id}:access`
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [q, setQ] = useState("");

  // Who can actually be deleted rather than just have their access cleared. Working it
  // out means checking thirteen tables for any reference to each person — too much to
  // put on every workspace load, so this page (admin-only, rarely opened) asks for it.
  const [deletable, setDeletable] = useState(null);
  useEffect(() => {
    let live = true;
    api.get("/api/people")
      .then((r) => { if (live) setDeletable(new Set(r.people.filter((x) => x.canDelete).map((x) => x.id))); })
      .catch(() => { if (live) setDeletable(new Set()); })   // no flags is the safe default
    return () => { live = false; };
  }, [db.users]);

  const people = useMemo(() => {
    const list = db.users
      .filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.roles.join(" ").toLowerCase().includes(q.toLowerCase()))
      .map((u) => ({ ...u, canDelete: !!deletable?.has(u.id) }));
    // pending people first, then active, then deactivated
    return [...list].sort((a, b) => (a.roles.length ? 1 : 0) - (b.roles.length ? 1 : 0) || (a.active ? 0 : 1) - (b.active ? 0 : 1));
  }, [db.users, q, deletable]);

  const rolesFor = (u) => roleDraft[u.id] ?? u.roles;
  const baseFor = (u) => resolvePersonAccess(rolesFor(u), null, db.access.roles);
  const matrixFor = (u) => matrixDraft[u.id] ?? resolvePersonAccess(rolesFor(u), roleDraft[u.id] ? null : db.access.people[u.id], db.access.roles);
  const dirty = (u) => roleDraft[u.id] !== undefined || matrixDraft[u.id] !== undefined;
  const clear = (id) => {
    setRoleDraft((p) => { const n = { ...p }; delete n[id]; return n; });
    setMatrixDraft((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const toggleRole = (u, r) => {
    const cur = rolesFor(u);
    const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r];
    setRoleDraft((p) => ({ ...p, [u.id]: next }));
    // Rebuild the matrix from the new roles' defaults (highest wins per area).
    setMatrixDraft((p) => ({ ...p, [u.id]: resolvePersonAccess(next, null, db.access.roles) }));
  };
  const setLevel = (u, area, level) => setMatrixDraft((p) => ({ ...p, [u.id]: { ...matrixFor(u), [area]: level } }));

  const save = (u) => {
    const roles = rolesFor(u);
    if (!roles.length) { toast.error("Select at least one role — or remove access instead"); return; }
    const matrix = matrixFor(u);
    if (u.id === actingUser.id && !roles.includes(LOCKED_ROLE) && matrix.users_roles !== "edit") {
      toast.error("That would lock you out of Users & Roles", { description: "Keep Edit on Users & Roles for yourself, or ask another admin." });
      return;
    }
    actions.setPersonAccess(u.id, { roles, matrix: roles.includes(LOCKED_ROLE) ? null : diffFrom(resolvePersonAccess(roles, null, db.access.roles), matrix) });
    clear(u.id);
    setOpen(null);
    toast.success(`Saved ${u.name}`);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-72">
          <Icons.Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or roles…" className="h-9 bg-white pl-8" />
        </div>
        <div className="flex-1" />
        {editable && <Button size="sm" onClick={() => setAddOpen(true)} className="bg-stone-900" data-testid="ur-add-member"><Icons.UserPlus className="mr-1 h-4 w-4" /> Add member</Button>}
      </div>
      <div className="space-y-2">
        {people.map((u) => {
          const roles = rolesFor(u);
          const matrix = matrixFor(u);
          const { edit, view } = countLevels(matrix);
          const locked = roles.includes(LOCKED_ROLE);
          const custom = !!db.access.people[u.id] && !roleDraft[u.id];
          const pending = !u.roles.length;
          return (
            <div key={u.id} className={cn("rounded-lg border bg-white px-4 py-3", pending ? "border-amber-300" : "border-[#E6E1D8]", !u.active && "opacity-60")} data-testid={`ur-person-${u.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-[200px] items-center gap-3">
                  <Avatar user={u} size={32} />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                      {u.name}
                      {u.id === actingUser.id && <span className="text-[10px] font-normal text-stone-400">(you)</span>}
                      {!u.active && <span className="rounded bg-stone-100 px-1.5 text-[10px] font-normal text-stone-500">deactivated</span>}
                    </div>
                    <div className="text-[11px] text-stone-500">{edit} edit · {view} view{custom && <span className="ml-1.5 text-amber-700">· custom access</span>}{(u.streams || []).length > 0 && ` · ${u.streams.join(" + ")}`}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="flex max-w-[340px] flex-wrap justify-end gap-1">
                    {roles.length ? roles.map((r) => <span key={r} className="rounded-full border border-stone-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-700">{r}</span>)
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Pending access</span>}
                  </div>
                  {editable && (<>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(open === `${u.id}:roles` ? null : `${u.id}:roles`)} data-testid={`ur-edit-roles-${u.id}`}>
                      Edit roles <Icons.ChevronDown className={cn("ml-1 h-3 w-3 transition-transform", open === `${u.id}:roles` && "rotate-180")} />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(open === `${u.id}:access` ? null : `${u.id}:access`)} data-testid={`ur-edit-access-${u.id}`}>
                      Edit access <Icons.ChevronDown className={cn("ml-1 h-3 w-3 transition-transform", open === `${u.id}:access` && "rotate-180")} />
                    </Button>
                    <Button size="sm" className="h-8 bg-stone-900 text-xs" disabled={!dirty(u)} onClick={() => save(u)} data-testid={`ur-save-${u.id}`}>Save</Button>
                    {canPreview && u.roles.length > 0 && u.id !== actingUser.id && (
                      <button
                        title={`See FSOS as ${u.name} sees it`}
                        onClick={() => { setPreview({ kind: "person", id: u.id }); toast(`Previewing as ${u.name}`, { description: "Their roles and any personal overrides, exactly as they'd see it." }); }}
                        className="grid h-8 w-8 place-items-center rounded-md border border-stone-200 text-stone-400 hover:text-stone-900"
                        data-testid={`ur-preview-${u.id}`}><Icons.Eye className="h-3.5 w-3.5" /></button>
                    )}
                    <button title={u.canDelete ? "Remove from the team" : "Remove role & access"} onClick={() => setRemoving(u)} disabled={u.id === actingUser.id}
                      className="grid h-8 w-8 place-items-center rounded-md border border-stone-200 text-stone-400 hover:text-rose-600 disabled:opacity-30" data-testid={`ur-remove-${u.id}`}><Icons.Trash2 className="h-3.5 w-3.5" /></button>
                  </>)}
                  {!editable && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(open === `${u.id}:access` ? null : `${u.id}:access`)}>View access</Button>
                  )}
                </div>
              </div>
              {open === `${u.id}:roles` && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  {ROLES.map((r) => (
                    <label key={r} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs", roles.includes(r) ? "border-stone-800 bg-stone-100 text-stone-900" : "border-stone-200 text-stone-600")}>
                      <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(u, r)} className="accent-stone-800" data-testid={`ur-role-${u.id}-${r}`} />{r}
                    </label>
                  ))}
                  <p className="w-full text-[10px] text-stone-400">Changing roles resets this person's matrix to the new roles' defaults (highest level wins per area).</p>
                </div>
              )}
              {open === `${u.id}:access` && (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  {locked && <p className="mb-2 text-[11px] text-stone-500"><Icons.Lock className="mr-1 inline h-3 w-3" />{LOCKED_ROLE} always has full access.</p>}
                  <AccessMatrix value={matrix} baseline={baseFor(u)} disabled={!editable || locked} onChange={(a, l) => setLevel(u, a, l)} testid={`ur-matrix-${u.id}`} />
                  {editable && !locked && custom && (
                    <button className="mt-3 text-[11px] text-stone-500 underline hover:text-stone-900" onClick={() => setMatrixDraft((p) => ({ ...p, [u.id]: baseFor(u) }))}>Reset to role defaults</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.canDelete ? `Remove ${removing?.name} from the team?` : `Remove ${removing?.name}'s role & access?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.canDelete
                ? "They've never created, reviewed or recorded anything, so there's nothing to keep. This deletes them. If they sign in with Google again they'll reappear as pending."
                : "They stay in the team — their name is on ideas, comments and captures, and those records need it. They'll see the \"pending access\" screen until someone assigns a role again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C0512F] hover:bg-[#a84325]"
              data-testid="ur-confirm-remove"
              onClick={async () => {
                const who = removing;
                setRemoving(null);
                try {
                  if (who.canDelete) {
                    await actions.deletePerson(who.id);
                    toast.success(`Removed ${who.name} from the team`);
                  } else {
                    await actions.removePersonAccess(who.id);
                    toast.success(`Removed ${who.name}'s access`);
                  }
                  clear(who.id);
                } catch (e) { /* the store already showed the error */ }
              }}>
              {removing?.canDelete ? "Remove from team" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMemberDialog({ open, onOpenChange }) {
  const { actions } = useWorkspace();
  const [form, setForm] = useState({ name: "", roles: [], streams: ["BO", "HPN"] });
  const toggle = (key, v) => setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const submit = () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    actions.addUser({ name: form.name.trim(), roles: form.roles, streams: form.streams });
    toast.success(form.roles.length ? `${form.name} added to the team` : `${form.name} added — pending access until a role is assigned`);
    setForm({ name: "", roles: [], streams: ["BO", "HPN"] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ur-add-dialog">
        <DialogHeader><DialogTitle className="font-serif text-lg">Add team member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><label className="text-xs text-stone-600">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" data-testid="ur-add-name" /></div>
          <div>
            <label className="text-xs text-stone-600">Roles</label>
            <div className="mt-1 flex flex-wrap gap-1.5">{ROLES.map((r) => <button key={r} type="button" onClick={() => toggle("roles", r)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", form.roles.includes(r) ? "border-stone-800 bg-stone-100" : "border-stone-200")}>{r}</button>)}</div>
            <p className="mt-1 text-[10px] text-stone-400">Leave empty to add them as a new joiner awaiting access.</p>
          </div>
          <div>
            <label className="text-xs text-stone-600">Streams</label>
            <div className="mt-1 flex gap-1.5">{Object.values(STREAMS).map((s) => <button key={s} type="button" onClick={() => toggle("streams", s)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", form.streams.includes(s) ? "border-stone-800 bg-stone-100" : "border-stone-200")}>{s}</button>)}</div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} className="bg-stone-900" data-testid="ur-add-submit">Add to team</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDefaults({ editable }) {
  const { db, actions } = useWorkspace();
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({});
  const matrixFor = (r) => draft[r] ?? resolveRoleAccess(r, db.access.roles);
  const holders = (r) => db.users.filter((u) => u.active && u.roles.includes(r)).length;

  return (
    <div className="space-y-2">
      {ROLES.map((r) => {
        const matrix = matrixFor(r);
        const { edit, view } = countLevels(matrix);
        const locked = r === LOCKED_ROLE;
        const tuned = !!db.access.roles[r];
        return (
          <div key={r} className="rounded-lg border border-[#E6E1D8] bg-white px-4 py-3" data-testid={`ur-role-card-${r}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-stone-900">{r}</div>
                <div className="text-[11px] text-stone-500">{locked ? "Full access — always" : `${edit} edit · ${view} view`} · {holders(r)} {holders(r) === 1 ? "person" : "people"}{tuned && <span className="ml-1.5 text-amber-700">· tuned from default</span>}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(open === r ? null : r)} data-testid={`ur-role-open-${r}`}>
                  {editable && !locked ? "Edit access" : "View access"} <Icons.ChevronDown className={cn("ml-1 h-3 w-3 transition-transform", open === r && "rotate-180")} />
                </Button>
                {editable && !locked && (
                  <Button size="sm" className="h-8 bg-stone-900 text-xs" disabled={!draft[r]} data-testid={`ur-role-save-${r}`}
                    onClick={() => { actions.setRoleAccess(r, matrix); setDraft((p) => { const n = { ...p }; delete n[r]; return n; }); toast.success(`${r} access updated for everyone with that role`); }}>Save</Button>
                )}
              </div>
            </div>
            {open === r && (
              <div className="mt-3 border-t border-stone-100 pt-3">
                <AccessMatrix value={matrix} baseline={ROLE_ACCESS_DEFAULTS[r]} disabled={!editable || locked}
                  onChange={(a, l) => setDraft((p) => ({ ...p, [r]: { ...matrixFor(r), [a]: l } }))} testid={`ur-role-matrix-${r}`} />
                {locked && <p className="mt-2 text-[11px] text-stone-400">{LOCKED_ROLE} always has full access — it can't be edited, so nobody can lock the team out.</p>}
                {editable && !locked && tuned && (
                  <button className="mt-3 text-[11px] text-stone-500 underline hover:text-stone-900" onClick={() => { actions.resetRoleAccess(r); setDraft((p) => { const n = { ...p }; delete n[r]; return n; }); toast.success(`${r} reset to the default matrix`); }}>Reset to shipped defaults</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
