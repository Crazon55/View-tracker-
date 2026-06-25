import { ImageIcon, StickyNote } from "lucide-react";
import { colorForNodeType } from "../lib/fsiNodeSchemas";
import { NOTE_COLOR, NOTE_TEMPLATES } from "../lib/fsiNoteTemplates";

export type PickerChoice =
  | { kind: "node"; nodeType: string }
  | { kind: "note"; noteKey: string }
  | { kind: "screenshot" };

type Props = {
  screenX: number;
  screenY: number;
  nodeTypes: readonly string[];
  onSelect: (choice: PickerChoice) => void;
  onCancel: () => void;
};

export default function NodeTypePicker({ screenX, screenY, nodeTypes, onSelect, onCancel }: Props) {
  const left = Math.min(screenX, window.innerWidth - 240);
  const top = Math.min(screenY, window.innerHeight - 360);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        className="fixed z-50 max-h-[min(420px,70vh)] w-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
        style={{ left, top }}
      >
        <div className="mb-2 px-2 text-xs font-medium text-zinc-400">Add to canvas</div>

        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
          Study nodes
        </div>
        {nodeTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect({ kind: "node", nodeType: type })}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white hover:bg-zinc-800"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorForNodeType(type) }}
            />
            {type}
          </button>
        ))}

        <div className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
          Quick
        </div>
        <button
          type="button"
          onClick={() => onSelect({ kind: "screenshot" })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white hover:bg-zinc-800"
        >
          <ImageIcon className="h-3.5 w-3.5 text-pink-400" />
          Screenshot
        </button>
        {NOTE_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect({ kind: "note", noteKey: t.key })}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white hover:bg-zinc-800"
          >
            <StickyNote className="h-3.5 w-3.5" style={{ color: NOTE_COLOR }} />
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
