import { IRON_NODE_TYPES, NODE_TYPE_COLORS, type IronNodeType } from "../lib/fsiNodeSchemas";

type Props = {
  x: number;
  y: number;
  onSelect: (type: IronNodeType) => void;
  onCancel: () => void;
};

export default function NodeTypePicker({ x, y, onSelect, onCancel }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        className="fixed z-50 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
        style={{ left: x, top: y }}
      >
        <div className="mb-2 px-2 text-xs font-medium text-zinc-400">Select node type</div>
        {IRON_NODE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white hover:bg-zinc-800"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
            />
            {type}
          </button>
        ))}
      </div>
    </>
  );
}
