import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import {
  createTicket,
  deleteTicket,
  getTickets,
  getWorkboardMentionCandidates,
  patchTicket,
  signTicketCloudinaryUpload,
  type Ticket,
  type TicketAttachment,
  type TicketStatus,
  type TicketUrgency,
  type WorkboardMentionPerson,
} from "@/services/api";
import { mentionFromName, workboardMentionSubtitle } from "@/lib/workboardTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AtSign, Layers, Loader2, Paperclip, Send, Ticket as TicketIcon, Trash2, User } from "lucide-react";

type Column = { key: TicketStatus; title: string; hint: string };
const COLUMNS: Column[] = [
  { key: "not_started", title: "INCOMING TICKETS", hint: "New tickets — waiting for pickup" },
  { key: "in_progress", title: "IN PROGRESS", hint: "Being worked on right now" },
  { key: "resolved", title: "Finished", hint: "Completed tickets" },
];

function isPersonMentionTag(t: string): boolean {
  return t.startsWith("@") && t.length > 1;
}

function TagField({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const { data: mentionPayload } = useQuery({
    queryKey: ["tickets-mention-candidates"],
    queryFn: getWorkboardMentionCandidates,
    staleTime: 5 * 60 * 1000,
  });
  const apiPeople: WorkboardMentionPerson[] = mentionPayload?.people ?? [];

  const mentionPickerPeople = useMemo(() => {
    return apiPeople
      .filter((p) => p.role_id || p.email || p.is_content_strategist)
      .sort((a, b) => a.display.toLowerCase().localeCompare(b.display.toLowerCase()));
  }, [apiPeople]);

  const mentionMenu = useMemo(() => {
    const at = draft.lastIndexOf("@");
    if (at === -1) return null;
    const after = draft.slice(at + 1);
    if (/\s/.test(after)) return null;
    return { at, filter: after.toLowerCase() };
  }, [draft]);

  const mentionFiltered = useMemo(() => {
    if (!mentionMenu) return [];
    const q = mentionMenu.filter;
    return mentionPickerPeople.filter((p) => {
      if (!q) return true;
      const disp = p.display.toLowerCase();
      const em = (p.email || "").toLowerCase();
      const sub = (workboardMentionSubtitle(p.role_id, p.email, { isContentStrategist: p.is_content_strategist }) || "").toLowerCase();
      return disp.includes(q) || em.includes(q) || sub.includes(q);
    });
  }, [mentionMenu, mentionPickerPeople]);

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionMenu?.at, mentionMenu?.filter, mentionFiltered.length]);

  const pushTag = (raw: string) => {
    let t = raw.trim();
    if (!t) return;
    if (!t.startsWith("@") && !t.startsWith("#")) t = t.includes(" ") ? t : mentionFromName(t);
    if (tags.includes(t)) return;
    onChange([...tags, t]);
  };

  const pickMention = (person: WorkboardMentionPerson) => {
    if (!mentionMenu) return;
    setDraft(draft.slice(0, mentionMenu.at));
    pushTag(mentionFromName(person.display));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const person = isPersonMentionTag(t);
            return (
              <span
                key={t}
                className={cn(
                  "inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full max-w-full border text-[12px]",
                  person ? "bg-violet-500/15 text-violet-100 border-violet-400/30" : "bg-white/[0.06] text-zinc-200 border-white/10",
                )}
              >
                {person ? <AtSign className="w-3 h-3 shrink-0 opacity-70" /> : null}
                <span className="truncate max-w-[240px]" title={t}>
                  {person ? t.slice(1) : t}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  className={cn("shrink-0 px-1 rounded-full text-sm leading-none opacity-60 hover:opacity-100", person ? "hover:bg-violet-500/25" : "hover:bg-white/10")}
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (mentionMenu) {
              if (mentionFiltered.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionHighlight((i) => (i + 1) % mentionFiltered.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionHighlight((i) => (i - 1 + mentionFiltered.length) % mentionFiltered.length);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  pickMention(mentionFiltered[mentionHighlight]!);
                  return;
                }
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(draft.slice(0, mentionMenu.at));
                return;
              }
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (mentionMenu && mentionFiltered.length === 0) return;
              pushTag(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder || "Type @ to mention people, press Enter…"}
          className="w-full h-10 rounded-md bg-zinc-950/60 border border-white/10 text-white px-3 text-sm placeholder:text-zinc-600"
          role="combobox"
          aria-expanded={Boolean(mentionMenu)}
          aria-autocomplete="list"
        />

        {mentionMenu ? (
          <div className="absolute z-[200] left-0 right-0 bottom-full mb-1.5 max-h-[min(280px,50vh)] overflow-y-auto rounded-xl border border-zinc-700/90 bg-zinc-950/95 py-1.5 shadow-[0_-24px_60px_rgba(0,0,0,0.85),0_0_48px_-12px_rgba(109,40,217,0.2)] backdrop-blur-xl">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              People
            </div>
            {mentionFiltered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-zinc-500">No matches — keep typing or press Esc</div>
            ) : (
              mentionFiltered.slice(0, 12).map((person, idx) => {
                const sub = workboardMentionSubtitle(person.role_id, person.email, { isContentStrategist: person.is_content_strategist });
                const rowKey = `${person.display}|${person.email ?? ""}|${person.role_id ?? ""}`;
                return (
                  <button
                    key={rowKey}
                    type="button"
                    className={cn(
                      "mx-1 flex w-[calc(100%-0.5rem)] items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      idx === mentionHighlight ? "bg-violet-500/30 text-white" : "text-zinc-100 hover:bg-white/10",
                    )}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      pickMention(person);
                    }}
                    onMouseEnter={() => setMentionHighlight(idx)}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-300/80">
                      <User className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight">{person.display}</span>
                      {sub ? <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-400">{sub}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function urgencyPill(u: string) {
  const v = (u || "normal").toLowerCase();
  if (v === "urgent") return "bg-red-500/15 text-red-200 border-red-500/25";
  if (v === "low") return "bg-sky-500/10 text-sky-200 border-sky-500/20";
  return "bg-amber-500/10 text-amber-200 border-amber-500/20";
}

function statusBadge(s: string) {
  const v = (s || "not_started").toLowerCase();
  if (v === "in_progress") return "bg-violet-500/15 text-violet-200 border-violet-500/25";
  if (v === "resolved") return "bg-emerald-500/10 text-emerald-200 border-emerald-500/20";
  return "bg-zinc-700/40 text-zinc-200 border-zinc-600/40";
}

async function uploadToCloudinary(file: File, signed: Awaited<ReturnType<typeof signTicketCloudinaryUpload>>) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", signed.api_key);
  fd.append("timestamp", String(signed.timestamp));
  fd.append("signature", signed.signature);
  fd.append("folder", signed.folder);
  fd.append("tags", signed.tags);
  fd.append("context", signed.context);

  const res = await fetch(signed.upload_url, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Cloudinary upload failed (${res.status})`);
  }
  return (await res.json()) as any;
}

const PAGE_BG = "#09090b";

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const notes = [880, 1108]; // A5 → C#6 — ascending two-tone ding
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.14);
      osc.connect(gain);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.4);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.4);
    });
  } catch {
    // audio unavailable — silent fail
  }
}

export default function Tickets() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<TicketUrgency>("normal");
  const [tags, setTags] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const appendFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    setFiles((prev) => {
      const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}|${f.type}`;
      const seen = new Set(prev.map(key));
      const next = [...prev];
      for (const f of incoming) {
        const k = key(f);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }
      return next;
    });
  };

  const ticketsQ = useQuery<Ticket[]>({
    queryKey: ["tickets"],
    queryFn: () => getTickets(),
    refetchInterval: 20_000,
  });

  const prevRef = useRef<Record<string, { status?: string; assigned_to_email?: string | null; updated_at?: string; tags?: string[] }>>({});

  const { data: mentionPayload } = useQuery({
    queryKey: ["tickets-mention-candidates"],
    queryFn: getWorkboardMentionCandidates,
    staleTime: 5 * 60 * 1000,
  });

  const myMentionTag = useMemo(() => {
    const me = mentionPayload?.people?.find(
      (p) => (p.email || "").toLowerCase() === (user?.email || "").toLowerCase(),
    );
    return me ? mentionFromName(me.display) : null;
  }, [mentionPayload, user?.email]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();
  }, []);

  // WhatsApp-style: allow pasting images/videos directly into Attachments.
  useEffect(() => {
    if (!createOpen) return;

    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt?.items?.length) return;

      const pasted: File[] = [];
      for (const item of Array.from(dt.items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
        pasted.push(file);
      }

      if (pasted.length === 0) return;
      e.preventDefault();
      appendFiles(pasted);
      toast.success(`${pasted.length} attachment${pasted.length === 1 ? "" : "s"} added from clipboard`);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [createOpen]);

  const byStatus = useMemo(() => {
    const rows = ticketsQ.data || [];
    const map: Record<string, Ticket[]> = { not_started: [], in_progress: [], resolved: [] };
    for (const t of rows) {
      const k = (t.status || "not_started") as string;
      (map[k] ||= []).push(t);
    }
    return map as Record<TicketStatus, Ticket[]>;
  }, [ticketsQ.data]);

  useEffect(() => {
    const email = (user?.email || "").toLowerCase();
    if (!email) return;
    const rows = ticketsQ.data || [];
    const prev = prevRef.current;

    const ping = (title: string, body: string) => {
      playNotificationChime();
      toast(body, { description: title });
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    };

    for (const t of rows) {
      const pid = prev[t.id];
      const nowAssigned = (t.assigned_to_email || "").toLowerCase();
      const wasAssigned = (pid?.assigned_to_email || "").toLowerCase();
      const nowStatus = String(t.status || "");
      const wasStatus = String(pid?.status || "");
      const relevant = nowAssigned === email || (t.reporter_email || "").toLowerCase() === email;

      const nowMentioned = myMentionTag ? (t.tags || []).includes(myMentionTag) : false;
      const wasMentioned = myMentionTag ? (pid?.tags || []).includes(myMentionTag) : false;
      const justMentioned = nowMentioned && (!pid || !wasMentioned);

      if (justMentioned) {
        ping(
          "Bug Tickets — You were mentioned",
          `#${t.ticket_number ?? "—"}: ${t.title || t.description.slice(0, 60)}`,
        );
      } else if (pid) {
        const isReporter = (t.reporter_email || "").toLowerCase() === email;

        if (nowAssigned === email && wasAssigned !== email) {
          ping("Bug Tickets — Assigned to you", `Ticket #${t.ticket_number ?? "—"} was assigned to you`);
        }

        if (isReporter && nowStatus !== wasStatus) {
          if (nowStatus === "in_progress") {
            ping(
              "Bug Tickets — Ticket Accepted",
              `#${t.ticket_number ?? "—"}: ${t.title || "Your ticket"} is now being worked on`,
            );
          } else if (nowStatus === "resolved") {
            ping(
              "Bug Tickets — Ticket Finished ✓",
              `#${t.ticket_number ?? "—"}: ${t.title || "Your ticket"} was marked finished`,
            );
          }
        }
      }
    }

    prevRef.current = Object.fromEntries(
      rows.map((t) => [t.id, { status: t.status, assigned_to_email: t.assigned_to_email, updated_at: t.updated_at, tags: t.tags }]),
    );
  }, [ticketsQ.data, user?.email, myMentionTag]);

  const createMut = useMutation({
    mutationFn: async () => {
      const base = await createTicket({
        title: title.trim() || undefined,
        description,
        urgency,
        status: "not_started",
        tags,
        reporter_email: user?.email || undefined,
        assigned_to_email: null,
        attachments: [],
      });

      const ticketId = base.id;
      const ticketNumber = base.ticket_number;
      if (!ticketId || !ticketNumber) return base;

      if (files.length > 0) {
        const signed = await signTicketCloudinaryUpload({
          ticket_id: ticketId,
          ticket_number: ticketNumber,
          uploader: user?.email || undefined,
        });

        const uploaded: TicketAttachment[] = [];
        for (const f of files) {
          const r = await uploadToCloudinary(f, signed);
          uploaded.push({
            secure_url: r.secure_url,
            public_id: r.public_id,
            resource_type: r.resource_type || "auto",
            bytes: r.bytes,
            format: r.format,
            original_filename: r.original_filename,
            created_at: r.created_at,
            expires_at: signed.expires_at,
          });
        }

        await patchTicket(ticketId, { attachments: uploaded });
      }

      return base;
    },
    onSuccess: async () => {
      toast.success("Ticket added");
      setTitle("");
      setDescription("");
      setUrgency("normal");
      setTags([]);
      setFiles([]);
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      await qc.invalidateQueries({ queryKey: ["weekly-workboard"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create ticket"),
  });

  const patchMut = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Ticket> }) => patchTicket(args.id, args.patch as any),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      await qc.invalidateQueries({ queryKey: ["weekly-workboard"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update ticket"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteTicket(id),
    onSuccess: async () => {
      toast.success("Ticket deleted");
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      await qc.invalidateQueries({ queryKey: ["weekly-workboard"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete ticket"),
  });

  const resolvedCount = byStatus.resolved.length;
  const dragIdRef = useRef<string | null>(null);

  const moveTicket = (id: string, status: TicketStatus) => {
    patchMut.mutate({ id, patch: { status } });
  };

  const allTickets = ticketsQ.data || [];
  const selectedTicket = useMemo(
    () => (selectedTicketId ? allTickets.find((t) => t.id === selectedTicketId) : undefined),
    [allTickets, selectedTicketId],
  );

  const cardTilt = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((h % 7) - 3) * 0.7;
  };

  const ReceiptTicket = ({ t, actions }: { t: Ticket; actions: ReactNode }) => {
    const tilt = cardTilt(t.id);
    const isMyTicket = !!(user?.email && (t.assigned_to_email || "").toLowerCase() === user.email.toLowerCase());
    const urgV = (t.urgency || "normal").toString().toLowerCase();
    const urgStyle =
      urgV === "urgent"
        ? { borderColor: "#dc2626", color: "#991b1b", background: "#fef2f2", label: "!! URGENT !!" }
        : urgV === "low"
        ? { borderColor: "#0284c7", color: "#075985", background: "#f0f9ff", label: "LOW PRIORITY" }
        : { borderColor: "#d1d5db", color: "#6b7280", background: "transparent", label: "NORMAL" };

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: -20, rotate: tilt }}
        animate={{ opacity: 1, y: 0, rotate: tilt }}
        exit={{ opacity: 0, y: -20, rotate: tilt }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        draggable
        onDragStart={() => { dragIdRef.current = t.id; }}
        onClick={() => { setSelectedTicketId(t.id); setDetailOpen(true); }}
        className="relative shrink-0 cursor-pointer select-none"
        style={{ width: 188, transformOrigin: "top center" }}
      >
        {/* Brass binder clip */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 30,
              height: 20,
              background: isMyTicket
                ? "linear-gradient(to bottom, #a78bfa 0%, #7c3aed 45%, #a78bfa 100%)"
                : "linear-gradient(to bottom, #e8c84a 0%, #c9a50e 45%, #e8c84a 100%)",
              clipPath: "polygon(16% 0%, 84% 0%, 94% 100%, 6% 100%)",
              boxShadow: isMyTicket
                ? "0 3px 8px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.4)"
                : "0 3px 8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2)",
              position: "relative",
              zIndex: 10,
            }}
          />
          {/* String from clip to paper */}
          <div style={{ width: 2, height: 8, background: "rgba(90,70,10,0.35)" }} />
        </div>

        {/* Thermal receipt paper */}
        <div
          style={{
            background: "#fefdf4",
            color: "#1c1c1c",
            fontFamily: "'Courier New', Courier, monospace",
            boxShadow: "0 24px_60px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.5)",
            filter: "drop-shadow(0 16px 40px rgba(0,0,0,0.65))",
          }}
        >
          {/* Perforated top edge */}
          <div
            style={{
              height: 10,
              backgroundImage: `radial-gradient(circle at 8px 0px, ${PAGE_BG} 5px, transparent 5px)`,
              backgroundSize: "16px 100%",
              backgroundRepeat: "repeat-x",
            }}
          />

          <div style={{ padding: "8px 11px 10px" }}>
            {/* Store name */}
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: "0.28em", color: "#9ca3af", textTransform: "uppercase" }}>
                FRONTSEAT MEDIA
              </div>
              <div style={{ fontSize: 6, letterSpacing: "0.18em", color: "#d1d5db", textTransform: "uppercase", marginTop: 1 }}>
                Support Kitchen
              </div>
            </div>

            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "5px 0" }} />

            {/* Order number */}
            <div style={{ textAlign: "center", margin: "6px 0" }}>
              <div style={{ fontSize: 7, letterSpacing: "0.2em", color: "#9ca3af", textTransform: "uppercase" }}>ORDER</div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, color: "#111827" }}>
                #{String(t.ticket_number ?? 0).padStart(4, "0")}
              </div>
            </div>

            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "5px 0" }} />

            {/* Urgency stamp */}
            <div
              style={{
                textAlign: "center",
                border: `1px solid ${urgStyle.borderColor}`,
                borderRadius: 2,
                padding: "2px 4px",
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 7,
                color: urgStyle.color,
                background: urgStyle.background,
              }}
            >
              {urgStyle.label}
            </div>

            {/* Title */}
            {(t.title || "").trim() ? (
              <div style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.3, marginBottom: 5, wordBreak: "break-word", color: "#111827" }}>
                {t.title}
              </div>
            ) : null}

            {/* Description */}
            <div
              style={{
                fontSize: 10,
                color: "#4b5563",
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
                marginBottom: 6,
              }}
            >
              {t.description}
            </div>

            {/* Tags */}
            {t.tags?.length > 0 && (
              <>
                <div style={{ borderTop: "1px dashed #e5e7eb", margin: "5px 0" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {t.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 8,
                        color: "#6b7280",
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: 2,
                        padding: "1px 4px",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  {t.tags.length > 3 ? (
                    <span style={{ fontSize: 8, color: "#9ca3af" }}>+{t.tags.length - 3}</span>
                  ) : null}
                </div>
              </>
            )}

            {/* Attachments indicator */}
            {t.attachments?.length ? (
              <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 4 }}>
                📎 {t.attachments.length} attachment{t.attachments.length > 1 ? "s" : ""}
              </div>
            ) : null}

            {/* Reporter + Assignee */}
            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "6px 0 4px" }} />
            {t.reporter_email ? (
              <div style={{ fontSize: 8, color: "#9ca3af", marginBottom: 2, display: "flex", gap: 4 }}>
                <span style={{ fontWeight: 700, color: "#6b7280" }}>FROM</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {t.reporter_email}
                </span>
              </div>
            ) : null}
            {t.assigned_to_email ? (
              <div style={{ fontSize: 8, display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: isMyTicket ? "#7c3aed" : "#6b7280" }}>
                  {isMyTicket ? "YOU ▶" : "WORKING"}
                </span>
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  color: isMyTicket ? "#7c3aed" : "#9ca3af",
                }}>
                  {isMyTicket ? "on this ticket" : t.assigned_to_email}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 8, color: "#d1d5db" }}>WAITING FOR PICKUP</div>
            )}

            {/* Barcode */}
            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "8px 0 4px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, marginBottom: 2 }}>
                {t.id
                  .replace(/-/g, "")
                  .slice(0, 14)
                  .split("")
                  .map((c, i) => {
                    const w = [1, 2, 1, 3, 2, 1][parseInt(c, 16) % 6];
                    return (
                      <span
                        key={i}
                        style={{
                          display: "inline-block",
                          width: w,
                          height: 18,
                          background: "#374151",
                          marginRight: 1,
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
              </div>
              <div style={{ fontSize: 7, color: "#9ca3af", letterSpacing: "0.12em" }}>
                {t.id.slice(0, 8).toUpperCase()}
              </div>
            </div>

            {/* Action buttons */}
            <div
              style={{ borderTop: "1px dashed #e5e7eb", marginTop: 8, paddingTop: 7 }}
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          </div>

          {/* Perforated bottom edge */}
          <div
            style={{
              height: 10,
              backgroundImage: `radial-gradient(circle at 8px 10px, ${PAGE_BG} 5px, transparent 5px)`,
              backgroundSize: "16px 100%",
              backgroundRepeat: "repeat-x",
            }}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen px-5 pt-20 pb-16" style={{ background: PAGE_BG }}>
      {/* Kitchen atmosphere lighting */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              radial-gradient(ellipse 900px 420px at 15% 15%, rgba(124,58,237,0.10), transparent 60%),
              radial-gradient(ellipse 720px 360px at 80% 20%, rgba(168,85,247,0.10), transparent 55%),
              radial-gradient(ellipse 900px 520px at 50% 110%, rgba(0,0,0,0.65), transparent 65%),
              linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.75))
            `,
          }}
        />
      </div>

      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-10">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.2)",
              }}
            >
              <TicketIcon className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Bug Tickets</h1>
              <p className="text-xs text-zinc-500 mt-1">Add ticket → incoming → in progress → finished.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-violet-600 hover:bg-violet-500 text-white font-black text-xs uppercase tracking-wide"
            >
              + Add Ticket
            </Button>
            <Button
              variant="secondary"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
              onClick={() => ticketsQ.refetch()}
              disabled={ticketsQ.isFetching}
            >
              {ticketsQ.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">Add Ticket</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Log a bug ticket. Tag with <span className="text-zinc-300">@name</span> or <span className="text-zinc-300">@phone</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">Ticket title (optional)</p>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="(auto from first line if empty)"
                  className="bg-zinc-950/60 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">Urgency</p>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as any)}
                  className="w-full h-10 rounded-md bg-zinc-950/60 border border-white/10 text-white px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] text-zinc-500 mb-1">Tag / Mention</p>
                <TagField tags={tags} onChange={setTags} placeholder="@Aditi or @12382407495800" />
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] text-zinc-500 mb-1">Problem description</p>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={"1. Problem Description:\n2. Urgency:\n3. Screenshot attached"}
                  className="min-h-[160px] bg-zinc-950/60 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] text-zinc-500 mb-1">Attachments (images/videos)</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-200 bg-white/5 border border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:bg-white/10">
                    <Paperclip className="w-4 h-4" />
                    Add files
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => appendFiles(Array.from(e.target.files || []))}
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    {files.length === 0 ? "No files selected" : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
                  </p>
                </div>
                <p className="text-[11px] text-zinc-600 mt-2">
                  Tip: paste screenshots here with <span className="text-zinc-400 font-semibold">Ctrl+V</span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                onClick={() => setCreateOpen(false)}
                disabled={createMut.isPending}
              >
                Close
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!description.trim() || createMut.isPending}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Add Ticket
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ticket detail */}
        <Dialog
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setSelectedTicketId(null);
          }}
        >
          <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-white">
                Order #{selectedTicket?.ticket_number ?? "—"} {selectedTicket?.title ? `· ${selectedTicket.title}` : ""}
              </DialogTitle>
              <DialogDescription className="text-zinc-500">
                {selectedTicket?.assigned_to_email ? `Assigned to ${selectedTicket.assigned_to_email}` : "Unassigned"}
              </DialogDescription>
            </DialogHeader>

            {!selectedTicket ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-full border",
                      (String(selectedTicket.urgency || "normal").toLowerCase() === "urgent")
                        ? "bg-red-500/10 text-red-200 border-red-500/25"
                        : (String(selectedTicket.urgency || "normal").toLowerCase() === "low")
                          ? "bg-sky-500/10 text-sky-200 border-sky-500/20"
                          : "bg-amber-500/10 text-amber-200 border-amber-500/20",
                    )}
                  >
                    {(selectedTicket.urgency || "normal").toString().toUpperCase()}
                  </span>
                  <span className={cn("text-[11px] px-2 py-1 rounded-full border", statusBadge(String(selectedTicket.status || "not_started")))}>
                    {(selectedTicket.status || "not_started").toString().replace("_", " ").toUpperCase()}
                  </span>
                  {selectedTicket.tags?.map((t) => (
                    <span key={t} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200 inline-flex items-center gap-1">
                      {t.startsWith("@") ? <AtSign className="w-3 h-3 opacity-70" /> : null}
                      <span>{t.startsWith("@") ? t.slice(1) : t}</span>
                    </span>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Problem description</p>
                  <p className="text-sm text-zinc-200 mt-2 whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.description}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Attachments</p>
                  {selectedTicket.attachments?.length ? (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedTicket.attachments.map((a) => {
                        const rt = String(a.resource_type || "");
                        const isImg = rt === "image" || a.secure_url.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
                        const isVid = rt === "video" || a.secure_url.match(/\.(mp4|webm|mov)(\?|$)/i);
                        return (
                          <a
                            key={a.public_id}
                            href={a.secure_url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:border-amber-300/30 transition-colors"
                            title="Open in new tab"
                          >
                            <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-white/10 truncate">
                              {a.original_filename || a.public_id}
                            </div>
                            <div className="aspect-video bg-zinc-900/40">
                              {isImg ? (
                                <img src={a.secure_url} alt={a.original_filename || "attachment"} className="h-full w-full object-cover" />
                              ) : isVid ? (
                                <video src={a.secure_url} className="h-full w-full object-cover" controls />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
                                  {rt || "file"}
                                </div>
                              )}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 mt-2">No attachments</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    {selectedTicket.status !== "in_progress" && (
                      <Button
                        variant="secondary"
                        className="bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 text-xs"
                        onClick={() => {
                          if (!selectedTicket) return;
                          patchMut.mutate({ id: selectedTicket.id, patch: { status: "in_progress", assigned_to_email: user?.email || null } });
                          setDetailOpen(false);
                        }}
                        disabled={patchMut.isPending}
                      >
                        Take Ticket
                      </Button>
                    )}
                    {selectedTicket.status !== "resolved" && (
                      <Button
                        variant="secondary"
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs"
                        onClick={() => {
                          if (!selectedTicket) return;
                          patchMut.mutate({ id: selectedTicket.id, patch: { status: "resolved" } });
                          setDetailOpen(false);
                        }}
                        disabled={patchMut.isPending}
                      >
                        Mark Finished ✓
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                      onClick={() => setDetailOpen(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="secondary"
                      className="bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-zinc-400 hover:text-red-400"
                      onClick={() => {
                        if (!selectedTicket) return;
                        if (!confirm(`Delete ticket #${selectedTicket.ticket_number ?? "—"}?`)) return;
                        deleteMut.mutate(selectedTicket.id);
                        setDetailOpen(false);
                      }}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Kitchen rail sections */}
        <div className="space-y-12">
          {COLUMNS.filter((c) => c.key !== "resolved").map((col) => (
            <div key={col.key}>
              {/* Section label */}
              <div className="flex items-center gap-3 mb-5 px-1">
                <span className="text-xs font-black uppercase tracking-[0.25em] text-violet-400">
                  {col.title}
                </span>
                <span className="text-zinc-700 text-xs">—</span>
                <span className="text-xs text-zinc-600">{col.hint}</span>
                <span className="ml-auto">
                  <Badge className="bg-white/5 border-white/10 text-zinc-200 text-xs font-black">
                    {byStatus[col.key].length}
                  </Badge>
                </span>
              </div>

              {/* Rail assembly */}
              <div className="relative">
                {/* Left wall bracket */}
                <div className="absolute left-0 top-0 z-10 flex flex-col items-center" style={{ width: 18 }}>
                  <div
                    style={{
                      width: 14,
                      height: 28,
                      background: "linear-gradient(to right, #374151, #6b7280, #374151)",
                      borderRadius: "3px 3px 2px 2px",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 2px 0 8px rgba(0,0,0,0.4)",
                    }}
                  />
                </div>
                {/* Right wall bracket */}
                <div className="absolute right-0 top-0 z-10 flex flex-col items-center" style={{ width: 18 }}>
                  <div
                    style={{
                      width: 14,
                      height: 28,
                      background: "linear-gradient(to right, #374151, #6b7280, #374151)",
                      borderRadius: "3px 3px 2px 2px",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), -2px 0 8px rgba(0,0,0,0.4)",
                    }}
                  />
                </div>

                {/* Steel rail rod */}
                <div
                  style={{
                    height: 14,
                    borderRadius: 7,
                    background:
                      "linear-gradient(to bottom, #c8ced6 0%, #e2e8f0 22%, #94a3b8 50%, #e2e8f0 78%, #c8ced6 100%)",
                    boxShadow:
                      "0 8px 20px rgba(0,0,0,0.85), 0 3px 6px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(0,0,0,0.18)",
                    margin: "0 4px",
                  }}
                />

                {/* Drop zone + hanging tickets */}
                <div
                  className="min-h-[220px] pb-8 pt-1"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const id = dragIdRef.current;
                    if (!id) return;
                    moveTicket(id, col.key);
                    dragIdRef.current = null;
                  }}
                >
                  {byStatus[col.key].length === 0 ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <p
                        style={{
                          fontSize: 11,
                          color: "#3f3f46",
                          border: "2px dashed #27272a",
                          borderRadius: 12,
                          padding: "20px 40px",
                          fontFamily: "'Courier New', Courier, monospace",
                          letterSpacing: "0.05em",
                        }}
                      >
                        No tickets — drop or create one
                      </p>
                    </div>
                  ) : (
                    <motion.div layout className="flex gap-6 overflow-x-auto pb-4 pt-2 px-6" style={{ scrollbarWidth: "thin" }}>
                      <AnimatePresence initial={false}>
                        {byStatus[col.key].map((t) => (
                          <ReceiptTicket
                            key={t.id}
                            t={t}
                            actions={
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <button
                                  type="button"
                                  style={{
                                    height: 24,
                                    width: 24,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 3,
                                    background: "transparent",
                                    cursor: "pointer",
                                    color: "#9ca3af",
                                    flexShrink: 0,
                                    fontFamily: "'Courier New', Courier, monospace",
                                  }}
                                  title="Delete order"
                                  onClick={() => {
                                    if (!confirm(`Delete #${t.ticket_number}?`)) return;
                                    deleteMut.mutate(t.id);
                                  }}
                                  disabled={deleteMut.isPending}
                                >
                                  <Trash2 style={{ width: 11, height: 11 }} />
                                </button>
                                {col.key === "not_started" ? (
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      height: 24,
                                      fontSize: 8,
                                      fontWeight: 900,
                                      letterSpacing: "0.12em",
                                      textTransform: "uppercase",
                                      border: "1px solid #6d28d9",
                                      borderRadius: 3,
                                      background: "#ede9fe",
                                      color: "#4c1d95",
                                      cursor: "pointer",
                                      fontFamily: "'Courier New', Courier, monospace",
                                    }}
                                    onClick={() => patchMut.mutate({ id: t.id, patch: { status: "in_progress", assigned_to_email: user?.email || null } })}
                                    disabled={patchMut.isPending}
                                  >
                                    TAKE TICKET
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      height: 24,
                                      fontSize: 8,
                                      fontWeight: 900,
                                      letterSpacing: "0.12em",
                                      textTransform: "uppercase",
                                      border: "1px solid #065f46",
                                      borderRadius: 3,
                                      background: "#d1fae5",
                                      color: "#065f46",
                                      cursor: "pointer",
                                      fontFamily: "'Courier New', Courier, monospace",
                                    }}
                                    onClick={() => patchMut.mutate({ id: t.id, patch: { status: "resolved" } })}
                                    disabled={patchMut.isPending}
                                  >
                                    FINISH ✓
                                  </button>
                                )}
                              </div>
                            }
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Served / Spike pile */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-emerald-400" />
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      color: "#34d399",
                    }}
                  >
                    Finished
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">Completed tickets, filed away.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 text-xs font-black">
                  {resolvedCount}
                </Badge>
                <Button
                  variant="secondary"
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs"
                  onClick={() => setResolvedOpen((v) => !v)}
                >
                  {resolvedOpen ? "Hide" : "Show"}
                </Button>
              </div>
            </div>

            {resolvedOpen ? (
              <div
                className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 min-h-[110px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const id = dragIdRef.current;
                  if (!id) return;
                  moveTicket(id, "resolved");
                  dragIdRef.current = null;
                }}
              >
                {byStatus.resolved.length === 0 ? (
                  <p className="text-xs text-zinc-700 text-center py-6 md:col-span-2 lg:col-span-3 xl:col-span-4">No completed orders</p>
                ) : (
                  byStatus.resolved.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => { dragIdRef.current = t.id; }}
                      className="rounded-xl border border-white/10 bg-zinc-950/40 p-3 cursor-pointer hover:bg-zinc-950/60 transition-colors"
                      onClick={() => { setSelectedTicketId(t.id); setDetailOpen(true); }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">FINISHED ✓</p>
                          <p className="text-xs text-zinc-500">#{t.ticket_number ?? "—"}</p>
                          <p className="text-sm font-bold text-white truncate mt-0.5">{t.title || "Order"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-colors"
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`Delete #${t.ticket_number}?`)) return;
                              deleteMut.mutate(t.id);
                            }}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                            onClick={(e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, patch: { status: "in_progress" } }); }}
                            disabled={patchMut.isPending}
                          >
                            Reopen
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 whitespace-pre-wrap">{t.description}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-6">
                {byStatus.resolved.length === 0 ? (
                  <p className="text-xs text-zinc-700 text-center py-6">No completed orders</p>
                ) : (
                  <div className="relative h-[150px]">
                    {byStatus.resolved.slice(0, 5).map((t, idx) => (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 12, rotate: cardTilt(t.id) }}
                        animate={{ opacity: 1, y: 0, rotate: cardTilt(t.id) }}
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          transform: `translate(${idx * 14}px, ${idx * 7}px) rotate(${cardTilt(t.id)}deg)`,
                          width: "min(380px, 88vw)",
                          background: "#fefdf4",
                          fontFamily: "'Courier New', Courier, monospace",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                          borderRadius: 6,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, color: "#059669", letterSpacing: "0.1em" }}>FINISHED ✓</span>
                          <span style={{ fontSize: 9, color: "#9ca3af" }}>#{t.ticket_number}</span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{t.title || "Order"}</p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "#6b7280",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {t.description}
                        </p>
                      </motion.div>
                    ))}
                    <div className="absolute right-0 bottom-0 text-[11px] text-zinc-600">
                      {byStatus.resolved.length > 5 ? `+${byStatus.resolved.length - 5} more` : ""}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
