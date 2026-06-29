import {
  Frame,
  Hash,
  ImageIcon,
  Link2,
  StickyNote,
  Undo2,
  Redo2,
  BarChart3,
  Layers,
  FolderOpen,
  Eye,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WHITEBOARD_NODE_TYPES, type WhiteboardNodeType } from "../lib/fsiWhiteboardTypes";
import { colorForNodeType } from "../lib/fsiNodeSchemas";

export const FSI_WHITEBOARD_TOOL_MIME = "application/fsi-whiteboard-tool";

export type WhiteboardToolPayload = { nodeType: WhiteboardNodeType };

const TOOL_ICONS: Record<WhiteboardNodeType, React.ReactNode> = {
  "Page Name": <FolderOpen className="h-4 w-4" />,
  "Content Pillar": <Layers className="h-4 w-4" />,
  "Content Bucket": <Hash className="h-4 w-4" />,
  Visual: <ImageIcon className="h-4 w-4" />,
  "Visual Hook": <Eye className="h-4 w-4" />,
  "Written Hook": <PenLine className="h-4 w-4" />,
  Performance: <BarChart3 className="h-4 w-4" />,
  Link: <Link2 className="h-4 w-4" />,
  "Sticky Note": <StickyNote className="h-4 w-4" />,
  Frame: <Frame className="h-4 w-4" />,
};

type Props = {
  canEdit: boolean;
  canvasTheme: "dark" | "light";
  canUndo: boolean;
  canRedo: boolean;
  onAddTool: (type: WhiteboardNodeType) => void;
  /** Capture canvas selection before toolbar click clears it (Frame wrap). */
  onCaptureFrameSelection?: () => void;
  onUploadImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

function ToolButton({
  type,
  canEdit,
  canvasTheme,
  onAddTool,
  onPointerDownCapture,
}: {
  type: WhiteboardNodeType;
  canEdit: boolean;
  canvasTheme: "dark" | "light";
  onAddTool: (type: WhiteboardNodeType) => void;
  onPointerDownCapture?: (e: React.PointerEvent) => void;
}) {
  const onDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.dataTransfer.setData(FSI_WHITEBOARD_TOOL_MIME, JSON.stringify({ nodeType: type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={!canEdit}
      draggable={canEdit}
      onDragStart={onDragStart}
      onPointerDownCapture={onPointerDownCapture}
      onClick={() => onAddTool(type)}
      title={type === "Frame" ? "Wrap selection in frame" : type}
      className={cn(
        "h-9 w-9 shrink-0 rounded-lg",
        canvasTheme === "light"
          ? "text-zinc-700 hover:bg-zinc-200"
          : "text-zinc-300 hover:bg-zinc-800",
      )}
      style={{ color: canEdit ? colorForNodeType(type) : undefined }}
    >
      {TOOL_ICONS[type]}
    </Button>
  );
}

export default function FsiLeftToolbar({
  canEdit,
  canvasTheme,
  canUndo,
  canRedo,
  onAddTool,
  onCaptureFrameSelection,
  onUploadImage,
  onUndo,
  onRedo,
}: Props) {
  const shellClass =
    canvasTheme === "light"
      ? "border-zinc-300 bg-white/95"
      : "border-zinc-800 bg-zinc-950/95";

  return (
    <aside
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-0.5 border-r py-2",
        shellClass,
      )}
    >
      {WHITEBOARD_NODE_TYPES.map((type) => (
        <ToolButton
          key={type}
          type={type}
          canEdit={canEdit}
          canvasTheme={canvasTheme}
          onAddTool={onAddTool}
          onPointerDownCapture={
            type === "Frame" && onCaptureFrameSelection
              ? () => {
                  onCaptureFrameSelection();
                }
              : undefined
          }
        />
      ))}

      <div className="my-1 h-px w-7 bg-zinc-700/50" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canEdit}
        onClick={onUploadImage}
        title="Upload image (Visual)"
        className={cn(
          "h-9 w-9",
          canvasTheme === "light" ? "text-pink-600 hover:bg-zinc-200" : "text-pink-400 hover:bg-zinc-800",
        )}
      >
        <ImageIcon className="h-4 w-4" />
      </Button>

      <div className="mt-auto flex flex-col gap-0.5 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canEdit || !canUndo}
          onClick={onUndo}
          title="Undo"
          className={cn("h-8 w-8", canvasTheme === "light" ? "text-zinc-600" : "text-zinc-400")}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canEdit || !canRedo}
          onClick={onRedo}
          title="Redo"
          className={cn("h-8 w-8", canvasTheme === "light" ? "text-zinc-600" : "text-zinc-400")}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
