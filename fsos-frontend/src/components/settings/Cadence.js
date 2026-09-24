// What an IP puts out in a day, slot by slot.
//
// The floors say how many posts and reels a page owes each day; they drive the calendar's
// capacity chips. But "3 posts" doesn't tell anyone what those three posts are, and the
// plan lived in a doc outside the system — so whoever came to fill a slot had to go and
// ask. This puts it next to the floor it belongs to.
//
// Two shapes, both stored on the IP:
//   ranges: { posts: [min, max], reels: [min, max] }        — pages that run a band
//   menu:   [{ id, kind: "post" | "reel", options: [...] }] — one entry per daily slot
//
// A slot carries options rather than one value because that is how the plan is actually
// written: "Post 2: Proven BO / Happening" means either is right for that slot. The
// options are free text on purpose. They mostly match category names, but not always —
// "Happening" is a real slot type with no category behind it — and a cadence that could
// only say things the taxonomy already knows would be a worse record of the plan.
import React, { useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../../domain/store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

const KINDS = [["post", "Posts"], ["reel", "Reels"]];

const newId = () => `slot-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Read `ip.menu` whatever shape it is in.
 *
 * The column was text[] before the cadence existed, and the migration to jsonb is a
 * separate step from deploying this code — so for a window, one of the two is ahead of
 * the other. A bare string is read as a post slot with one option, which is what those
 * legacy labels meant, and nothing renders undefined either way.
 */
export function readSlots(ip) {
  return (ip?.menu || []).map((m, i) =>
    typeof m === "string"
      ? { id: `legacy-${i}`, kind: "post", options: [m] }
      : { ...m, id: m.id || `slot-${i}`, options: m.options || [] });
}

/** "3" when the floor is the whole story, "7–9" when the page runs a band. */
export function cadenceLabel(ip, kind) {
  const key = kind === "post" ? "posts" : "reels";
  const floor = ip.floors?.[key] || 0;
  const range = ip.ranges?.[key];
  if (Array.isArray(range) && range[0] != null && range[1] != null) {
    return range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`;
  }
  return String(floor);
}

/** The one-line summary that sits on the IP card in Settings. */
export function CadenceSummary({ ip }) {
  const slots = readSlots(ip);
  if (!slots.length && !ip.floors?.posts && !ip.floors?.reels) {
    return <span className="text-[10px] text-stone-300">No cadence set</span>;
  }
  return (
    <span className="text-[10px] text-stone-500">
      {cadenceLabel(ip, "post")} posts · {cadenceLabel(ip, "reel")} reels
      {slots.length > 0 && <span className="text-stone-400"> · {slots.length} slots planned</span>}
    </span>
  );
}

/** The slot plan as read-only chips, for the IP card. */
export function CadenceChips({ ip }) {
  const slots = readSlots(ip);
  if (!slots.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {slots.map((s) => (
        <span key={s.id} className={cn("rounded px-1.5 py-0.5 text-[9px]",
          s.kind === "reel" ? "bg-indigo-50 text-indigo-700" : "bg-stone-100 text-stone-600")}>
          {s.options.join(" / ")}
        </span>
      ))}
    </div>
  );
}

export function CadenceDialog({ ip, open, onClose }) {
  const { actions } = useWorkspace();
  const [floors, setFloors] = useState(() => ({ posts: ip.floors?.posts || 0, reels: ip.floors?.reels || 0 }));
  const [ranges, setRanges] = useState(() => ({
    posts: ip.ranges?.posts || [null, null],
    reels: ip.ranges?.reels || [null, null],
  }));
  const [slots, setSlots] = useState(() => readSlots(ip));

  const ofKind = (kind) => slots.filter((s) => s.kind === kind);
  const addSlot = (kind) => setSlots((s) => [...s, { id: newId(), kind, options: [""] }]);
  const patchSlot = (id, patch) => setSlots((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const dropSlot = (id) => setSlots((s) => s.filter((x) => x.id !== id));

  const num = (v) => (v === "" || v == null ? null : Number(v));

  const save = () => {
    // A blank band is stored as absent rather than [null, null], so cadenceLabel falls
    // back to the floor instead of rendering a dash with nothing either side.
    const band = (r) => (r[0] == null && r[1] == null ? null : [r[0], r[1]]);
    const nextRanges = {};
    if (band(ranges.posts)) nextRanges.posts = band(ranges.posts);
    if (band(ranges.reels)) nextRanges.reels = band(ranges.reels);
    const cleanSlots = slots
      .map((s) => ({ ...s, options: s.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((s) => s.options.length > 0);
    actions.updateIP(ip.id, { floors, ranges: nextRanges, menu: cleanSlots });
    toast.success(`Cadence saved for ${ip.name}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-auto fsos-scroll" data-testid={`cadence-dialog-${ip.id}`}>
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Cadence — {ip.name}</DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-stone-500">
          The floor is what this page owes each day, and it is what the calendar counts
          against. A range is for pages that run a band; leave it blank when the floor is
          the whole story.
        </p>

        <div className="space-y-4">
          {KINDS.map(([kind, label]) => {
            const key = kind === "post" ? "posts" : "reels";
            return (
              <div key={kind} className="rounded-lg border border-[#E6E1D8] p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-stone-400">{label} floor / day</label>
                    <Input type="number" min="0" value={floors[key]} data-testid={`cadence-floor-${kind}`}
                      onChange={(e) => setFloors((f) => ({ ...f, [key]: Number(e.target.value) }))}
                      className="mt-1 h-8 w-24 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-stone-400">Range (optional)</label>
                    <div className="mt-1 flex items-center gap-1">
                      <Input type="number" min="0" placeholder="min" value={ranges[key][0] ?? ""}
                        onChange={(e) => setRanges((r) => ({ ...r, [key]: [num(e.target.value), r[key][1]] }))}
                        className="h-8 w-20 text-xs" />
                      <span className="text-stone-400">–</span>
                      <Input type="number" min="0" placeholder="max" value={ranges[key][1] ?? ""}
                        onChange={(e) => setRanges((r) => ({ ...r, [key]: [r[key][0], num(e.target.value)] }))}
                        className="h-8 w-20 text-xs" />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="ml-auto h-8 text-xs"
                    data-testid={`cadence-add-${kind}`} onClick={() => addSlot(kind)}>
                    <Icons.Plus className="mr-1 h-3 w-3" /> Add {kind}
                  </Button>
                </div>

                <div className="mt-3 space-y-1.5">
                  {ofKind(kind).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-mono text-[10px] text-stone-400">
                        {kind === "post" ? "Post" : "Reel"} {i + 1}
                      </span>
                      <Input
                        value={s.options.join(" / ")}
                        data-testid={`cadence-slot-${s.id}`}
                        placeholder="Fact static / Proven BO"
                        /* Slash-separated, the way the plan is written down. */
                        onChange={(e) => patchSlot(s.id, { options: e.target.value.split("/") })}
                        className="h-8 text-xs"
                      />
                      <button onClick={() => dropSlot(s.id)} className="text-stone-300 hover:text-[#C0512F]" title="Remove slot">
                        <Icons.X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {ofKind(kind).length === 0 && (
                    <p className="text-[10px] text-stone-400">No {kind} slots planned yet.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-stone-900" data-testid="cadence-save" onClick={save}>Save cadence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
