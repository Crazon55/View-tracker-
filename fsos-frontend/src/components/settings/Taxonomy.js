// Categories and batches — the two things you set up before anyone writes an idea.
//
// Categories belong to a stream *and* a format. A reel, a carousel and a static are
// researched and briefed differently, so the list that helps on one is noise on another.
// Two streams, three formats, six lists.
//
// This is deliberately not the Reel-versus-Post split used for cadence, where Carousel
// and Static both count as a post against an IP's floors. That one answers "how many
// went out today"; this one answers "what kind of thing is it".
//
// A batch groups ideas researched together so they can be reviewed and approved in one
// pass. Until now there was no way to make one, so "Add to batch" on the create dialog
// only ever offered "No batch".
import React, { useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../../domain/store";
import { userById } from "../../domain/selectors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";

const FORMATS = ["Reel", "Carousel", "Static"];
const BUCKETS = ["BO", "HPN"].flatMap((st) => FORMATS.map((f) => [st, f]));

export function CategorySettings() {
  const { db, actions } = useWorkspace();
  const [name, setName] = useState("");
  const [stream, setStream] = useState("BO");
  const [format, setFormat] = useState("Reel");

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await actions.addCategory({ name: n, stream, format });
      setName("");
      toast.success(`Added to ${stream} · ${format}`);
    } catch (e) { /* the store already showed the error */ }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs text-stone-600">New category</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            data-testid="cat-name"
            className="mt-1"
          />
        </div>
        <Select value={stream} onValueChange={setStream}>
          <SelectTrigger className="w-24" data-testid="cat-stream"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BO">BO</SelectItem>
            <SelectItem value="HPN">HPN</SelectItem>
          </SelectContent>
        </Select>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-36" data-testid="cat-format"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button data-testid="cat-add" onClick={add} className="bg-stone-900">Add</Button>
      </div>
      <p className="mb-4 text-[11px] text-stone-400">
        Each category belongs to one stream and one format. Separate from cadence
        counting, where a carousel and a static both count as a post against an IP's floors.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BUCKETS.map(([st, f]) => {
          const rows = db.categories.filter(
            (c) => c.stream === st && (c.format || "Carousel") === f,
          );
          return (
            <div key={`${st}-${f}`} data-testid={`cat-bucket-${st}-${f}`}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-xs font-medium text-stone-700">{st}</span>
                <span className="text-[11px] text-stone-500">{f}</span>
                <span className="ml-auto text-[10px] text-stone-400">{rows.length}</span>
              </div>
              <div className="space-y-1">
                {rows.map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center justify-between rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm"
                    data-testid={`cat-${c.id}`}
                  >
                    <span>{c.name}</span>
                    <button
                      title="Remove"
                      data-testid={`cat-del-${c.id}`}
                      onClick={async () => {
                        try {
                          await actions.deleteCategory(c.id);
                          toast.success("Category removed");
                        } catch (e) { /* reported by the store */ }
                      }}
                      className="text-stone-400 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                    >
                      <Icons.X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!rows.length && (
                  <p className="rounded-md border border-dashed border-stone-200 px-3 py-1.5 text-[11px] text-stone-400">
                    None yet
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BatchSettings() {
  const { db, actions } = useWorkspace();
  const [name, setName] = useState("");
  const [stream, setStream] = useState("BO");
  const [deadline, setDeadline] = useState("");
  const [reviewerId, setReviewerId] = useState("");

  const reviewers = db.users.filter((u) => u.active && u.roles.length);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await actions.addBatch({
        name: n,
        stream,
        deadline: deadline || null,
        reviewerId: reviewerId || null,
      });
      setName("");
      setDeadline("");
      setReviewerId("");
      toast.success("Batch created — it's selectable now when you create an idea");
    } catch (e) { /* the store already showed the error */ }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs text-stone-600">New batch</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="BO Batch — Founder playbooks"
            data-testid="batch-name"
            className="mt-1"
          />
        </div>
        <Select value={stream} onValueChange={setStream}>
          <SelectTrigger className="w-24" data-testid="batch-stream"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BO">BO</SelectItem>
            <SelectItem value="HPN">HPN</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-stone-400">Deadline</label>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="mt-1 h-9 w-40 text-xs"
            data-testid="batch-deadline"
          />
        </div>
        <Select value={reviewerId || "__none"} onValueChange={(v) => setReviewerId(v === "__none" ? "" : v)}>
          <SelectTrigger className="w-44" data-testid="batch-reviewer"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No reviewer yet</SelectItem>
            {reviewers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button data-testid="batch-add" onClick={add} className="bg-stone-900">Add</Button>
      </div>
      <p className="mb-4 text-[11px] text-stone-400">
        A batch groups ideas researched together so they can be approved in one pass.
        Deleting one leaves its ideas alone — they just stop being grouped.
      </p>

      <div className="space-y-1.5">
        {db.batches.map((b) => (
          <div
            key={b.id}
            className="group flex items-center gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            data-testid={`batch-${b.id}`}
          >
            <span className="rounded-full border px-2 py-0.5 text-[10px] text-stone-500">{b.stream}</span>
            <span className="flex-1 truncate">{b.name}</span>
            <span className="shrink-0 text-[11px] text-stone-500">
              {b.ideaIds.length} idea{b.ideaIds.length === 1 ? "" : "s"}
            </span>
            {b.deadline && <span className="shrink-0 text-[11px] text-stone-400">due {b.deadline}</span>}
            {b.reviewerId && (
              <span className="shrink-0 text-[11px] text-stone-400">
                {userById(db, b.reviewerId)?.name}
              </span>
            )}
            <button
              title="Delete batch"
              data-testid={`batch-del-${b.id}`}
              onClick={async () => {
                try {
                  await actions.deleteBatch(b.id);
                  toast.success("Batch deleted — its ideas are untouched");
                } catch (e) { /* reported by the store */ }
              }}
              className="shrink-0 text-stone-400 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
            >
              <Icons.Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!db.batches.length && (
          <p className="rounded-md border border-dashed border-stone-200 px-3 py-3 text-center text-[11px] text-stone-400">
            No batches yet. Create one above and it appears in the “Add to batch” list when
            you write an idea.
          </p>
        )}
      </div>
    </div>
  );
}
