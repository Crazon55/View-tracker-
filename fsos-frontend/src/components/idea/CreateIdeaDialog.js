import React, { useState, useEffect, useRef } from "react";
import { useWorkspace } from "../../domain/store";
import { FORMATS, PRIORITIES, PRIORITY_KEYS, defaultPriorityFor } from "../../domain/constants";
import { StreamBadge, IPBadge } from "../common/badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { assetLinkError } from "../../lib/links";

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
  const [priority, setPriority] = useState(defaultPriorityFor(stream));
  const [perIp, setPerIp] = useState({});   // ipId -> { live, asset }, HPN only
  const [ownerId, setOwnerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const producers = db.users.filter((u) => u.active && u.roles.some((r) => ["Designer", "Editor"].includes(r)));
  const reviewers = db.users.filter((u) => u.active && u.roles.some((r) => ["CS", "Founder/Admin", "COA", "Short-form Lead"].includes(r)));
  // Happenings are produced and posted in one sitting: no source research, no per-page
  // hooks, no priority. They get the live Instagram link and the Canva file instead.
  const isHpn = stream === "HPN";

  useEffect(() => {
    if (open) { setTitle(prefill?.title || ""); setFormat("Reel"); setCategory(""); setDests([]); setIpHooks({}); setSrcUrl(prefill?.sourceUrl || ""); setSrcStart(""); setSrcEnd(""); setBatchId(""); setPriority(defaultPriorityFor(stream)); setPerIp({}); setOwnerId(""); setReviewerId(""); }
  }, [open, stream, prefill]);

  // Only the categories for this stream and this exact format. It used to offer every
  // category in the system, so a BO reel could be filed under an HPN carousel heading.
  const cats = db.categories.filter(
    (c) => c.stream === stream && (c.format || "Carousel") === format,
  );
  const isVideoSource = format === "Reel";
  const activeIps = db.ips.filter((i) => i.active);
  const selectedIps = dests.map((id) => activeIps.find((i) => i.id === id) || db.ips.find((i) => i.id === id)).filter(Boolean);

  const toggle = (id) => setDests((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);

  const setIpLink = (id, field, value) => setPerIp((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
  const ipById = (id) => db.ips.find((i) => i.id === id);
  // Canva stays Canva; anything else the link check accepted is Drive.
  const assetLinkType = (url) => {
    try { return /(^|\.)canva\.(com|link|site|cn)$/.test(new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname) ? "canva" : "drive"; }
    catch (e) { return "canva"; }
  };

  const setIpHookField = (id, field, value) => {
    setIpHooks((h) => ({ ...h, [id]: { hook: "", subHook: "", ...h[id], [field]: value } }));
  };

  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (category && !cats.some((c) => c.name === category)) setCategory("");
  }, [stream, format]);  // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (inFlight.current) return;
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!dests.length) { toast.error("Select at least one destination IP"); return; }
    if (isHpn && reviewerId && !ownerId) { toast.error("Pick an owner too — a reviewer is assigned together with the owner."); return; }
    if (isHpn) {
      for (const ipId of dests) {
        const asset = (perIp[ipId]?.asset || "").trim();
        const err = asset && assetLinkError(asset);
        if (err) { toast.error(`${ipById(ipId)?.code || "Page"}: ${err}`); return; }
      }
    }
    const brief = {};
    if (format === "Carousel") brief.slides = [];
    if (format === "Reel") { brief.editingDirection = ""; brief.musicNotes = ""; }
    if (format === "Static") brief.bodyCopy = "";
    const sources = !isHpn && srcUrl ? [{ id: "src-" + Math.random().toString(36).slice(2, 7), url: srcUrl, label: "Source", start: isVideoSource ? srcStart : "", end: isVideoSource ? srcEnd : "" }] : [];
    const versionHooks = {};
    dests.forEach((ipId) => {
      versionHooks[ipId] = {
        hookOverride: (ipHooks[ipId]?.hook || "").trim(),
        subHook: format === "Reel" ? (ipHooks[ipId]?.subHook || "").trim() : "",
      };
    });
    const linksByIp = {};
    dests.forEach((ipId) => {
      const asset = (perIp[ipId]?.asset || "").trim();
      linksByIp[ipId] = { live: (perIp[ipId]?.live || "").trim(), asset, assetType: assetLinkType(asset) };
    });
    inFlight.current = true;
    setSaving(true);
    let id;
    try {
      id = await actions.addIdea({ stream, title, format, category: category || cats[0]?.name, brief, destinations: dests, sources, batchId: batchId || null, priority, versionHooks, perIp: isHpn ? linksByIp : {}, ownerId: isHpn ? ownerId : "", reviewerId: isHpn ? reviewerId : "" });
    } catch (e) {
      /* the store already showed the error */
      return;
    } finally {
      inFlight.current = false;
      setSaving(false);
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
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {!isHpn && <div>
            <label className="text-xs font-medium text-stone-600">Source link</label>
            <div className="mt-1 flex gap-2">
              <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="YouTube / article URL" className="flex-1" />
              {isVideoSource && <>
                <Input value={srcStart} onChange={(e) => setSrcStart(e.target.value)} placeholder="start" className="w-20" />
                <Input value={srcEnd} onChange={(e) => setSrcEnd(e.target.value)} placeholder="end" className="w-20" />
              </>}
            </div>
            {isVideoSource && <p className="mt-1 text-[10px] text-stone-400">Timestamps optional — only relevant for video/YouTube sources.</p>}
          </div>}

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

          {isHpn && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-600">Assigned to (owner)</label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger className="mt-1" data-testid="create-owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
                    <SelectContent>{producers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600">Reviewer</label>
                  <Select value={reviewerId} onValueChange={setReviewerId}>
                    <SelectTrigger className="mt-1" data-testid="create-reviewer"><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                    <SelectContent>{reviewers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {selectedIps.length > 0 && (
                <div data-testid="create-ip-links">
                  <label className="text-xs font-medium text-stone-600">Links per page</label>
                  <p className="text-[10px] text-stone-400 mt-0.5 mb-2">Optional — a live Instagram link records that page as published.</p>
                  <div className="space-y-2.5">
                    {selectedIps.map((ip) => (
                      <div key={ip.id} className="rounded-lg border border-line bg-canvas p-3" data-testid={`create-ip-links-${ip.id}`}>
                        <div className="mb-2"><IPBadge ip={ip} showName /></div>
                        <label className="text-[10px] uppercase tracking-wide text-stone-400">Live link · {ip.code}</label>
                        <Input data-testid={`create-live-${ip.id}`} value={perIp[ip.id]?.live || ""} onChange={(e) => setIpLink(ip.id, "live", e.target.value)} placeholder="https://instagram.com/…" className="h-8 text-sm mt-0.5" />
                        <label className="mt-2 block text-[10px] uppercase tracking-wide text-stone-400">Canva / Drive link · {ip.code}</label>
                        <Input data-testid={`create-asset-${ip.id}`} value={perIp[ip.id]?.asset || ""} onChange={(e) => setIpLink(ip.id, "asset", e.target.value)} placeholder="Paste Canva or Drive link…" className="h-8 text-sm mt-0.5" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!isHpn && selectedIps.length > 0 && (
            <div data-testid="create-ip-hooks">
              <label className="text-xs font-medium text-stone-600">Page hooks</label>
              <p className="text-[10px] text-stone-400 mt-0.5 mb-2">A hook field appears for each selected IP.</p>
              <div className="space-y-2.5">
                {selectedIps.map((ip) => (
                  <div key={ip.id} className="rounded-lg border border-line bg-canvas p-3" data-testid={`create-ip-hook-${ip.id}`}>
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

          {!isHpn && <div>
            <label className="text-xs font-medium text-stone-600">Priority</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1" data-testid="create-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    <span className="font-semibold">{k}</span>
                    <span className="ml-2 text-stone-500">{PRIORITIES[k].short}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-stone-400">{PRIORITIES[priority].blurb}</p>
          </div>}

          {stream === "BO" && (
            <div>
              <label className="text-xs font-medium text-stone-600">Add to batch (optional)</label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No batch" /></SelectTrigger>
                <SelectContent>{db.batches.filter((b) => b.stream === stream).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="create-submit" onClick={submit} disabled={saving} className="bg-stone-900 hover:bg-stone-800">{saving ? "Creating…" : "Create idea"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
