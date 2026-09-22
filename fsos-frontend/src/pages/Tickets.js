import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useDemo, useAccess } from "../domain/store";
import { PageHeader } from "../components/common/PageHeader";
import { Avatar } from "../components/common/badges";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { istDateTimeLabel } from "../domain/dates";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const RAILS = [
  { key: "not_started", title: "Incoming tickets", hint: "New tickets — waiting for pickup" },
  { key: "in_progress", title: "In progress", hint: "Being worked on right now" },
];
const RAIL_BG = "#F5F2EC";
const URGENCY = {
  urgent: { label: "!! URGENT !!", border: "#dc2626", color: "#991b1b", bg: "#fef2f2", pill: "bg-rose-50 text-rose-800 border-rose-200" },
  low: { label: "LOW PRIORITY", border: "#0284c7", color: "#075985", bg: "#f0f9ff", pill: "bg-sky-50 text-sky-800 border-sky-200" },
  normal: { label: "NORMAL", border: "#d1d5db", color: "#6b7280", bg: "transparent", pill: "bg-amber-50 text-amber-800 border-amber-200" },
};
const STATUS_PILL = {
  not_started: "bg-stone-100 text-stone-700 border-stone-300",
  in_progress: "bg-violet-50 text-violet-800 border-violet-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
};
const MAX_IMAGE_EDGE = 900;

const mentionFor = (u) => `@${u.name.split(" ")[0]}`;

function tilt(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 0.7;
}

// Demo storage: images are downscaled to a small JPEG data URL (kept in this browser);
// videos keep their name only, since they would not fit in local storage.
function readAttachment(file) {
  return new Promise((resolve) => {
    const base = { id: `att-${Math.random().toString(36).slice(2, 9)}`, name: file.name || "pasted-image", type: file.type, size: file.size };
    if (!file.type.startsWith("image/")) { resolve({ ...base, dataUrl: null }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ ...base, dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
      };
      img.onerror = () => resolve({ ...base, dataUrl: null });
      img.src = reader.result;
    };
    reader.onerror = () => resolve({ ...base, dataUrl: null });
    reader.readAsDataURL(file);
  });
}

function TagField({ tags, onChange }) {
  const { db } = useDemo();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [hi, setHi] = useState(0);
  const people = useMemo(() => db.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)), [db.users]);

  const menu = useMemo(() => {
    const at = draft.lastIndexOf("@");
    if (at === -1) return null;
    const after = draft.slice(at + 1);
    return /\s/.test(after) ? null : { at, q: after.toLowerCase() };
  }, [draft]);
  const matches = useMemo(() => (menu ? people.filter((u) => !menu.q || u.name.toLowerCase().includes(menu.q) || u.roles.join(" ").toLowerCase().includes(menu.q)) : []), [menu, people]);
  useEffect(() => setHi(0), [menu?.q, matches.length]);

  const push = (raw) => {
    let t = raw.trim();
    if (!t) return;
    if (!t.startsWith("@") && !t.startsWith("#")) t = `#${t.replace(/\s+/g, "-")}`;
    if (!tags.includes(t)) onChange([...tags, t]);
  };
  const pick = (u) => { setDraft(draft.slice(0, menu.at)); push(mentionFor(u)); requestAnimationFrame(() => inputRef.current?.focus()); };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className={cn("inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs", t.startsWith("@") ? "border-violet-200 bg-violet-50 text-violet-800" : "border-stone-200 bg-stone-50 text-stone-700")}>
              {t.startsWith("@") && <Icons.AtSign className="h-3 w-3 opacity-70" />}{t.startsWith("@") ? t.slice(1) : t}
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full px-1 opacity-60 hover:opacity-100" aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input ref={inputRef} value={draft} data-testid="ticket-tag-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (menu && matches.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => (i + 1) % matches.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => (i - 1 + matches.length) % matches.length); return; }
              if (e.key === "Enter") { e.preventDefault(); pick(matches[hi]); return; }
            }
            if (menu && e.key === "Escape") { e.preventDefault(); setDraft(draft.slice(0, menu.at)); return; }
            if (e.key === "Enter") { e.preventDefault(); if (menu && !matches.length) return; push(draft); setDraft(""); }
          }}
          placeholder="Type @ to mention people, or a #tag, then Enter…" />
        {menu && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-lg">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">People</div>
            {matches.length === 0 ? <div className="px-3 py-2 text-xs text-stone-500">No matches — keep typing or press Esc</div> : matches.slice(0, 10).map((u, i) => (
              <button key={u.id} type="button" onMouseDown={(ev) => { ev.preventDefault(); pick(u); }} onMouseEnter={() => setHi(i)}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left", i === hi ? "bg-stone-100" : "hover:bg-stone-50")}>
                <Avatar user={u} size={22} />
                <span className="min-w-0"><span className="block text-xs font-medium text-stone-900">{u.name}</span><span className="block text-[10px] text-stone-500">{u.roles.join(", ") || "Pending access"}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Receipt({ t, onOpen, onDragStart, actions }) {
  const { db, actingUser } = useDemo();
  const mine = t.assigneeId === actingUser.id;
  const urg = URGENCY[t.urgency] || URGENCY.normal;
  const reporter = db.users.find((u) => u.id === t.reporterId);
  const assignee = db.users.find((u) => u.id === t.assigneeId);
  const r = tilt(t.id);
  const bars = t.id.replace(/[^a-z0-9]/gi, "").slice(-14).split("");
  const dash = <div className="my-1.5 border-t border-dashed border-gray-200" />;
  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart} onClick={onOpen} data-testid={`ticket-${t.ticketNumber}`}
      className="relative w-[188px] shrink-0 cursor-pointer select-none transition-transform hover:-translate-y-0.5" style={{ transform: `rotate(${r}deg)`, transformOrigin: "top center" }}>
      <div className="flex flex-col items-center">
        <div style={{ width: 30, height: 20, clipPath: "polygon(16% 0%, 84% 0%, 94% 100%, 6% 100%)", background: mine ? "linear-gradient(#a78bfa, #7c3aed 45%, #a78bfa)" : "linear-gradient(#e8c84a, #c9a50e 45%, #e8c84a)", boxShadow: "0 3px 8px rgba(0,0,0,.25)" }} />
        <div style={{ width: 2, height: 8, background: "rgba(90,70,10,.35)" }} />
      </div>
      <div style={{ background: "#fefdf4", color: "#1c1c1c", fontFamily: "'Courier New', Courier, monospace", filter: "drop-shadow(0 10px 18px rgba(28,25,23,.18))" }}>
        <div style={{ height: 10, backgroundImage: `radial-gradient(circle at 8px 0px, ${RAIL_BG} 5px, transparent 5px)`, backgroundSize: "16px 100%" }} />
        <div style={{ padding: "6px 11px 10px" }}>
          <div className="text-center">
            <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: ".28em", color: "#9ca3af" }}>FRONTSEAT MEDIA</div>
            <div style={{ fontSize: 6, letterSpacing: ".18em", color: "#d1d5db" }}>SUPPORT KITCHEN</div>
          </div>
          {dash}
          <div className="text-center">
            <div style={{ fontSize: 7, letterSpacing: ".2em", color: "#9ca3af" }}>ORDER</div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: "#111827" }}>#{String(t.ticketNumber).padStart(4, "0")}</div>
          </div>
          {dash}
          <div style={{ textAlign: "center", border: `1px solid ${urg.border}`, borderRadius: 2, padding: "2px 4px", fontSize: 8, fontWeight: 900, letterSpacing: ".12em", marginBottom: 7, color: urg.color, background: urg.bg }}>{urg.label}</div>
          <div style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.3, marginBottom: 5, wordBreak: "break-word", color: "#111827" }}>{t.title}</div>
          <div style={{ fontSize: 10, color: "#4b5563", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.description}</div>
          {t.tags?.length > 0 && (<>{dash}<div className="flex flex-wrap gap-[3px]">
            {t.tags.slice(0, 3).map((tag) => <span key={tag} style={{ fontSize: 8, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 2, padding: "1px 4px" }}>{tag}</span>)}
            {t.tags.length > 3 && <span style={{ fontSize: 8, color: "#9ca3af" }}>+{t.tags.length - 3}</span>}
          </div></>)}
          {t.attachments?.length > 0 && <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 4 }}>📎 {t.attachments.length} attachment{t.attachments.length > 1 ? "s" : ""}</div>}
          {dash}
          {reporter && <div style={{ fontSize: 8, color: "#9ca3af", display: "flex", gap: 4 }}><b style={{ color: "#6b7280" }}>FROM</b><span className="truncate">{reporter.name}</span></div>}
          {assignee
            ? <div style={{ fontSize: 8, display: "flex", gap: 4, color: mine ? "#7c3aed" : "#9ca3af" }}><b style={{ color: mine ? "#7c3aed" : "#6b7280" }}>{mine ? "YOU ▶" : "WORKING"}</b><span className="truncate">{mine ? "on this ticket" : assignee.name}</span></div>
            : <div style={{ fontSize: 8, color: "#d1d5db" }}>WAITING FOR PICKUP</div>}
          {dash}
          <div className="text-center">
            <div className="mb-0.5 flex items-center justify-center">
              {bars.map((c, i) => <span key={i} style={{ display: "inline-block", width: [1, 2, 1, 3, 2, 1][parseInt(c, 36) % 6], height: 18, background: "#374151", marginRight: 1 }} />)}
            </div>
            <div style={{ fontSize: 7, color: "#9ca3af", letterSpacing: ".12em" }}>{t.id.slice(-8).toUpperCase()}</div>
          </div>
          {actions && <div style={{ borderTop: "1px dashed #e5e7eb", marginTop: 8, paddingTop: 7 }} onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
        <div style={{ height: 10, backgroundImage: `radial-gradient(circle at 8px 10px, ${RAIL_BG} 5px, transparent 5px)`, backgroundSize: "16px 100%" }} />
      </div>
    </div>
  );
}

const receiptBtn = (tone) => ({
  flex: 1, height: 24, fontSize: 8, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", borderRadius: 3, cursor: "pointer",
  fontFamily: "'Courier New', Courier, monospace",
  ...(tone === "take" ? { border: "1px solid #6d28d9", background: "#ede9fe", color: "#4c1d95" } : { border: "1px solid #065f46", background: "#d1fae5", color: "#065f46" }),
});

export default function Tickets() {
  const { db, actions, actingUser } = useDemo();
  const { canEdit } = useAccess();
  const editable = canEdit("tickets");
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [finishedOpen, setFinishedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const dragId = useRef(null);

  const selectedId = params.get("ticket");
  const selected = db.tickets.find((t) => t.id === selectedId);
  const openTicket = (id) => setParams(id ? { ticket: id } : {});

  const byStatus = useMemo(() => {
    const m = { not_started: [], in_progress: [], resolved: [] };
    db.tickets.forEach((t) => (m[t.status] || m.not_started).push(t));
    return m;
  }, [db.tickets]);

  const move = (id, status) => {
    if (!editable) return;
    const t = db.tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const patch = { status };
    if (status === "in_progress" && !t.assigneeId) patch.assigneeId = actingUser.id;
    actions.patchTicket(id, patch);
  };
  const take = (t) => { actions.patchTicket(t.id, { status: "in_progress", assigneeId: actingUser.id }); toast.success(`#${t.ticketNumber} is yours`); };
  const finish = (t) => { actions.patchTicket(t.id, { status: "resolved" }); toast.success(`#${t.ticketNumber} finished ✓`); };
  const dropProps = (status) => ({
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => { if (dragId.current) move(dragId.current, status); dragId.current = null; },
  });

  return (
    <div className="p-6" data-testid="tickets-page">
      <PageHeader title="Bug Tickets" icon={Icons.Ticket} subtitle="Add ticket → incoming → in progress → finished. Drag receipts between rails; @mentions notify people.">
        {editable && <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-stone-900" data-testid="add-ticket-btn"><Icons.Plus className="mr-1 h-4 w-4" /> Add ticket</Button>}
      </PageHeader>
      {!editable && <p className="mb-3 text-[11px] text-stone-500"><Icons.Eye className="mr-1 inline h-3 w-3" />View only — you can read tickets but not add or move them.</p>}

      <div className="space-y-6">
        {RAILS.map((rail) => (
          <section key={rail.key} className="rounded-lg border border-[#E6E1D8] p-4" style={{ background: RAIL_BG }} data-testid={`rail-${rail.key}`}>
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="text-xs font-black uppercase tracking-[.25em] text-stone-800">{rail.title}</span>
              <span className="text-xs text-stone-400">— {rail.hint}</span>
              <span className="ml-auto rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-bold text-stone-700">{byStatus[rail.key].length}</span>
            </div>
            <div className="relative">
              <div className="mx-1 h-3.5 rounded-full" style={{ background: "linear-gradient(#c8ced6, #e2e8f0 22%, #94a3b8 50%, #e2e8f0 78%, #c8ced6)", boxShadow: "0 6px 14px rgba(28,25,23,.25), inset 0 2px 0 rgba(255,255,255,.55)" }} />
              <div className="min-h-[200px] pb-4 pt-1" {...dropProps(rail.key)}>
                {byStatus[rail.key].length === 0 ? (
                  <div className="flex h-[190px] items-center justify-center">
                    <p className="rounded-xl border-2 border-dashed border-stone-300 px-10 py-5 font-mono text-[11px] text-stone-400">No tickets — drop or create one</p>
                  </div>
                ) : (
                  <div className="flex gap-6 overflow-x-auto px-6 pb-3 pt-1 fsos-scroll">
                    {byStatus[rail.key].map((t) => (
                      <Receipt key={t.id} t={t} onOpen={() => openTicket(t.id)} onDragStart={editable ? () => { dragId.current = t.id; } : undefined}
                        actions={editable && (
                          <div className="flex items-center gap-1.5">
                            <button type="button" title="Delete" onClick={() => setConfirmDelete(t)} style={{ height: 24, width: 24, display: "grid", placeItems: "center", border: "1px solid #e5e7eb", borderRadius: 3, color: "#9ca3af" }}><Icons.Trash2 className="h-[11px] w-[11px]" /></button>
                            {rail.key === "not_started"
                              ? <button type="button" style={receiptBtn("take")} onClick={() => take(t)} data-testid={`take-${t.ticketNumber}`}>Take ticket</button>
                              : <button type="button" style={receiptBtn("finish")} onClick={() => finish(t)} data-testid={`finish-${t.ticketNumber}`}>Finish ✓</button>}
                          </div>
                        )} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}

        <section className="overflow-hidden rounded-lg border border-[#E6E1D8] bg-white" data-testid="rail-resolved">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
            <div className="flex items-center gap-3">
              <Icons.Layers className="h-4 w-4 text-emerald-600" />
              <div><p className="text-[11px] font-black uppercase tracking-[.28em] text-emerald-700">Finished</p><p className="mt-0.5 text-[11px] text-stone-400">Completed tickets, filed away.</p></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">{byStatus.resolved.length}</span>
              <Button size="sm" variant="outline" onClick={() => setFinishedOpen((v) => !v)} data-testid="toggle-finished">{finishedOpen ? "Hide" : "Show"}</Button>
            </div>
          </div>
          {finishedOpen ? (
            <div className="grid min-h-[110px] grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" {...dropProps("resolved")}>
              {byStatus.resolved.length === 0 ? <p className="col-span-full py-6 text-center text-xs text-stone-400">No finished tickets</p> : byStatus.resolved.map((t) => (
                <div key={t.id} draggable={editable} onDragStart={() => { dragId.current = t.id; }} onClick={() => openTicket(t.id)}
                  className="cursor-pointer rounded-md border border-stone-200 p-3 hover:border-stone-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Finished ✓</p>
                      <p className="text-xs text-stone-400">#{t.ticketNumber}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-stone-900">{t.title}</p>
                    </div>
                    {editable && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(t); }} className="grid h-7 w-7 place-items-center rounded-md border border-stone-200 text-stone-400 hover:text-rose-600" title="Delete"><Icons.Trash2 className="h-3.5 w-3.5" /></button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); actions.patchTicket(t.id, { status: "in_progress" }); }}>Reopen</Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-stone-500">{t.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6">
              {byStatus.resolved.length === 0 ? <p className="py-6 text-center text-xs text-stone-400">No finished tickets</p> : (
                <div className="relative h-[150px]">
                  {byStatus.resolved.slice(0, 5).map((t, i) => (
                    <div key={t.id} className="absolute left-0 top-0 rounded-md px-3 py-2.5" onClick={() => openTicket(t.id)}
                      style={{ transform: `translate(${i * 14}px, ${i * 7}px) rotate(${tilt(t.id)}deg)`, width: "min(380px, 80vw)", background: "#fefdf4", fontFamily: "'Courier New', Courier, monospace", boxShadow: "0 6px 18px rgba(28,25,23,.18)", cursor: "pointer" }}>
                      <div className="mb-0.5 flex items-center gap-2"><span style={{ fontSize: 9, fontWeight: 900, color: "#059669", letterSpacing: ".1em" }}>FINISHED ✓</span><span style={{ fontSize: 9, color: "#9ca3af" }}>#{t.ticketNumber}</span></div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{t.title}</p>
                      <p style={{ fontSize: 10, color: "#6b7280", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description}</p>
                    </div>
                  ))}
                  {byStatus.resolved.length > 5 && <div className="absolute bottom-0 right-0 text-[11px] text-stone-400">+{byStatus.resolved.length - 5} more</div>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TicketDetail ticket={selected} open={!!selected} editable={editable} onClose={() => openTicket(null)}
        onTake={() => { take(selected); openTicket(null); }} onFinish={() => { finish(selected); openTicket(null); }} onDelete={() => setConfirmDelete(selected)} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket #{confirmDelete?.ticketNumber}?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDelete?.title} — this can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-ticket" className="bg-[#C0512F] hover:bg-[#a84325]" onClick={() => {
              actions.deleteTicket(confirmDelete.id);
              if (selectedId === confirmDelete.id) openTicket(null);
              toast.success("Ticket deleted");
              setConfirmDelete(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateTicketDialog({ open, onOpenChange }) {
  const { actions } = useDemo();
  const [form, setForm] = useState({ title: "", description: "", urgency: "normal", tags: [] });
  const [files, setFiles] = useState([]);

  useEffect(() => { if (open) { setForm({ title: "", description: "", urgency: "normal", tags: [] }); setFiles([]); } }, [open]);

  const addFiles = async (list) => {
    const incoming = Array.from(list || []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!incoming.length) return;
    const read = await Promise.all(incoming.map(readAttachment));
    setFiles((prev) => [...prev, ...read]);
    return read.length;
  };

  // WhatsApp-style: paste screenshots straight into the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = async (e) => {
      const pasted = Array.from(e.clipboardData?.items || []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
      if (!pasted.length) return;
      e.preventDefault();
      const n = await addFiles(pasted);
      if (n) toast.success(`${n} attachment${n === 1 ? "" : "s"} added from clipboard`);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const submit = () => {
    if (!form.description.trim()) { toast.error("Describe the problem"); return; }
    actions.createTicket({ ...form, attachments: files });
    toast.success("Ticket added");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="create-ticket-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Add ticket</DialogTitle>
          <DialogDescription>Log a bug or request. Mention people with <b>@name</b> — they get a notification.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="text-xs text-stone-600">Ticket title (optional)</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Auto from first line if empty" className="mt-1" data-testid="ticket-title" /></div>
          <div>
            <label className="text-xs text-stone-600">Urgency</label>
            <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm" data-testid="ticket-urgency">
              <option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className="text-xs text-stone-600">Tag / mention</label><div className="mt-1"><TagField tags={form.tags} onChange={(tags) => setForm({ ...form, tags })} /></div></div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-600">Problem description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={"1. Problem description:\n2. Where it happens:\n3. Screenshot attached"} className="mt-1 min-h-[140px]" data-testid="ticket-description" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-600">Attachments (images / videos)</label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700 hover:bg-stone-100">
                <Icons.Paperclip className="h-4 w-4" /> Add files
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <span className="text-xs text-stone-500">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "No files"}</span>
            </div>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f) => (
                  <span key={f.id} className="relative">
                    {f.dataUrl ? <img src={f.dataUrl} alt={f.name} className="h-14 w-14 rounded-md border border-stone-200 object-cover" /> : <span className="grid h-14 w-24 place-items-center rounded-md border border-stone-200 bg-stone-50 px-1 text-center text-[9px] text-stone-500"><Icons.Film className="mb-0.5 h-4 w-4" />{f.name.slice(0, 18)}</span>}
                    <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-stone-900 text-[10px] text-white">×</button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-stone-400">Tip: paste screenshots with <b>Ctrl+V</b>. Demo mode keeps images in this browser; videos keep their file name only.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={!form.description.trim()} className="bg-stone-900" data-testid="ticket-submit"><Icons.Send className="mr-1.5 h-4 w-4" /> Add ticket</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetail({ ticket, open, editable, onClose, onTake, onFinish, onDelete }) {
  const { db, actions } = useDemo();
  const [editTitle, setEditTitle] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  useEffect(() => { setEditTitle(false); setEditDesc(false); }, [ticket?.id]);
  if (!ticket) return null;
  const reporter = db.users.find((u) => u.id === ticket.reporterId);
  const assignee = db.users.find((u) => u.id === ticket.assigneeId);
  const urg = URGENCY[ticket.urgency] || URGENCY.normal;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="ticket-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-lg">
            <span className="shrink-0 text-stone-400">#{ticket.ticketNumber}</span>
            {editTitle ? (
              <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => { setEditTitle(false); if (titleDraft.trim()) actions.patchTicket(ticket.id, { title: titleDraft.trim() }); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditTitle(false); }}
                className="flex-1 border-b border-stone-800 bg-transparent outline-none" />
            ) : (
              <button disabled={!editable} onClick={() => { setTitleDraft(ticket.title); setEditTitle(true); }} className="flex-1 truncate text-left hover:text-stone-600" title={editable ? "Click to edit title" : undefined}>{ticket.title}</button>
            )}
          </DialogTitle>
          <DialogDescription>
            {assignee ? `Assigned to ${assignee.name}` : "Unassigned"} · reported by {reporter?.name || "—"} · {istDateTimeLabel(ticket.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", urg.pill)}>{(ticket.urgency || "normal").toUpperCase()}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_PILL[ticket.status])}>{ticket.status.replace("_", " ").toUpperCase()}</span>
            {ticket.tags?.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-700">{t.startsWith("@") && <Icons.AtSign className="h-3 w-3 opacity-70" />}{t.startsWith("@") ? t.slice(1) : t}</span>)}
          </div>

          <div className="rounded-lg border border-stone-200 bg-[#FAF8F5] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">Problem description</p>
              {editable && !editDesc && <button onClick={() => { setDescDraft(ticket.description); setEditDesc(true); }} className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-900"><Icons.Pencil className="h-3 w-3" /> Edit</button>}
            </div>
            {editDesc ? (
              <div className="space-y-2">
                <Textarea autoFocus value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={5} />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-stone-900" onClick={() => { if (descDraft.trim()) actions.patchTicket(ticket.id, { description: descDraft.trim() }); setEditDesc(false); }}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditDesc(false)}>Cancel</Button>
                </div>
              </div>
            ) : <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{ticket.description}</p>}
          </div>

          <div className="rounded-lg border border-stone-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">Attachments</p>
            {ticket.attachments?.length ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ticket.attachments.map((a) => (
                  <div key={a.id} className="overflow-hidden rounded-md border border-stone-200">
                    <div className="truncate border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-500">{a.name}</div>
                    <div className="aspect-video bg-stone-50">
                      {a.dataUrl
                        ? <a href={a.dataUrl} target="_blank" rel="noreferrer"><img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" /></a>
                        : <div className="grid h-full place-items-center text-xs text-stone-400">{a.type?.startsWith("video/") ? "Video (not stored in demo mode)" : "File"}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-stone-400">No attachments</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-2">
              {editable && ticket.status !== "in_progress" && <Button variant="outline" className="border-violet-200 text-violet-800 hover:bg-violet-50" onClick={onTake} data-testid="detail-take">Take ticket</Button>}
              {editable && ticket.status !== "resolved" && <Button variant="outline" className="border-emerald-200 text-emerald-800 hover:bg-emerald-50" onClick={onFinish} data-testid="detail-finish">Mark finished ✓</Button>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              {editable && <Button variant="outline" className="text-stone-500 hover:text-rose-700" onClick={onDelete}><Icons.Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
