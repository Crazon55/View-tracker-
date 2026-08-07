import { useState } from "react";
import {
  Frame,
  Hash,
  ImageIcon,
  Undo2,
  Redo2,
  Layers,
  FolderOpen,
  PenLine,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WHITEBOARD_NODE_TYPES, type WhiteboardNodeType } from "../lib/fsiWhiteboardTypes";
import { colorForNodeType } from "../lib/fsiNodeSchemas";
import { loadToolbarExpanded, saveToolbarExpanded } from "../lib/fsiToolbarStorage";

export const FSI_WHITEBOARD_TOOL_MIME = "application/fsi-whiteboard-tool";

export type WhiteboardToolPayload = { nodeType: WhiteboardNodeType };

const TOOL_ICONS: Record<WhiteboardNodeType, React.ReactNode> = {
  "Page Name": <FolderOpen className="h-4 w-4 shrink-0" />,
  "Content Pillar": <Layers className="h-4 w-4 shrink-0" />,
  "Content Bucket": <Hash className="h-4 w-4 shrink-0" />,
  Visual: <ImageIcon className="h-4 w-4 shrink-0" />,
  Observations: <PenLine className="h-4 w-4 shrink-0" />,
  Frame: <Frame className="h-4 w-4 shrink-0" />,
};

const TOOL_LABELS: Record<WhiteboardNodeType, string> = {
  "Page Name": "Page Name",
  "Content Pillar": "Content Pillar",
  "Content Bucket": "Content Bucket",
  Visual: "Visual",
  Observations: "Observations",
  Frame: "Frame selection",
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
  expanded,
  onAddTool,
  onPointerDownCapture,
}: {
  type: WhiteboardNodeType;
  canEdit: boolean;
  canvasTheme: "dark" | "light";
  expanded: boolean;
  onAddTool: (type: WhiteboardNodeType) => void;
  onPointerDownCapture?: (e: React.PointerEvent) => void;
}) {
  const label = TOOL_LABELS[type];
  const onDragStart = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.dataTransfer.setData(FSI_WHITEBOARD_TOOL_MIME, JSON.stringify({ nodeType: type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={expanded ? "sm" : "icon"}
      disabled={!canEdit}
      draggable={canEdit}
      onDragStart={onDragStart}
      onPointerDownCapture={onPointerDownCapture}
      onClick={() => onAddTool(type)}
      title={label}
      className={cn(
        "shrink-0 rounded-lg",
        expanded ? "h-9 w-full justify-start gap-2.5 px-2.5" : "h-9 w-9",
        canvasTheme === "light"
          ? "text-zinc-700 hover:bg-zinc-200"
          : "text-zinc-300 hover:bg-zinc-800",
      )}
      style={{ color: canEdit ? colorForNodeType(type) : undefined }}
    >
      {TOOL_ICONS[type]}
      {expanded ? (
        <span
          className={cn(
            "truncate text-left text-xs font-medium",
            canvasTheme === "light" ? "text-zinc-700" : "text-zinc-200",
          )}
        >
          {label}
        </span>
      ) : null}
    </Button>
  );
}

function ToolbarAction({
  expanded,
  canEdit,
  disabled,
  canvasTheme,
  onClick,
  title,
  label,
  icon,
  accentClass,
}: {
  expanded: boolean;
  canEdit?: boolean;
  disabled?: boolean;
  canvasTheme: "dark" | "light";
  onClick: () => void;
  title: string;
  label: string;
  icon: React.ReactNode;
  accentClass?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={expanded ? "sm" : "icon"}
      disabled={disabled ?? !canEdit}
      onClick={onClick}
      title={title}
      className={cn(
        "shrink-0 rounded-lg",
        expanded ? "h-9 w-full justify-start gap-2.5 px-2.5" : "h-8 w-8",
        accentClass,
        canvasTheme === "light" ? "text-zinc-600 hover:bg-zinc-200" : "text-zinc-400 hover:bg-zinc-800",
      )}
    >
      {icon}
      {expanded ? (
        <span
          className={cn(
            "truncate text-left text-xs font-medium",
            canvasTheme === "light" ? "text-zinc-700" : "text-zinc-300",
          )}
        >
          {label}
        </span>
      ) : null}
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
  const [expanded, setExpanded] = useState(() => loadToolbarExpanded());

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      saveToolbarExpanded(next);
      return next;
    });
  };

  const shellClass =
    canvasTheme === "light"
      ? "border-zinc-300 bg-white/95"
      : "border-zinc-800 bg-zinc-950/95";

  const dividerClass = cn(
    "my-1 h-px shrink-0 bg-zinc-700/50",
    expanded ? "mx-2 w-auto" : "w-7",
  );

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col gap-0.5 border-r py-2 transition-[width] duration-200 ease-out",
        expanded ? "w-44 px-1.5" : "w-12 items-center",
        shellClass,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size={expanded ? "sm" : "icon"}
        onClick={toggleExpanded}
        title={expanded ? "Collapse toolbar" : "Expand toolbar labels"}
        className={cn(
          "mb-0.5 shrink-0 rounded-lg",
          expanded ? "h-8 w-full justify-start gap-2 px-2.5" : "h-8 w-8",
          canvasTheme === "light"
            ? "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
            : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
        )}
      >
        {expanded ? (
          <PanelLeftClose className="h-4 w-4 shrink-0" />
        ) : (
          <PanelLeftOpen className="h-4 w-4 shrink-0" />
        )}
        {expanded ? (
          <span className="truncate text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Collapse
          </span>
        ) : null}
      </Button>

      {WHITEBOARD_NODE_TYPES.map((type) => (
        <ToolButton
          key={type}
          type={type}
          expanded={expanded}
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

      <div className={dividerClass} />

      <ToolbarAction
        expanded={expanded}
        canEdit={canEdit}
        canvasTheme={canvasTheme}
        onClick={onUploadImage}
        title="Upload image (Visual)"
        label="Upload image"
        accentClass={canvasTheme === "light" ? "text-pink-600" : "text-pink-400"}
        icon={<ImageIcon className="h-4 w-4 shrink-0" />}
      />

      <div className={cn("mt-auto flex flex-col gap-0.5 pt-2", expanded ? "w-full" : "")}>
        <ToolbarAction
          expanded={expanded}
          canEdit={canEdit}
          disabled={!canEdit || !canUndo}
          canvasTheme={canvasTheme}
          onClick={onUndo}
          title="Undo"
          label="Undo"
          icon={<Undo2 className="h-3.5 w-3.5 shrink-0" />}
        />
        <ToolbarAction
          expanded={expanded}
          canEdit={canEdit}
          disabled={!canEdit || !canRedo}
          canvasTheme={canvasTheme}
          onClick={onRedo}
          title="Redo"
          label="Redo"
          icon={<Redo2 className="h-3.5 w-3.5 shrink-0" />}
        />
      </div>
    </aside>
  );
}
