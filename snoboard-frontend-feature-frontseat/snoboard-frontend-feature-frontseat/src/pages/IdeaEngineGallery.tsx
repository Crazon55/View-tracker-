// Idea Engine — centralized gallery of ideas across ALL playbooks (Bizz / XF / Tech).
// Content Strategists land here. Ideas are shown flat (not grouped by playbook): each
// card surfaces who made it, total views, and which pages it was already posted on
// (so the same idea isn't re-posted), plus a button to open it in its playbook.
// Date-driven — always lands on today; yesterday is one click away. No "All" firehose.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ExternalLink, Eye, Search, X, Check, CalendarDays, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { FramerPage, PageHeader } from "@/components/framer/Framer";
import { Calendar as DayCalendar } from "@/components/ui/calendar";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { canonicalRole } from "@/lib/accessModel";
import { createExpApi, type ExpApi } from "@/services/api";
import { PLAYBOOK_CONFIGS, type PlaybookId } from "@/lib/playbookExperimentConfig";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PLAYBOOKS: PlaybookId[] = ["bpb", "xf", "tech"];
const PB_SHORT: Record<PlaybookId, string> = { bpb: "Bizz", xf: "XF", tech: "Tech" };
const PB_ACCENT: Record<PlaybookId, string> = { bpb: "#a78bfa", xf: "#f472b6", tech: "#38bdf8" };

// Where a playbook shortcut should land, by role: CS + VE → Content Distribution
// (frontseat). Others use the playbook's own default.
function shortcutTabForRole(role: string | null | undefined): "frontseat" | "idea-bank" | null {
  const roles = String(role || "").split(",").map((r) => canonicalRole(r.trim()));
  if (roles.includes("ve") || roles.includes("cs")) return "frontseat";
  return null;
}

// One ExpApi per playbook, memoised at module load (they're just closures over a base URL).
const PB_API: Record<PlaybookId, ExpApi> = {
  bpb: createExpApi("bpb"),
  xf: createExpApi("xf"),
  tech: createExpApi("tech"),
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TODAY = ymd(new Date());
const YESTERDAY = ymd(new Date(Date.now() - 86400000));

function sumViews(idea: any): number {
  const pv = idea.page_views as Record<string, number> | undefined;
  if (pv && Object.keys(pv).length) return Object.values(pv).reduce((a, b) => a + (Number(b) || 0), 0);
  return Number(idea.views) || 0;
}
function pagesOf(idea: any): string[] {
  return String(idea.page_handle || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Per-page views for a single idea_bank row: prefer the page_views map, else put the
// row's total on its one page, else 0 per listed page.
function perPageViews(idea: any): Record<string, number> {
  const pv = (idea.page_views || {}) as Record<string, number>;
  const pages = pagesOf(idea);
  const out: Record<string, number> = {};
  if (Object.keys(pv).length) {
    for (const [p, v] of Object.entries(pv)) out[p.trim()] = Number(v) || 0;
  } else if (pages.length === 1) {
    out[pages[0]] = Number(idea.views) || 0;
  } else {
    for (const p of pages) out[p] = 0;
  }
  return out;
}

// The backend stores each posting as its own row (same topic, different pages). Collapse
// same-topic rows within a playbook into one card that unions their pages + views.
function mergeIdeasByTopic(list: any[]): any[] {
  const map = new Map<string, any>();
  for (const idea of list) {
    const topic = String(idea.topic || "").trim();
    // Untitled ideas stay separate (keyed by id) so they don't all collapse together.
    const key = topic ? `${idea._playbook}::${topic.toLowerCase()}` : `${idea._playbook}::__${idea.id}`;
    let g = map.get(key);
    if (!g) {
      g = { ...idea, page_views: {}, _deployed: new Set<string>() };
      map.set(key, g);
    }
    const pv = g.page_views as Record<string, number>;
    for (const [p, v] of Object.entries(perPageViews(idea))) pv[p] = Math.max(pv[p] || 0, v);
    if (!g.created_by && idea.created_by) g.created_by = idea.created_by;
    // Links live on whichever row has them (e.g. the posted copy, not the empty pool
    // card) — fill from any row so the merged card actually surfaces them.
    for (const f of ["comp_link", "yt_url", "yt_timestamps", "frame_link", "drive_link", "kalakar_link"]) {
      if (!g[f] && idea[f]) g[f] = idea[f];
    }
    // Prefer a real production status over the pool card's "new".
    if ((!g.status || g.status === "new") && idea.status) g.status = idea.status;
    for (const d of (idea.deployed_to_playbooks || [])) g._deployed.add(d);
  }
  return [...map.values()].map((g) => ({
    ...g,
    page_handle: Object.keys(g.page_views).join(","),
    views: Object.values(g.page_views as Record<string, number>).reduce((a, b) => a + b, 0),
    deployed_to_playbooks: [...g._deployed],
  }));
}
function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
function prettyDate(s: string): string {
  if (s === TODAY) return "Today";
  if (s === YESTERDAY) return "Yesterday";
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function isYouTube(url?: string): boolean {
  return !!url && /(?:youtube\.com|youtu\.be)/i.test(url);
}
// An idea is "existing" (rich card) once it carries real signal beyond a bare
// reference link — views, pages, or one of its production links. ≥2 signals ⇒ existing.
function ideaSignalCount(idea: any): number {
  let n = 0;
  if (sumViews(idea) > 0) n++;
  if (pagesOf(idea).length > 0) n++;
  if (idea.comp_link || idea.yt_url) n++;
  if (idea.kalakar_link) n++;
  if (idea.drive_link || idea.frame_link) n++;
  return n;
}
function isExistingIdea(idea: any): boolean {
  return ideaSignalCount(idea) >= 2;
}

type Idea = any & { _playbook: PlaybookId };

export default function IdeaEngineGallery() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role } = usePermissions();

  const [dayDate, setDayDate] = useState<string>(TODAY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pbFilter, setPbFilter] = useState<PlaybookId | "all">("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: ideas = [], isLoading } = useQuery<Idea[]>({
    queryKey: ["idea-engine", dayDate],
    queryFn: async () => {
      const perPb = await Promise.all(
        PLAYBOOKS.map((pb) =>
          PB_API[pb]
            .getIdeaBank({ day_date: dayDate, enrich_cross: true })
            .then((rows) => (rows || []).map((r: any) => ({ ...r, _playbook: pb })))
            .catch(() => [] as Idea[]),
        ),
      );
      return perPb.flat();
    },
    refetchOnWindowFocus: false,
  });

  // Collapse duplicate postings of the same idea into one card.
  const merged = useMemo(() => mergeIdeasByTopic(ideas), [ideas]);

  // Send an idea into a chosen playbook's Frontseat "Ideas Pool" (a fresh pool card
  // there), while a copy stays here. origin_* links it back so the source card shows
  // "Sent to …" — backend-derived via deployed_to_playbooks, so it survives reloads.
  const [sentLocal, setSentLocal] = useState<Record<string, PlaybookId[]>>({});
  const sendMut = useMutation({
    mutationFn: ({ idea, target }: { idea: Idea; target: PlaybookId }) => {
      const rootPb = (idea.origin_playbook || idea._playbook) as PlaybookId;
      const rootId = String(idea.origin_idea_id || idea.id);
      return PB_API[target].createIdea({
        page_handle: "",
        content_type: idea.content_type || "reel",
        topic: idea.topic || "",
        status: "new",
        frontseat_pool: true,
        day_date: TODAY,
        source: "idea_engine",
        created_by: idea.created_by || "",
        // Carry the idea's links so the target playbook keeps them — the base-edit
        // link (drive/frame) is what lets an existing idea skip straight to Base edit.
        comp_link: idea.comp_link || "",
        yt_url: idea.yt_url || "",
        yt_timestamps: idea.yt_timestamps || "",
        frame_link: idea.frame_link || "",
        drive_link: idea.drive_link || "",
        kalakar_link: idea.kalakar_link || "",
        origin_playbook: rootPb,
        origin_idea_id: rootId,
      });
    },
    onSuccess: (_d, { idea, target }) => {
      const key = `${idea._playbook}-${idea.id}`;
      setSentLocal((m) => ({ ...m, [key]: [...new Set([...(m[key] || []), target])] }));
      toast.success(`Sent to ${PLAYBOOK_CONFIGS[target].label} · Frontseat`);
      qc.invalidateQueries({ queryKey: ["idea-engine"] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't send idea"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged
      .filter((i) => (pbFilter === "all" ? true : i._playbook === pbFilter))
      .filter((i) => (q ? String(i.topic || "").toLowerCase().includes(q) || pagesOf(i).some((p) => p.toLowerCase().includes(q)) : true))
      .sort((a, b) => sumViews(b) - sumViews(a));
  }, [merged, pbFilter, search]);

  const countsByPb = useMemo(() => {
    const c: Record<string, number> = { all: merged.length };
    for (const pb of PLAYBOOKS) c[pb] = merged.filter((i) => i._playbook === pb).length;
    return c;
  }, [merged]);

  return (
    <FramerPage>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <PageHeader eyebrow="CONTENT · IDEA ENGINE" title="Idea Engine" />
        <button type="button" onClick={() => setShowAdd(true)} style={primaryBtn}>
          <Plus size={15} strokeWidth={2} /> New idea
        </button>
      </div>

      {/* Playbook shortcuts — jump straight into a playbook workspace. */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {PLAYBOOKS.map((pb) => (
          <button
            key={pb}
            type="button"
            onClick={() => {
              const t = shortcutTabForRole(role);
              navigate(t ? `${PLAYBOOK_CONFIGS[pb].route}?tab=${t}` : PLAYBOOK_CONFIGS[pb].route);
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              padding: "9px 15px", borderRadius: 11,
              border: `1px solid ${PB_ACCENT[pb]}44`,
              background: `${PB_ACCENT[pb]}14`,
              color: "var(--f-ink)", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PB_ACCENT[pb], flexShrink: 0 }} />
            {PLAYBOOK_CONFIGS[pb].label}
            <span style={{ color: PB_ACCENT[pb], fontSize: 15, lineHeight: 1 }}>→</span>
          </button>
        ))}
      </div>

      {/* Date rail — always lands on today, yesterday one click away, or pick a day. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        <DatePill active={dayDate === YESTERDAY} onClick={() => setDayDate(YESTERDAY)}>Yesterday</DatePill>
        <DatePill active={dayDate === TODAY} onClick={() => setDayDate(TODAY)}>Today</DatePill>
        <PickDayControl
          value={dayDate}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onChange={setDayDate}
        />
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", minWidth: 220 }}>
          <Search size={14} strokeWidth={1.6} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--f-faint)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topic or page…"
            className="fglass-input" style={{ width: "100%", borderRadius: 9, padding: "8px 10px 8px 32px", fontSize: 13 }} />
        </div>
      </div>

      {/* Playbook filter pills */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <FilterPill active={pbFilter === "all"} onClick={() => setPbFilter("all")} count={countsByPb.all}>All playbooks</FilterPill>
        {PLAYBOOKS.map((pb) => (
          <FilterPill key={pb} active={pbFilter === pb} onClick={() => setPbFilter(pb)} count={countsByPb[pb]} dot={PB_ACCENT[pb]}>
            {PLAYBOOK_CONFIGS[pb].label}
          </FilterPill>
        ))}
      </div>

      {/* Gallery */}
      {isLoading ? (
        <p className="seeding-muted" style={{ marginTop: 28 }}>Loading ideas…</p>
      ) : !filtered.length ? (
        <div style={{ marginTop: 28, textAlign: "center", padding: "64px 0", border: "1px dashed var(--f-line)", borderRadius: 16 }}>
          <div style={{ fontSize: 15, color: "var(--f-ink)" }}>No ideas for {prettyDate(dayDate).toLowerCase()}.</div>
          <div style={{ fontSize: 12.5, color: "var(--f-faint)", marginTop: 6 }}>Add one with “New idea”, or check another day.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 24 }}>
          {filtered.map((idea) => {
            const key = `${idea._playbook}-${idea.id}`;
            return (
              <IdeaCard
                key={key}
                idea={idea}
                sentTo={sentLocal[key] || []}
                sending={sendMut.isPending && sendMut.variables?.idea === idea}
                onSend={(target) => sendMut.mutate({ idea, target })}
                onOpen={() => navigate(PLAYBOOK_CONFIGS[idea._playbook as PlaybookId].route)}
              />
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddIdeaModal
          defaultDay={dayDate}
          defaultPlaybook={pbFilter === "all" ? "bpb" : pbFilter}
          author={user?.user_metadata?.full_name || user?.email?.split("@")[0] || ""}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ["idea-engine"] }); }}
        />
      )}
    </FramerPage>
  );
}

function IdeaLinkChip({ href, label, accent }: { href: string; label: string; accent: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: accent,
        padding: "4px 9px", borderRadius: 7, border: "1px solid var(--f-line)", background: "rgba(255,255,255,.03)" }}>
      {label} <ExternalLink size={11} strokeWidth={1.7} />
    </a>
  );
}
// Reference / production links row. A YouTube link shows its timestamps beside it.
// `full` adds Kalakar + Drive/Frame (existing cards only); new cards show just the ref link.
function IdeaLinks({ idea, full }: { idea: any; full: boolean }) {
  const yt = idea.yt_url as string | undefined;
  const ts = idea.yt_timestamps as string | undefined;
  const comp = idea.comp_link as string | undefined;
  const kalakar = idea.kalakar_link as string | undefined;
  const drive = (idea.drive_link || idea.frame_link) as string | undefined;
  if (!(yt || comp || (full && (kalakar || drive)))) {
    return <div style={{ fontSize: 12, color: "var(--f-faint)" }}>No reference link yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {yt ? (
        <>
          <IdeaLinkChip href={yt} label="YouTube" accent="#f472b6" />
          {ts ? <span style={{ fontSize: 11, color: "var(--f-faint)", fontVariantNumeric: "tabular-nums" }}>⏱ {ts}</span> : null}
        </>
      ) : comp ? (
        <IdeaLinkChip href={comp} label="Comp" accent="#D4952A" />
      ) : null}
      {full && kalakar ? <IdeaLinkChip href={kalakar} label="Kalakar" accent="#a78bfa" /> : null}
      {full && drive ? <IdeaLinkChip href={drive} label="Drive / frame" accent="#4A7FD4" /> : null}
    </div>
  );
}

function IdeaCard({ idea, sentTo, sending, onSend, onOpen }: {
  idea: Idea;
  sentTo: PlaybookId[];
  sending: boolean;
  onSend: (target: PlaybookId) => void;
  onOpen: () => void;
}) {
  const pb = idea._playbook as PlaybookId;
  const pages = pagesOf(idea);
  const pv = (idea.page_views || {}) as Record<string, number>;
  const total = sumViews(idea);
  const existing = isExistingIdea(idea);
  const [pickOpen, setPickOpen] = useState(false);
  // Playbooks this idea is already in: backend-derived (deployed_to_playbooks) ∪ this session's sends.
  const sent = [...new Set([...(idea.deployed_to_playbooks || []), ...sentTo])] as PlaybookId[];

  return (
    <article className="fglass-panel fglass-purple-shadow" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: PB_ACCENT[pb], fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: PB_ACCENT[pb] }} />
          {PLAYBOOK_CONFIGS[pb].label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: existing ? "var(--f-faint)" : "#4ade80", border: "1px solid var(--f-line)", borderRadius: 6, padding: "2px 7px" }}>
          {existing ? "Existing" : "New"}
        </span>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{idea.topic || <em style={{ color: "var(--f-faint)", fontWeight: 400 }}>Untitled idea</em>}</h3>

      {existing ? (
        <>
          {/* Views + per-page breakdown + all production links */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              <Eye size={16} strokeWidth={1.6} style={{ color: "var(--f-faint)" }} /> {fmtViews(total)}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--f-faint)" }}>total views</span>
            {idea.status ? <span style={{ marginLeft: "auto" }}><StatusBadge status={idea.status} /></span> : null}
          </div>

          {pages.length ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", marginBottom: 6 }}>Posted on {pages.length} page{pages.length > 1 ? "s" : ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pages.map((p) => (
                  <span key={p} className="seeding-surface-nested" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, color: "var(--f-dim)", display: "inline-flex", gap: 5, alignItems: "center" }}>
                    @{p}{pv[p] ? <span style={{ color: "var(--f-faint)" }}>· {fmtViews(Number(pv[p]))}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--f-faint)" }}>Not yet posted — free to use.</div>
          )}

          <IdeaLinks idea={idea} full />
        </>
      ) : (
        // New idea — just the reference link (comp / YouTube + timestamps).
        <IdeaLinks idea={idea} full={false} />
      )}

      {sent.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#a78bfa", fontWeight: 500 }}>
          <Check size={12} strokeWidth={2} /> In Frontseat · {sent.map((d) => PB_SHORT[d] || d).join(", ")}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: "auto", paddingTop: 6 }}>
        <span style={{ fontSize: 11.5, color: "var(--f-faint)" }}>{idea.created_by ? <>by <strong style={{ color: "var(--f-dim)", fontWeight: 600 }}>{idea.created_by}</strong></> : "—"}</span>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={onOpen} style={ghostBtnSm}>
            Open <ExternalLink size={12} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => setPickOpen((o) => !o)}
            style={{ ...sendBtn, opacity: sending ? 0.6 : 1 }}
          >
            {sending ? "Sending…" : <>Send to playbook <ChevronDown size={13} strokeWidth={2} /></>}
          </button>

          {pickOpen && (
            <>
              {/* click-away */}
              <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 41,
                minWidth: 190, padding: 6, borderRadius: 12,
                background: "rgba(16,16,18,.98)", border: "1px solid var(--f-line)",
                boxShadow: "0 12px 32px -12px rgba(0,0,0,.8), 0 0 24px -12px rgba(124,58,237,.5)",
              }}>
                <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", padding: "4px 8px 6px" }}>Send to Frontseat pool</div>
                {PLAYBOOKS.map((p) => {
                  const already = sent.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPickOpen(false); onSend(p); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                        padding: "8px 8px", borderRadius: 8, border: "none", background: "transparent",
                        color: "var(--f-ink)", fontSize: 12.5, cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: PB_ACCENT[p] }} />
                      {PLAYBOOK_CONFIGS[p].label}
                      {already ? <Check size={13} strokeWidth={2} style={{ marginLeft: "auto", color: "#a78bfa" }} /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function AddIdeaModal({ defaultDay, defaultPlaybook, author, onClose, onCreated }: {
  defaultDay: string; defaultPlaybook: PlaybookId; author: string; onClose: () => void; onCreated: () => void;
}) {
  const [pb, setPb] = useState<PlaybookId>(defaultPlaybook);
  const [topic, setTopic] = useState("");
  const [refLink, setRefLink] = useState("");
  const [timestamps, setTimestamps] = useState("");
  const [contentType, setContentType] = useState("Reel");
  const [day, setDay] = useState(defaultDay);
  const [busy, setBusy] = useState(false);

  const yt = isYouTube(refLink);

  const submit = async () => {
    if (!topic.trim()) { toast.error("Give the idea a name."); return; }
    setBusy(true);
    try {
      const link = refLink.trim();
      const ytLink = isYouTube(link);
      // "New idea" only — a fresh idea carries just its reference link (comp / YouTube).
      await PB_API[pb].createIdea({
        page_handle: "",
        topic: topic.trim(),
        content_type: contentType,
        views: 0,
        day_date: day,
        created_by: author || undefined,
        comp_link: link && !ytLink ? link : undefined,
        yt_url: ytLink ? link : undefined,
        yt_timestamps: ytLink ? (timestamps.trim() || undefined) : undefined,
      });
      toast.success("Idea added.");
      onCreated();
    } catch {
      toast.error("Couldn't add the idea — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fglass-panel" style={{ width: "min(520px, 100%)", padding: "22px 24px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>New idea</h2>
          <button type="button" onClick={onClose} style={{ ...ghostBtnSm, border: "none", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Playbook">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLAYBOOKS.map((p) => (
                <button key={p} type="button" onClick={() => setPb(p)} style={{ ...datePillBase, cursor: "pointer", borderColor: pb === p ? PB_ACCENT[p] : "var(--f-line)", color: pb === p ? "#fff" : "var(--f-dim)" }}>
                  {PLAYBOOK_CONFIGS[p].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Idea name *"><input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's the idea?" className="fglass-input" style={modalInput} /></Field>

          {/* Reference link (both modes). A YouTube link reveals a timestamps field beside it. */}
          <div style={{ display: "grid", gridTemplateColumns: yt ? "1fr 150px" : "1fr", gap: 12 }}>
            <Field label={yt ? "YouTube link" : "Comp / YouTube link"}>
              <input value={refLink} onChange={(e) => setRefLink(e.target.value)} placeholder="Paste comp or YouTube link" className="fglass-input" style={modalInput} />
            </Field>
            {yt && (
              <Field label="Timestamps"><input value={timestamps} onChange={(e) => setTimestamps(e.target.value)} placeholder="0:12, 1:45" className="fglass-input" style={modalInput} /></Field>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Content type">
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="fglass-input" style={{ ...modalInput, colorScheme: "dark" }}>
                {["Reel", "Carousel", "Static"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={day} max={TODAY} onChange={(e) => setDay(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="fglass-input" style={{ ...modalInput, colorScheme: "dark", cursor: "pointer" }} /></Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <button type="button" disabled={busy} onClick={submit} style={primaryBtn}><Check size={14} strokeWidth={2} /> {busy ? "Adding…" : "Add idea"}</button>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...ghostBtnSm, padding: "9px 14px" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--f-faint)", display: "block", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

/** Local date control — custom black/purple calendar (native picker can’t be themed). */
function PickDayControl({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (ymd: string) => void;
}) {
  const custom = value !== TODAY && value !== YESTERDAY;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          ...datePillBase,
          cursor: "pointer",
          color: custom ? "#e9d5ff" : "var(--f-dim)",
          borderColor: custom ? "rgba(167,139,250,.55)" : "var(--f-line)",
          background: custom ? "rgba(124,58,237,.14)" : "transparent",
        }}
      >
        <CalendarDays size={14} strokeWidth={1.6} color={custom ? "#a78bfa" : undefined} />
        {custom ? prettyDate(value) : "Pick a day"}
      </button>
      {open && (
        <>
          <div onClick={() => onOpenChange(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 81,
              padding: "10px 10px 8px",
              borderRadius: 14,
              background: "#0a0a0d",
              border: "1px solid rgba(167,139,250,.28)",
              boxShadow: "0 16px 40px -12px rgba(0,0,0,.85), 0 0 28px -14px rgba(124,58,237,.55)",
            }}
          >
            <DayCalendar
              mode="single"
              selected={new Date(`${value}T00:00:00`)}
              onSelect={(d) => {
                if (!d) return;
                onChange(ymd(d));
                onOpenChange(false);
              }}
              disabled={{ after: new Date() }}
              initialFocus
              className="idea-engine-cal text-zinc-200"
              classNames={{
                caption_label: "text-sm font-semibold text-zinc-100",
                head_cell: "text-zinc-500 rounded-md w-9 font-normal text-[0.75rem]",
                day: "h-9 w-9 p-0 font-normal text-zinc-300 hover:bg-violet-500/15 hover:text-violet-200 rounded-md aria-selected:opacity-100",
                day_selected:
                  "bg-[#7c3aed] text-white hover:bg-[#6d28d9] hover:text-white focus:bg-[#7c3aed] focus:text-white",
                day_today: "border border-[#a78bfa]/70 text-[#c4b5fd] aria-selected:border-transparent",
                day_outside: "text-zinc-600 opacity-50",
                day_disabled: "text-zinc-600 opacity-40",
                nav_button:
                  "h-7 w-7 bg-transparent p-0 text-zinc-400 border border-violet-500/25 hover:bg-violet-500/15 hover:text-violet-200 opacity-100",
              }}
            />
            <div style={{ display: "flex", gap: 8, padding: "4px 6px 2px", borderTop: "1px solid rgba(167,139,250,.18)", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { onChange(TODAY); onOpenChange(false); }}
                style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", padding: "6px 4px" }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => { onChange(YESTERDAY); onOpenChange(false); }}
                style={{ fontSize: 12, fontWeight: 500, color: "#a1a1aa", background: "none", border: "none", cursor: "pointer", padding: "6px 4px" }}
              >
                Yesterday
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DatePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...datePillBase, cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? "#000" : "var(--f-dim)", borderColor: active ? "#fff" : "var(--f-line)", fontWeight: active ? 600 : 500 }}>
      {children}
    </button>
  );
}

function FilterPill({ active, onClick, count, dot, children }: { active: boolean; onClick: () => void; count?: number; dot?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: active ? 600 : 500, cursor: "pointer", border: `1px solid ${active ? "rgba(255,255,255,.5)" : "var(--f-line)"}`, background: active ? "rgba(255,255,255,.08)" : "transparent", color: active ? "#fff" : "var(--f-dim)" }}>
      {dot ? <span style={{ width: 7, height: 7, borderRadius: 99, background: dot }} /> : null}
      {children}
      {count != null ? <span style={{ fontSize: 11, color: "var(--f-faint)" }}>{count}</span> : null}
    </button>
  );
}

const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9, border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const ghostBtnSm: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "6px 11px", borderRadius: 8, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)", cursor: "pointer" };
const sendBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", cursor: "pointer" };
const datePillBase: React.CSSProperties = { padding: "7px 13px", borderRadius: 9, fontSize: 12.5, border: "1px solid var(--f-line)", background: "transparent", color: "var(--f-dim)" };
const modalInput: React.CSSProperties = { width: "100%", borderRadius: 9, padding: "9px 11px", fontSize: 13 };
