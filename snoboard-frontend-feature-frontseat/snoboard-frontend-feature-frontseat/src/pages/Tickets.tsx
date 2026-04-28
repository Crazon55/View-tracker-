import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  createTicket,
  getTickets,
  patchTicket,
  signTicketCloudinaryUpload,
  type Ticket,
  type TicketAttachment,
  type TicketStatus,
  type TicketUrgency,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Paperclip, Plus, Send, Stack, Ticket as TicketIcon } from "lucide-react";

type Column = { key: TicketStatus; title: string; hint: string };
const COLUMNS: Column[] = [
  { key: "not_started", title: "Not started", hint: "New tickets waiting for pickup" },
  { key: "in_progress", title: "In progress", hint: "Currently being worked on" },
  { key: "resolved", title: "Resolved", hint: "Done (goes to stack)" },
];

function normalizeTags(raw: string): string[] {
  const s = (raw || "").trim();
  if (!s) return [];
  return s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith("@") ? x : x));
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
  const [tagsRaw, setTagsRaw] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedOpen, setResolvedOpen] = useState(false);

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
      const tags = normalizeTags(tagsRaw);
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
      setTagsRaw("");
      setAssignedTo("");
      setFiles([]);
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

  const resolvedCount = byStatus.resolved.length;

  return (
    <div className="min-h-screen bg-zinc-950 px-5 pt-20 pb-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <TicketIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Tickets</h1>
                <p className="text-xs text-zinc-500 mt-1">Turn WhatsApp bug reports into a clean queue + attachments.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/5 border-white/10 text-zinc-200">
              {ticketsQ.data?.length || 0} total
            </Badge>
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

        {/* Create form */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-white">Create a ticket</p>
            <p className="text-[11px] text-zinc-500">
              Format: tags like <span className="text-zinc-300">@12382407495800</span> (comma separated)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <p className="text-[11px] text-zinc-500 mb-1">Title (optional)</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Team performance page blank"
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
              <p className="text-[11px] text-zinc-500 mb-1">Tags</p>
              <Input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="@123..., urgent, ios"
                className="bg-zinc-950/60 border-white/10 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] text-zinc-500 mb-1">Problem description</p>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={"1. Problem Description:\n2. Urgency:\n3. Screenshot attached"}
                className="min-h-[120px] bg-zinc-950/60 border-white/10 text-white placeholder:text-zinc-600"
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
                    onChange={(e) => {
                      const next = Array.from(e.target.files || []);
                      setFiles(next);
                    }}
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  {files.length === 0 ? "No files selected" : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end">
            <Button
              onClick={() => createMut.mutate()}
              disabled={!description.trim() || createMut.isPending}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Create ticket
            </Button>
          </div>
        </div>

        {/* Queue */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.filter((c) => c.key !== "resolved").map((col) => (
            <div key={col.key} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">{col.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{col.hint}</p>
                </div>
                <Badge className="bg-white/5 border-white/10 text-zinc-200">{byStatus[col.key].length}</Badge>
              </div>
              <div className="p-3 space-y-2">
                {byStatus[col.key].length === 0 ? (
                  <p className="text-xs text-zinc-600 px-2 py-6 text-center">Nothing here</p>
                ) : (
                  byStatus[col.key].map((t) => (
                    <div key={t.id} className="rounded-xl border border-white/10 bg-zinc-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {t.title || "Ticket"}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                            #{t.ticket_number ?? "—"} · {t.reporter_email || "unknown"}{t.assigned_to_email ? ` → ${t.assigned_to_email}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={cn("text-[10px] px-2 py-1 rounded-full border", urgencyPill(String(t.urgency || "normal")))}>
                            {(t.urgency || "normal").toString().toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 mt-2 line-clamp-3 whitespace-pre-wrap">
                        {t.description}
                      </p>

                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className={cn("text-[10px] px-2 py-1 rounded-full border", statusBadge(String(t.status || "not_started")))}>
                          {(t.status || "not_started").toString().replace("_", " ").toUpperCase()}
                        </span>
                        {!!t.tags?.length && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {t.tags.slice(0, 3).map((x) => (
                              <span key={x} className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200">
                                {x}
                              </span>
                            ))}
                            {t.tags.length > 3 ? (
                              <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                                +{t.tags.length - 3}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {t.attachments?.length ? (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200 inline-flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {t.attachments.length}
                          </span>
                        ) : null}

                        <div className="ml-auto flex items-center gap-2">
                          {col.key === "not_started" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                              onClick={() => patchMut.mutate({ id: t.id, patch: { status: "in_progress" } })}
                              disabled={patchMut.isPending}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Start
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                              onClick={() => patchMut.mutate({ id: t.id, patch: { status: "resolved" } })}
                              disabled={patchMut.isPending}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>

                      {t.attachments?.length ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {t.attachments.slice(0, 4).map((a) => (
                            <a
                              key={a.public_id}
                              href={a.secure_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-violet-500/30 transition-colors"
                              title="Open attachment"
                            >
                              <div className="px-2 py-1 text-[10px] text-zinc-400 border-b border-white/5 truncate">
                                {a.original_filename || a.public_id}
                              </div>
                              <div className="aspect-video bg-zinc-900/40 flex items-center justify-center text-[10px] text-zinc-500">
                                {(a.resource_type || "file").toString()}
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {/* Resolved stack */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden lg:col-span-3">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-black text-white flex items-center gap-2">
                  <Stack className="w-4 h-4 text-emerald-300" />
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
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {byStatus.resolved.length === 0 ? (
                  <p className="text-xs text-zinc-600 px-2 py-6 text-center md:col-span-2 lg:col-span-3">No resolved tickets</p>
                ) : (
                  byStatus.resolved.map((t) => (
                    <div key={t.id} className="rounded-xl border border-white/10 bg-zinc-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{t.title || "Ticket"}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">#{t.ticket_number ?? "—"}</p>
                        </div>
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
                      <p className="text-xs text-zinc-300 mt-2 line-clamp-3 whitespace-pre-wrap">{t.description}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-5">
                  <p className="text-sm font-bold text-emerald-100">Pile view</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Click <span className="text-white">Show</span> to expand the stack. This keeps the main queue clean.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

