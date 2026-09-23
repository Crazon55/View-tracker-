import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../domain/store";
import { FORMATS } from "../../domain/constants";
import { StreamBadge, IPBadge } from "../common/badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export default function CreateIdeaDialog({ open, onOpenChange, stream, prefill, onCreated }) {
  const { db, actions } = useWorkspace();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("Reel");
  const [category, setCategory] = useState("");
  const [dests, setDests] = useState([]);
  const [ipHooks, setIpHooks] = useState({});
  const [srcUrl, setSrcUrl] = useState("");
  const [srcStart, setSrcStart] = useState("");
  const [srcEnd, setSrcEnd] = useState("");
  const [batchId, setBatchId] = useState("");

  useEffect(() => {
    if (open) { setTitle(prefill?.title || ""); setFormat("Reel"); setCategory(""); setDests([]); setIpHooks({}); setSrcUrl(prefill?.sourceUrl || ""); setSrcStart(""); setSrcEnd(""); setBatchId(""); }
  }, [open, stream, prefill]);

  const cats = db.categories;
  const isVideoSource = format === "Reel";
  const activeIps = db.ips.filter((i) => i.active);
  const selectedIps = dests.map((id) => activeIps.find((i) => i.id === id) || db.ips.find((i) => i.id === id)).filter(Boolean);

  const toggle = (id) => setDests((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);

  const setIpHookField = (id, field, value) => {
    setIpHooks((h) => ({ ...h, [id]: { hook: "", subHook: "", ...h[id], [field]: value } }));
  };

  const submit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!dests.length) { toast.error("Select at least one destination IP"); return; }
    const brief = {};
    if (format === "Carousel") brief.slides = [];
    if (format === "Reel") { brief.editingDirection = ""; brief.musicNotes = ""; }
    if (format === "Static") brief.bodyCopy = "";
    const sources = srcUrl ? [{ id: "src-" + Math.random().toString(36).slice(2, 7), url: srcUrl, label: "Source", start: isVideoSource ? srcStart : "", end: isVideoSource ? srcEnd : "" }] : [];
    const versionHooks = {};
    dests.forEach((ipId) => {
      versionHooks[ipId] = {
        hookOverride: (ipHooks[ipId]?.hook || "").trim(),
        subHook: format === "Reel" ? (ipHooks[ipId]?.subHook || "").trim() : "",
      };
    });
    let id;
    try {
      id = await actions.addIdea({ stream, title, format, category: category || cats[0]?.name, brief, destinations: dests, sources, batchId: batchId || null, versionHooks });
    } catch (e) {
      /* the store already showed the error */
      return;
    }
    toast.success("Idea created — creator & timestamp captured automatically");
    onCreated(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="create-idea-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">Create idea <StreamBadge stream={stream} /></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-auto fsos-scroll pr-1">
          <div>
            <label className="text-xs font-medium text-stone-600">Idea name</label>
            <Input data-testid="create-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How Zerodha built a ₹30,000 Cr business…" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-600">Format</label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="mt-1" data-testid="create-format"><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map((f) => <SelectItem key={f} value={f}>{f}{f !== "Reel" ? " (Post)" : " (Reel)"}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-stone-400">Carousel & Static count toward Posts. Reel counts toward Reels.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-600">Editorial category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1" data-testid="create-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name} · {c.stream}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600">Source link</label>
            <div className="mt-1 flex gap-2">
              <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="YouTube / article URL" className="flex-1" />
              {isVideoSource && <>
                <Input value={srcStart} onChange={(e) => setSrcStart(e.target.value)} placeholder="start" className="w-20" />
                <Input value={srcEnd} onChange={(e) => setSrcEnd(e.target.value)} placeholder="end" className="w-20" />
              </>}
            </div>
            {isVideoSource && <p className="mt-1 text-[10px] text-stone-400">Timestamps optional — only relevant for video/YouTube sources.</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-600">Intended IPs (multi-select) — one owner will produce all versions</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {activeIps.map((ip) => (
                <button key={ip.id} type="button" data-testid={`create-dest-${ip.id}`} onClick={() => toggle(ip.id)}
                  className={cn("rounded-md border px-2 py-1 transition-colors", dests.includes(ip.id) ? "border-stone-800 bg-stone-100" : "border-stone-200 hover:border-stone-400")}>
                  <IPBadge ip={ip} />
                </button>
              ))}
            </div>
          </div>

          {selectedIps.length > 0 && (
            <div data-testid="create-ip-hooks">
              <label className="text-xs font-medium text-stone-600">Page hooks</label>
              <p className="text-[10px] text-stone-400 mt-0.5 mb-2">A hook field appears for each selected IP.</p>
              <div className="space-y-2.5">
                {selectedIps.map((ip) => (
                  <div key={ip.id} className="rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] p-3" data-testid={`create-ip-hook-${ip.id}`}>
                    <div className="mb-2"><IPBadge ip={ip} showName /></div>
                    <label className="text-[10px] uppercase tracking-wide text-stone-400">Hook · {ip.code}</label>
                    <Input
                      data-testid={`create-hook-${ip.id}`}
                      value={ipHooks[ip.id]?.hook || ""}
                      onChange={(e) => setIpHookField(ip.id, "hook", e.target.value)}
                      placeholder={`Hook for ${ip.code}…`}
                      className="h-8 text-sm mt-0.5"
                    />
                    {format === "Reel" && (
                      <div className="mt-2">
                        <label className="text-[10px] uppercase tracking-wide text-stone-400">Sub hook · {ip.code}</label>
                        <Input
                          data-testid={`create-subhook-${ip.id}`}
                          value={ipHooks[ip.id]?.subHook || ""}
                          onChange={(e) => setIpHookField(ip.id, "subHook", e.target.value)}
                          placeholder="Follow-up line after the opening hook…"
                          className="h-8 text-sm mt-0.5"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stream === "BO" && (
            <div>
              <label className="text-xs font-medium text-stone-600">Add to batch (optional)</label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No batch" /></SelectTrigger>
                <SelectContent>{db.batches.filter((b) => b.stream === "BO").map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="create-submit" onClick={submit} className="bg-stone-900 hover:bg-stone-800">Create idea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
