import { useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUMMARY_SECTION_LABELS } from "../lib/fsiNodeSchemas";

type SummaryData = Record<string, string | string[]>;

type Props = {
  onGenerate: () => Promise<SummaryData>;
  loading: boolean;
  summary: SummaryData | null;
};

function Section({ title, content }: { title: string; content: string | string[] }) {
  const [open, setOpen] = useState(true);
  const isArray = Array.isArray(content);
  const empty = isArray ? content.length === 0 : !content;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-2 text-sm text-zinc-300">
          {empty ? (
            <span className="text-zinc-500 italic">No data</span>
          ) : isArray ? (
            <ul className="list-disc pl-4 space-y-1">
              {content.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap">{content}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SummaryPanel({ onGenerate, loading, summary }: Props) {
  return (
    <div className="flex h-full flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Context-Aware Summary
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Serializes the full graph and generates a strategy blueprint.
        </p>
        <Button
          className="mt-3 w-full"
          onClick={() => onGenerate()}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate Summary"
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!summary && !loading && (
          <p className="text-xs text-zinc-500 px-1">
            Add nodes and connections, then generate a summary.
          </p>
        )}
        {summary &&
          Object.entries(SUMMARY_SECTION_LABELS).map(([key, label]) => (
            <Section key={key} title={label} content={summary[key] ?? (key === "core_strategy_synthesis" ? "" : [])} />
          ))}
      </div>
    </div>
  );
}
