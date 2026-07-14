import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { FsiLinkifiedText, looksLikeUrl, normalizeLinkHref } from "../lib/fsiLinkText";
import { uploadFsiNodeScreenshotFiles } from "../lib/fsiNodeMedia";
import { getScreenshotImageUrl, isScreenshotNode } from "../lib/fsiHierarchy";
import { clipboardImageFiles } from "../lib/fsiScreenshotNode";
import {
  COMPACT_NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  isCarouselBodyNode,
  isLinkNode,
  isNodeUiExpanded,
  LINK_NODE_HEIGHT,
  LINK_NODE_WIDTH,
  NODE_BODY_BOX_CLASS,
  NODE_TYPE_LABEL_CLASS,
  NODE_TITLE_DISPLAY_CLASS,
  NODE_TITLE_EMPTY_CLASS,
  NODE_TITLE_INPUT_CLASS,
  isUnsetNodeTitle,
  nodeCardHeight,
  nodeCardWidth,
  parseSlidesContent,
} from "../lib/fsiWhiteboardTypes";
import FsiNodeHandles from "./FsiNodeHandles";
import FsiNodeExpandToggle from "./FsiNodeExpandToggle";
import FsiCarouselSlidesEditor from "./FsiCarouselSlidesEditor";

function FsiCanvasNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    fsiNode,
    canEdit,
    isNote,
    isCompact,
    fieldDefs,
    connectionAnchors = [],
    onTitleChange,
    onBodyChange,
    onPayloadChange,
    onStructuredPayloadPatch,
    showConnectionDots = false,
  } = nodeData;

  const [title, setTitle] = useState(fsiNode.display_title);
  const [body, setBody] = useState(fsiNode.raw_body_text ?? "");
  const [titleEditing, setTitleEditing] = useState(false);
  const payload = fsiNode.structured_payload ?? {};
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fieldDefs.map((def) => [def.key, String(payload[def.key] ?? "")])),
  );

  useEffect(() => {
    setTitle(fsiNode.display_title);
    setBody(fsiNode.raw_body_text ?? "");
  }, [fsiNode.display_title, fsiNode.raw_body_text]);

  useEffect(() => {
    setFieldValues(
      Object.fromEntries(
        fieldDefs.map((def) => [def.key, String(fsiNode.structured_payload?.[def.key] ?? "")]),
      ),
    );
  }, [fsiNode.id, fieldDefs, fsiNode.structured_payload]);

  const commitTitle = useCallback(
    (next: string) => {
      setTitle(next);
      onTitleChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onTitleChange],
  );

  const commitBody = useCallback(
    (next: string) => {
      setBody(next);
      onBodyChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onBodyChange],
  );

  const commitField = useCallback(
    (key: string, value: string) => {
      onPayloadChange?.(fsiNode.id, key, value);
    },
    [fsiNode.id, onPayloadChange],
  );

  const patchPayload = useCallback(
    (patch: Record<string, unknown>) => {
      onStructuredPayloadPatch?.(fsiNode.id, patch);
    },
    [fsiNode.id, onStructuredPayloadPatch],
  );

  const uiExpanded = isNodeUiExpanded(payload);
  const cardW = nodeCardWidth(payload, uiExpanded);
  const cardH = nodeCardHeight(payload, uiExpanded);

  const inputClass =
    "nodrag nopan nowheel w-full rounded border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-emerald-700 focus:outline-none";

  useEffect(() => {
    setTitleEditing(false);
  }, [fsiNode.id]);

  // Fields are editable based on edit permission alone (not selection). Gating on
  // `selected` meant focusing a field auto-selected the node, which restructured it
  // (static → inputs), grew it, and fired a re-measure that blurred you mid-type.
  const editing = canEdit;
  const editingTitle = titleEditing && canEdit;
  const isScreenshot = isScreenshotNode(fsiNode);
  const screenshotUrl = getScreenshotImageUrl(fsiNode);
  const [replacingScreenshot, setReplacingScreenshot] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    updateNodeInternals(id);
    const ro = new ResizeObserver(() => updateNodeInternals(id));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, updateNodeInternals, isScreenshot, screenshotUrl, fieldDefs.length]);

  // Interacting with a node's form field must NOT select/drag the node. React Flow's
  // node selection & drag run on NATIVE listeners on the parent .react-flow__node, so
  // React's synthetic stopPropagation on the input fires too late. Stop these events
  // natively at the node root (a child of .react-flow__node) whenever the target is an
  // editable field — clicks on the rest of the node still select/drag as normal.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const stopFieldEvents = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, [contenteditable='true']")) {
        e.stopPropagation();
      }
    };
    el.addEventListener("pointerdown", stopFieldEvents);
    el.addEventListener("mousedown", stopFieldEvents);
    el.addEventListener("click", stopFieldEvents);
    el.addEventListener("dblclick", stopFieldEvents);
    return () => {
      el.removeEventListener("pointerdown", stopFieldEvents);
      el.removeEventListener("mousedown", stopFieldEvents);
      el.removeEventListener("click", stopFieldEvents);
      el.removeEventListener("dblclick", stopFieldEvents);
    };
  }, []);

  const isLink = isLinkNode(fsiNode);
  const isNiche = nodeData.nodeType === "Niche";
  const noteInputClass =
    "nodrag nopan nowheel w-full rounded-sm border border-amber-900/20 bg-amber-50/80 px-2.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-amber-700 focus:outline-none";
  const nicheFieldClass =
    "nodrag nopan nowheel w-full rounded border border-amber-950/45 bg-amber-950/35 px-2 py-1.5 text-xs text-emerald-950 placeholder:text-emerald-900/35 focus:border-amber-900 focus:outline-none";
  const fieldInputClass = isNiche ? nicheFieldClass : inputClass;
  const borderClass = isNiche ? "border-amber-950/30" : "border-emerald-900/30";

  const renderFieldValue = (def: (typeof fieldDefs)[0], val: string) => {
    if (def.linkify || looksLikeUrl(val)) {
      return (
        <a
          href={normalizeLinkHref(val)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${fieldInputClass} block truncate underline decoration-emerald-950/40 hover:decoration-emerald-950`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {val || "—"}
        </a>
      );
    }
    if (def.inputType === "textarea") {
      return (
        <div className={`${fieldInputClass} min-h-[2rem] whitespace-pre-wrap`}>
          <FsiLinkifiedText text={val} />
        </div>
      );
    }
    return <div className={fieldInputClass}>{val || "—"}</div>;
  };

  const renderFieldInput = (def: (typeof fieldDefs)[0], val: string) => {
    if (def.inputType === "textarea") {
      return editing ? (
        <textarea
          rows={def.rows ?? 2}
          value={val}
          onChange={(e) => setFieldValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
          onBlur={(e) => commitField(def.key, e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${fieldInputClass} resize-none`}
        />
      ) : (
        renderFieldValue(def, val)
      );
    }
    if (def.inputType === "select") {
      return editing ? (
        <select
          value={val || "Average"}
          onChange={(e) => {
            setFieldValues((prev) => ({ ...prev, [def.key]: e.target.value }));
            commitField(def.key, e.target.value);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={fieldInputClass}
        >
          {(def.selectOptions ?? PERFORMANCE_LABELS).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className={fieldInputClass}>{val || "Average"}</div>
      );
    }
    return editing ? (
      <input
        type={def.inputType === "number" ? "number" : "text"}
        value={val}
        onChange={(e) => setFieldValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
        onBlur={(e) => commitField(def.key, e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={fieldInputClass}
      />
    ) : (
      renderFieldValue(def, val)
    );
  };

  const renderFields = () => {
    if (fieldDefs.length === 0 || !uiExpanded) return null;
    const visibleDefs = fieldDefs.filter(
      (def) => canEdit || Boolean((fieldValues[def.key] ?? "").trim()),
    );
    if (visibleDefs.length === 0) return null;

    return (
      <div className="max-h-40 space-y-2 overflow-y-auto border-t border-black/10 px-2 pb-2 pt-2">
        {visibleDefs.map((def) => {
          const val = fieldValues[def.key] ?? "";
          return (
            <div key={def.key}>
              <label className="mb-0.5 block text-[9px] font-semibold uppercase text-black/70">
                {def.label}
              </label>
              {canEdit ? renderFieldInput(def, val) : renderFieldValue(def, val)}
            </div>
          );
        })}
      </div>
    );
  };

  const hookHasBody =
    nodeData.nodeType === "Written Hook" ||
    nodeData.nodeType === "Visual Hook" ||
    nodeData.nodeType === "Hook Pattern" ||
    nodeData.nodeType === "Hook Example";

  if (isScreenshot) {
    const replaceScreenshot = async (files: File[]) => {
      if (!canEdit || !editing || files.length === 0) return;
      setReplacingScreenshot(true);
      try {
        const urls = await uploadFsiNodeScreenshotFiles({
          studyId: fsiNode.study_id,
          nodeId: fsiNode.id,
          files: [files[0]!],
        });
        if (urls[0]) onPayloadChange?.(fsiNode.id, "image_url", urls[0]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Screenshot upload failed");
      } finally {
        setReplacingScreenshot(false);
      }
    };

    return (
      <div
        ref={rootRef}
        className={`relative w-[280px] overflow-visible rounded-md border-2 border-pink-500/80 bg-zinc-950 shadow-lg ${selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)]" : ""
          }`}
        onPaste={(e) => {
          if (!editing) return;
          const files = clipboardImageFiles(e.clipboardData);
          if (files.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          void replaceScreenshot(files);
        }}
      >
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-pink-200/90">
          Visual
        </div>
        {screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt="Canvas screenshot"
            className="pointer-events-none block max-h-72 w-full object-contain bg-black/40"
            draggable={false}
            onLoad={() => updateNodeInternals(id)}
          />
        ) : (
          <div className="flex min-h-[120px] items-center justify-center px-3 text-xs text-zinc-400">
            {replacingScreenshot ? "Uploading…" : "Paste or drop an image"}
          </div>
        )}
        {editing && canEdit && (
          <div className="flex items-center justify-between border-t border-pink-500/30 px-2 py-1.5">
            <span className="text-[9px] text-pink-200/70">Drag to move · paste to replace</span>
            {replacingScreenshot && <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-200" />}
          </div>
        )}
        <FsiNodeHandles
          canStartConnection={canEdit}
          canAcceptConnection={nodeData.isConnecting}
          requiredAnchors={connectionAnchors}
          showConnectionDots={showConnectionDots || selected}
        />
      </div>
    );
  }

  if (isCompact) {
    const carousel = isCarouselBodyNode(fsiNode);
    const slides = parseSlidesContent(payload);
    const titleEmpty = isUnsetNodeTitle(title, nodeData.nodeType);

    return (
      <div
        ref={rootRef}
        className={`relative box-border flex flex-col overflow-hidden rounded-2xl border-2 shadow-lg ${selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)] ring-offset-0" : ""
          }`}
        style={{
          width: cardW,
          height: uiExpanded ? cardH : COMPACT_NODE_HEIGHT,
          borderColor: nodeData.color,
          backgroundColor: nodeData.color,
        }}
      >
        {uiExpanded && canEdit && selected && (
          <NodeResizer
            minWidth={COMPACT_NODE_WIDTH}
            minHeight={COMPACT_NODE_HEIGHT}
            onResizeEnd={(_event, params) => {
              patchPayload({
                card_width: Math.round(params.width),
                card_height: Math.round(params.height),
              });
            }}
          />
        )}
        <FsiNodeExpandToggle
          expanded={uiExpanded}
          onToggle={() => patchPayload({ ui_expanded: !uiExpanded })}
        />
        <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5 pr-7">
          <div className={NODE_TYPE_LABEL_CLASS}>{nodeData.nodeType}</div>
          {canEdit ? (
            <input
              value={titleEmpty ? "" : title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={NODE_TITLE_INPUT_CLASS}
              placeholder={nodeData.nodeType}
            />
          ) : titleEmpty ? (
            <div className={NODE_TITLE_EMPTY_CLASS}>{nodeData.nodeType}</div>
          ) : (
            <div className={NODE_TITLE_DISPLAY_CLASS}>{title}</div>
          )}
          {uiExpanded && hookHasBody && (
            <textarea
              rows={5}
              disabled={!canEdit}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={(e) => commitBody(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Hook copy…"
              className={`${NODE_BODY_BOX_CLASS} mt-2 min-h-[80px]`}
            />
          )}
          {uiExpanded && carousel && (
            <FsiCarouselSlidesEditor
              slides={slides}
              canEdit={canEdit}
              onChange={(rows) => patchPayload({ slides_content: rows })}
            />
          )}
          {renderFields()}
        </div>
        <FsiNodeHandles
          canStartConnection={canEdit}
          canAcceptConnection={nodeData.isConnecting}
          requiredAnchors={connectionAnchors}
          showConnectionDots={showConnectionDots || selected}
        />
      </div>
    );
  }

  if (isLink) {
    const url = fieldValues.url ?? "";
    const showUrl = Boolean(url.trim()) || editingTitle;
    return (
      <div
        ref={rootRef}
        className={`relative box-border overflow-visible rounded-md border-2 px-4 py-2.5 shadow-lg ${selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)] ring-offset-0" : ""
          }`}
        style={{
          width: LINK_NODE_WIDTH,
          minHeight: LINK_NODE_HEIGHT,
          borderColor: nodeData.color,
          backgroundColor: nodeData.color,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (canEdit) setTitleEditing(true);
        }}
      >
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => {
              commitTitle(e.target.value);
              setTitleEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(fsiNode.display_title);
                setTitleEditing(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nopan nowheel mb-1 w-full bg-transparent text-center text-sm font-semibold text-emerald-950 placeholder:text-emerald-900/40 focus:outline-none"
            placeholder="Link name"
          />
        ) : (
          <div className="text-center text-sm font-semibold leading-tight text-emerald-950">
            {title || "Link"}
          </div>
        )}
        <div className="text-center text-[9px] font-medium uppercase tracking-wide text-emerald-950/70">
          Link
        </div>
        {showUrl && (
          <div className="mt-2 border-t border-emerald-900/25 px-1 pt-2">
            {editingTitle ? (
              <input
                type="text"
                value={url}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, url: e.target.value }))}
                onBlur={(e) => commitField("url", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="https://…"
                className={`${inputClass} text-center`}
              />
            ) : (
              <a
                href={normalizeLinkHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${inputClass} block truncate text-center underline`}
                onClick={(e) => e.stopPropagation()}
              >
                {url || "Add URL (double-click to edit)"}
              </a>
            )}
          </div>
        )}
        <FsiNodeHandles
          canStartConnection={canEdit}
          canAcceptConnection={nodeData.isConnecting}
          requiredAnchors={connectionAnchors}
          showConnectionDots={showConnectionDots || selected}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative overflow-visible min-w-[200px] max-w-[300px] rounded-md border-2 shadow-lg ${selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)]" : ""
        }`}
      style={{
        borderColor: isNote ? "#eab308" : nodeData.color,
        backgroundColor: isNote ? "#fef08a" : nodeData.color,
      }}
    >
      {isNote ? (
        <>
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
              Sticky Note
            </div>
          </div>
          <div className="px-3 pb-3">
            {editing ? (
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={(e) => commitBody(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="post_id, views, url…"
                className={`${noteInputClass} resize-none`}
              />
            ) : (
              <div className={`${noteInputClass} min-h-[3rem] whitespace-pre-wrap`}>
                {body ? <FsiLinkifiedText text={body} /> : "Empty note"}
              </div>
            )}
          </div>
        </>
      ) : isNiche ? (
        <>
          <div className="px-3 py-2.5">
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => commitTitle(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Niche name"
                className={`${nicheFieldClass} mb-1 text-sm font-bold`}
              />
            ) : (
              <div className="text-sm font-bold leading-tight text-emerald-950">{title || "Niche"}</div>
            )}
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-950/70">Niche</div>
          </div>
          {renderFields()}
        </>
      ) : (
        <>
          <div className="px-3 py-2.5">
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => commitTitle(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={`${inputClass} mb-1 text-sm font-bold`}
              />
            ) : (
              <div className="text-sm font-bold leading-tight text-emerald-950">{title}</div>
            )}
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-950/70">
              {nodeData.nodeType}
            </div>
          </div>
          {renderFields()}
        </>
      )}

      <FsiNodeHandles
        canStartConnection={canEdit}
        canAcceptConnection={nodeData.isConnecting}
        requiredAnchors={connectionAnchors}
      />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
