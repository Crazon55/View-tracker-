import { GripVertical, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FsiNodeRecord, IronNodeType } from "../lib/fsiNodeSchemas";
import { NODE_FIELD_DEFS, type FieldDef } from "../lib/fsiNodeFieldDefs";
import { isPlacedOnCanvas } from "../lib/fsiHierarchy";

export const FSI_FIELD_DRAG_MIME = "application/fsi-field-def";
export const FSI_PLACED_FIELD_DRAG_MIME = "application/fsi-placed-field";

export type FieldDragPayload = {
  fieldKey: string;
  label: string;
  inputType?: FieldDef["inputType"];
};

export type PlacedFieldDragPayload = {
  nodeId: string;
  label: string;
};

type Props = {
  parent: FsiNodeRecord;
  fieldNodes: FsiNodeRecord[];
  canEdit: boolean;
  onClose: () => void;
  onDeleteField: (nodeId: string) => void;
};

function startTemplateDrag(e: React.DragEvent, def: FieldDef) {
  const payload: FieldDragPayload = {
    fieldKey: def.key,
    label: def.label,
    inputType: def.inputType,
  };
  e.dataTransfer.setData(FSI_FIELD_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

function startPlacedDrag(e: React.DragEvent, node: FsiNodeRecord) {
  const payload: PlacedFieldDragPayload = {
    nodeId: node.id,
    label: String(node.structured_payload?.field_label ?? node.display_title),
  };
  e.dataTransfer.setData(FSI_PLACED_FIELD_DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
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

  const handlePaletteDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(FSI_PLACED_FIELD_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handlePaletteDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(FSI_PLACED_FIELD_DRAG_MIME);
    if (!raw || !canEdit) return;
    e.preventDefault();
    try {
      const { nodeId } = JSON.parse(raw) as PlacedFieldDragPayload;
      onDeleteField(nodeId);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Inspector</div>
          <div className="truncate text-sm font-semibold text-white">{parent.display_title}</div>
          <div className="truncate text-xs text-zinc-500">{parent.node_type}</div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-zinc-500" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {canEdit && (
        <div
          onDragOver={handlePaletteDragOver}
          onDrop={handlePaletteDrop}
          className="mx-3 mt-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-4 text-center text-xs text-zinc-500"
        >
          Drop a canvas property here to remove it
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <section>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Optional fields — drag to canvas
          </div>
          <div className="space-y-2">
            {defs.map((def) => (
              <div
                key={def.key}
                draggable={canEdit}
                onDragStart={(e) => canEdit && startTemplateDrag(e, def)}
                className={`flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 shadow-sm ${
                  canEdit
                    ? "cursor-grab active:cursor-grabbing hover:border-emerald-600/50 hover:bg-zinc-900/90"
                    : "opacity-60"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" />
                <span className="min-w-0 flex-1 text-sm text-zinc-200">{def.label}</span>
              </div>
            ))}
          </div>
        </section>

        {placed.length > 0 && (
          <section>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              On canvas ({placed.length}) — drag back to remove
            </div>
            <div className="space-y-2">
              {placed.map((node) => {
                const label =
                  String(node.structured_payload?.field_label ?? node.display_title) || "Field";
                const preview = String(node.structured_payload?.field_value ?? "").slice(0, 40);
                return (
                  <div
                    key={node.id}
                    draggable={canEdit}
                    onDragStart={(e) => canEdit && startPlacedDrag(e, node)}
                    className={`flex items-center gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2.5 ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-emerald-700/80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-emerald-100">{label}</div>
                      {preview ? (
                        <div className="truncate text-[10px] text-emerald-700/80">{preview}</div>
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
