import { GripVertical, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FsiNodeRecord, IronNodeType } from "../lib/fsiNodeSchemas";
import { NODE_FIELD_DEFS, type FieldDef } from "../lib/fsiNodeFieldDefs";
import { isPlacedOnCanvas } from "../lib/fsiHierarchy";

export const FSI_FIELD_DRAG_MIME = "application/fsi-field-def";

export type FieldDragPayload = {
  fieldKey: string;
  label: string;
  inputType?: FieldDef["inputType"];
};

type Props = {
  parent: FsiNodeRecord;
  fieldNodes: FsiNodeRecord[];
  canEdit: boolean;
  onClose: () => void;
  onDeleteField: (nodeId: string) => void;
};

function startFieldDrag(e: React.DragEvent, def: FieldDef) {
  const payload: FieldDragPayload = {
    fieldKey: def.key,
    label: def.label,
    inputType: def.inputType,
  };
  e.dataTransfer.setData(FSI_FIELD_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

export default function FsiPropertyPalette({
  parent,
  fieldNodes,
  canEdit,
  onClose,
  onDeleteField,
}: Props) {
  const nodeType = parent.node_type as IronNodeType;
  const defs = NODE_FIELD_DEFS[nodeType] ?? [];
  const placed = fieldNodes.filter(isPlacedOnCanvas);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Properties</div>
          <div className="truncate text-sm font-semibold text-white">{parent.display_title}</div>
          <div className="truncate text-xs text-zinc-500">{parent.node_type}</div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-zinc-500" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <section>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Drag onto canvas
          </div>
          <p className="mb-2 text-xs text-zinc-600">
            Pick a property, drop it on the canvas, then connect it to this parent with the node handles.
          </p>
          <div className="space-y-1">
            {defs.map((def) => (
              <div
                key={def.key}
                draggable={canEdit}
                onDragStart={(e) => canEdit && startFieldDrag(e, def)}
                className={`flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-2 text-xs text-zinc-200 ${
                  canEdit ? "cursor-grab active:cursor-grabbing hover:border-emerald-700/60 hover:bg-zinc-900" : "opacity-60"
                }`}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                <span className="min-w-0 flex-1 truncate">{def.label}</span>
              </div>
            ))}
          </div>
        </section>

        {placed.length > 0 && (
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              On canvas ({placed.length})
            </div>
            <div className="space-y-1">
              {placed.map((node) => {
                const label =
                  String(node.structured_payload?.field_label ?? node.display_title) || "Field";
                const preview = String(node.structured_payload?.field_value ?? "").slice(0, 40);
                return (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-300">{label}</div>
                      {preview ? (
                        <div className="truncate text-[10px] text-zinc-600">{preview}</div>
                      ) : null}
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-red-400 hover:text-red-300"
                        onClick={() => onDeleteField(node.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
