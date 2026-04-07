import { useState, useRef, useEffect } from "react";
import type { Page } from "@/types";
import { ChevronDown, X } from "lucide-react";

interface PageDistributionSelectProps {
  pages: Page[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function classifyNiche(handle: string): "tech" | "fbs" {
  const lower = handle.toLowerCase();
  // tech/ai pages have "tech" in name, or are specifically AI-focused
  if (lower.includes("tech")) return "tech";
  if (lower === "ai.cracked" || lower.includes("goodai") || lower === "indianaipage" || lower === "neworderai") return "tech";
  return "fbs";
}

export default function PageDistributionSelect({ pages, selected, onChange }: PageDistributionSelectProps) {
  const [open, setOpen] = useState(false);
  const [nicheFilter, setNicheFilter] = useState<"all" | "fbs" | "tech">("all");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const nicheFilteredPages = nicheFilter === "all"
    ? pages
    : pages.filter((p) => classifyNiche(p.handle) === nicheFilter);

  const filteredPages = search.trim()
    ? nicheFilteredPages.filter((p) =>
        p.handle.toLowerCase().includes(search.toLowerCase()) ||
        (p.name || "").toLowerCase().includes(search.toLowerCase())
      )
    : nicheFilteredPages;

  const nichePages = (niche: "fbs" | "tech") => pages.filter((p) => classifyNiche(p.handle) === niche);

  function selectAllFiltered() {
    const ids = filteredPages.map((p) => p.id);
    const merged = new Set([...selected, ...ids]);
    onChange([...merged]);
  }

  function deselectAllFiltered() {
    const ids = new Set(filteredPages.map((p) => p.id));
    onChange(selected.filter((id) => !ids.has(id)));
  }

  const allFilteredSelected = filteredPages.length > 0 && filteredPages.every((p) => selected.includes(p.id));

  function toggle(pageId: string) {
    onChange(
      selected.includes(pageId) ? selected.filter((id) => id !== pageId) : [...selected, pageId]
    );
  }

  const selectedHandles = selected
    .map((id) => pages.find((p) => p.id === id)?.handle)
    .filter(Boolean) as string[];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-left hover:border-zinc-700 transition-colors"
      >
        <span className={selected.length > 0 ? "text-white" : "text-zinc-500"}>
          {selected.length > 0 ? `${selected.length} page${selected.length > 1 ? "s" : ""} selected` : "Select pages"}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedHandles.map((handle) => {
            const page = pages.find((p) => p.handle === handle);
            if (!page) return null;
            const niche = classifyNiche(handle);
            return (
              <span
                key={page.id}
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  niche === "tech" ? "bg-cyan-500/15 text-cyan-400" : "bg-amber-500/15 text-amber-400"
                }`}
              >
                @{handle}
                <button type="button" onClick={() => toggle(page.id)} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
          {/* Niche filters */}
          <div className="flex items-center gap-1 p-2 border-b border-zinc-800">
            {(["all", "fbs", "tech"] as const).map((niche) => (
              <button
                key={niche}
                type="button"
                onClick={() => setNicheFilter(niche)}
                className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-medium transition-all ${
                  nicheFilter === niche
                    ? "bg-violet-600 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {niche === "all" ? "All" : niche === "fbs" ? `FBS (${nichePages("fbs").length})` : `Tech/AI (${nichePages("tech").length})`}
              </button>
            ))}
            <div className="ml-auto">
              <button
                type="button"
                onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                className="text-[10px] text-violet-400 hover:text-violet-300 px-2 py-1"
              >
                {allFilteredSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-2 pt-2 pb-1 border-b border-zinc-800">
            <input
              type="text"
              placeholder="Search IPs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              autoFocus
            />
          </div>

          {/* Page list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filteredPages.length === 0 && (
              <p className="text-center text-zinc-600 text-xs py-4">No IPs found</p>
            )}
            {filteredPages.map((page) => {
              const isSelected = selected.includes(page.id);
              const niche = classifyNiche(page.handle);
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => toggle(page.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    isSelected ? "bg-violet-500/10 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? "bg-violet-600 border-violet-600" : "border-zinc-700"
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span>@{page.handle}</span>
                  <span className={`ml-auto text-[9px] uppercase px-1.5 py-0.5 rounded font-medium ${
                    niche === "tech" ? "bg-cyan-500/15 text-cyan-400" : "bg-amber-500/15 text-amber-400"
                  }`}>
                    {niche === "tech" ? "Tech/AI" : "FBS"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
