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
import { AtSign, GripVertical, Layers, Loader2, Paperclip, Send, Ticket as TicketIcon, Trash2, User } from "lucide-react";

type Column = { key: TicketStatus; title: string; hint: string };
const COLUMNS: Column[] = [
  { key: "not_started", title: "Not started", hint: "New tickets waiting for pickup" },
  { key: "in_progress", title: "In progress", hint: "Currently being worked on" },
  { key: "resolved", title: "Resolved", hint: "Done (goes to stack)" },
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

export default function Tickets() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<TicketUrgency>("normal");
  const [tags, setTags] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const ticketsQ = useQuery<Ticket[]>({
    queryKey: ["tickets"],
    queryFn: () => getTickets(),
    refetchInterval: 20_000,
  });

  const prevRef = useRef<Record<string, { status?: string; assigned_to_email?: string | null; updated_at?: string }>>({});

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

    for (const t of rows) {
      const pid = prev[t.id];
      const nowAssigned = (t.assigned_to_email || "").toLowerCase();
      const wasAssigned = (pid?.assigned_to_email || "").toLowerCase();
      const nowStatus = String(t.status || "");
      const wasStatus = String(pid?.status || "");

      const relevant = nowAssigned === email || (t.reporter_email || "").toLowerCase() === email;

      if (pid) {
        if (nowAssigned === email && wasAssigned !== email) {
          toast(`Ticket #${t.ticket_number ?? "—"} assigned to you`);
        } else if (relevant && nowStatus !== wasStatus && nowStatus === "resolved") {
          toast.success(`Ticket #${t.ticket_number ?? "—"} resolved`);
        }
      }
    }

    prevRef.current = Object.fromEntries(
      rows.map((t) => [t.id, { status: t.status, assigned_to_email: t.assigned_to_email, updated_at: t.updated_at }]),
    );
  }, [ticketsQ.data, user?.email]);

  const createMut = useMutation({
    mutationFn: async () => {
      const base = await createTicket({
        title: title.trim() || undefined,
        description,
        urgency,
        status: "not_started",
        tags,
        reporter_email: user?.email || undefined,
        assigned_to_email: assignedTo.trim() || null,
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
      toast.success("Ticket created");
      setTitle("");
      setDescription("");
      setUrgency("normal");
      setTags([]);
      setAssignedTo("");
      setFiles([]);
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create ticket"),
  });

  const patchMut = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Ticket> }) => patchTicket(args.id, args.patch as any),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update ticket"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteTicket(id),
    onSuccess: async () => {
      toast.success("Ticket deleted");
      await qc.invalidateQueries({ queryKey: ["tickets"] });
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
    // stable pseudo-random tilt per ticket id (no deps)
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((h % 7) - 3) * 0.8; // -2.4..+2.4 degrees
  };

  const PaperTicket = ({ t, actions }: { t: Ticket; actions: ReactNode }) => {
    const tilt = cardTilt(t.id);
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10, rotate: tilt }}
        animate={{ opacity: 1, y: 0, rotate: tilt }}
        exit={{ opacity: 0, y: 10, rotate: tilt }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        draggable
        onDragStart={() => {
          dragIdRef.current = t.id;
        }}
        onClick={() => {
          setSelectedTicketId(t.id);
          setDetailOpen(true);
        }}
        className={cn(
          "relative w-[260px] max-w-[82vw] shrink-0 rounded-xl",
          // warm paper
          "border border-amber-200/60 bg-gradient-to-b from-amber-50/95 to-amber-100/75",
          "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
        )}
      >
        {/* hook + perforated edge */}
        <div className="absolute left-1/2 -top-2 -translate-x-1/2 h-4 w-4 rounded-full border border-zinc-900/20 bg-amber-50 shadow-[0_10px_30px_rgba(0,0,0,0.25)]" />
        <div className="absolute inset-x-0 -top-[1px] h-[10px] overflow-hidden rounded-t-xl opacity-70">
          <div className="h-[10px] w-full [background:radial-gradient(circle_at_6px_6px,transparent_4px,rgba(24,24,27,0.12)_4.5px)] [background-size:12px_12px]" />
        </div>

        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black tracking-wide text-zinc-900">
                  #{t.ticket_number ?? "—"}
                </span>
                {t.tags?.[0] ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900/5 border border-zinc-900/10 text-zinc-900">
                    {t.tags[0]}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border",
                    // urgency pill but adapted to light paper
                    (String(t.urgency || "normal").toLowerCase() === "urgent")
                      ? "bg-red-500/10 text-red-900 border-red-500/25"
                      : (String(t.urgency || "normal").toLowerCase() === "low")
                        ? "bg-sky-500/10 text-sky-900 border-sky-500/20"
                        : "bg-amber-500/10 text-amber-950 border-amber-500/20",
                  )}
                >
                  {(t.urgency || "normal").toString().toUpperCase()}
                </span>
              </div>
              <p className="text-[13px] font-black text-zinc-950 mt-1 truncate">
                {(t.title || "").trim() || "Problem"}
              </p>
            </div>
            {actions}
          </div>

          <p className="text-[12px] text-zinc-800 mt-2 line-clamp-3 whitespace-pre-wrap">
            {t.description}
          </p>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {!!t.tags?.length && (
              <div className="flex items-center gap-1 flex-wrap">
                {t.tags.slice(1, 3).map((x) => (
                  <span key={x} className="text-[10px] px-2 py-1 rounded-full bg-zinc-900/5 border border-zinc-900/10 text-zinc-800">
                    {x}
                  </span>
                ))}
                {t.tags.length > 3 ? (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-900/5 border border-zinc-900/10 text-zinc-600">
                    +{t.tags.length - 3}
                  </span>
                ) : null}
              </div>
            )}
            {t.attachments?.length ? (
              <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-900/5 border border-zinc-900/10 text-zinc-800 inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                {t.attachments.length}
              </span>
            ) : null}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-5 pt-20 pb-12">
      {/* cozy vignette */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_15%_15%,rgba(245,158,11,0.10),transparent_60%),radial-gradient(720px_360px_at_80%_20%,rgba(168,85,247,0.10),transparent_55%),radial-gradient(900px_520px_at_50%_110%,rgba(0,0,0,0.65),transparent_65%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.75))]" />
      </div>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <TicketIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Tickets</h1>
                <p className="text-xs text-zinc-500 mt-1">Chef-style slips: pick up → work → stack.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-500 text-white">
              New ticket
            </Button>
            <Button
              variant="secondary"
              className={cn("bg-white/5 hover:bg-white/10 border border-white/10 text-white")}
              onClick={() => ticketsQ.refetch()}
              disabled={ticketsQ.isFetching}
            >
              {ticketsQ.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">New ticket</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Paste in the WhatsApp format. Tag like <span className="text-zinc-300">@12382407495800</span>.
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1">Assign to (email)</p>
                  <Input
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="aditi@..."
                    className="bg-zinc-950/60 border-white/10 text-white placeholder:text-zinc-600"
                  />
                </div>
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
                      onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    {files.length === 0 ? "No files selected" : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                className={cn("bg-white/5 hover:bg-white/10 border border-white/10 text-white")}
                onClick={() => setCreateOpen(false)}
                disabled={createMut.isPending}
              >
                Close
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!description.trim() || createMut.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Create ticket
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
                Ticket #{selectedTicket?.ticket_number ?? "—"} {selectedTicket?.title ? `· ${selectedTicket.title}` : ""}
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

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                    onClick={() => setDetailOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="secondary"
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
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
            )}
          </DialogContent>
        </Dialog>

        {/* Ticket rail */}
        <div className="mt-6 space-y-4">
          {COLUMNS.filter((c) => c.key !== "resolved").map((col) => (
            <div key={col.key} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">{col.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{col.hint}</p>
                </div>
                <Badge className="bg-white/5 border-white/10 text-zinc-200">{byStatus[col.key].length}</Badge>
              </div>

              <div
                className={cn(
                  "relative px-4 py-3",
                  "before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-white/5",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const id = dragIdRef.current;
                  if (!id) return;
                  moveTicket(id, col.key);
                  dragIdRef.current = null;
                }}
              >
                {/* rail bar */}
                <div className="absolute left-4 right-4 top-3 h-[2px] rounded-full bg-white/12" />

                {byStatus[col.key].length === 0 ? (
                  <p className="text-xs text-zinc-600 px-2 py-8 text-center">Nothing here</p>
                ) : (
                  <motion.div layout className="mt-5 flex gap-3 overflow-x-auto pb-2 pr-2">
                    <AnimatePresence initial={false}>
                      {byStatus[col.key].map((t) => (
                        <PaperTicket
                          key={t.id}
                          t={t}
                          actions={
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="h-7 w-7 rounded-lg border border-zinc-900/10 bg-zinc-900/5 hover:bg-zinc-900/10 text-zinc-900 flex items-center justify-center"
                                title="Delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!confirm(`Delete ticket #${t.ticket_number ?? "—"}?`)) return;
                                  deleteMut.mutate(t.id);
                                }}
                                disabled={deleteMut.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {col.key === "not_started" ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-3 text-xs bg-zinc-900/5 hover:bg-zinc-900/10 border border-zinc-900/10 text-zinc-900"
                                  onClick={(e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, patch: { status: "in_progress" } }); }}
                                  disabled={patchMut.isPending}
                                >
                                  Take
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-3 text-xs bg-zinc-900/5 hover:bg-zinc-900/10 border border-zinc-900/10 text-zinc-900"
                                  onClick={(e) => { e.stopPropagation(); patchMut.mutate({ id: t.id, patch: { status: "resolved" } }); }}
                                  disabled={patchMut.isPending}
                                >
                                  Stack
                                </Button>
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
          ))}

          {/* Resolved stack */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-black text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-300" />
                  Resolved stack
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Collapsed pile of completed tickets.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-200">{resolvedCount}</Badge>
                <Button
                  variant="secondary"
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                  onClick={() => setResolvedOpen((v) => !v)}
                >
                  {resolvedOpen ? "Hide" : "Show"}
                </Button>
              </div>
            </div>

            {resolvedOpen ? (
              <div
                className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 min-h-[110px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const id = dragIdRef.current;
                  if (!id) return;
                  moveTicket(id, "resolved");
                  dragIdRef.current = null;
                }}
              >
                {byStatus.resolved.length === 0 ? (
                  <p className="text-xs text-zinc-600 px-2 py-6 text-center md:col-span-2 lg:col-span-3">No resolved tickets</p>
                ) : (
                  byStatus.resolved.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => {
                        dragIdRef.current = t.id;
                      }}
                      className="rounded-xl border border-white/10 bg-zinc-950/30 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">#{t.ticket_number ?? "—"} · {t.title || "Ticket"}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{t.tags?.[0] || ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200 flex items-center justify-center"
                            title="Delete"
                            onClick={() => {
                              if (!confirm(`Delete ticket #${t.ticket_number ?? "—"}?`)) return;
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
                            onClick={() => patchMut.mutate({ id: t.id, patch: { status: "in_progress" } })}
                            disabled={patchMut.isPending}
                          >
                            Reopen
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 mt-2 line-clamp-3 whitespace-pre-wrap">{t.description}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-6">
                {byStatus.resolved.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center py-6">No resolved tickets</p>
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
                          transform: `translate(${idx * 12}px, ${idx * 8}px) rotate(${cardTilt(t.id)}deg)`,
                          width: "min(420px, 92vw)",
                        }}
                        className="rounded-xl border border-white/10 bg-zinc-950/30 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
                      >
                        <div className="p-3">
                          <p className="text-sm font-bold text-white truncate">#{t.ticket_number ?? "—"} · {t.title || "Ticket"}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{t.tags?.[0] || ""}</p>
                          <p className="text-xs text-zinc-300 mt-2 line-clamp-2 whitespace-pre-wrap">{t.description}</p>
                        </div>
                      </motion.div>
                    ))}
                    <div className="absolute right-0 bottom-0 text-[11px] text-zinc-500">
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

