import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { FsiLinkifiedText, looksLikeUrl, normalizeLinkHref } from "../lib/fsiLinkText";
import { uploadFsiNodeScreenshotFiles } from "../lib/fsiNodeMedia";
import { getScreenshotImageUrl, isScreenshotNode } from "../lib/fsiHierarchy";
import { clipboardImageFiles } from "../lib/fsiScreenshotNode";
import {
  formatMetricDisplay,
  normalizeMetricStorage,
} from "../lib/fsiMetricFormat";
import {
  COMPACT_NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  DROPDOWN_COLLAPSED_HEIGHT,
  isCarouselBodyNode,
  isDropdownCardNode,
  isLinkNode,
  isNodeUiExpanded,
  NODE_BODY_BOX_CLASS,
  NODE_TYPE_LABEL_CLASS,
  NODE_TITLE_DISPLAY_CLASS,
  NODE_TITLE_EMPTY_CLASS,
  NODE_TITLE_INPUT_CLASS,
  NODE_FIELD_INPUT_CLASS,
  isUnsetNodeTitle,
  nodeCardHeight,
  nodeCardWidth,
  parseSlidesContent,
} from "../lib/fsiWhiteboardTypes";
import FsiNodeHandles from "./FsiNodeHandles";
import FsiNodeExpandToggle from "./FsiNodeExpandToggle";
import FsiCarouselSlidesEditor from "./FsiCarouselSlidesEditor";
import FsiNodeDuplicateCorners, { type DuplicateCorner } from "./FsiNodeDuplicateCorners";
import { cn } from "@/lib/utils";

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
    onRequestDuplicate,
  } = nodeData;

  const [title, setTitle] = useState(fsiNode.display_title);
  const [body, setBody] = useState(() => {
    const raw = fsiNode.raw_body_text ?? "";
    if (raw.trim()) return raw;
    // Legacy hook nodes often stored copy only in display_title
    const t = fsiNode.display_title ?? "";
    if (
      t &&
      !isUnsetNodeTitle(t, fsiNode.node_type) &&
      ["Written Hook", "Visual Hook", "Hook Pattern", "Hook Example"].includes(fsiNode.node_type)
    ) {
      return t;
    }
    return "";
  });
  const [linkUrl, setLinkUrl] = useState(() => String(fsiNode.structured_payload?.url ?? ""));
  const payload = fsiNode.structured_payload ?? {};
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fieldDefs.map((def) => [
        def.key,
        def.inputType === "number"
          ? formatMetricDisplay(payload[def.key]) || String(payload[def.key] ?? "")
          : String(payload[def.key] ?? ""),
      ]),
    ),
  );

  useEffect(() => {
    setTitle(fsiNode.display_title);
    const raw = fsiNode.raw_body_text ?? "";
    if (raw.trim()) {
      setBody(raw);
    } else if (
      ["Written Hook", "Visual Hook", "Hook Pattern", "Hook Example"].includes(fsiNode.node_type) &&
      fsiNode.display_title &&
      !isUnsetNodeTitle(fsiNode.display_title, fsiNode.node_type)
    ) {
      setBody(fsiNode.display_title);
    } else {
      setBody("");
    }
    setLinkUrl(String(fsiNode.structured_payload?.url ?? ""));
  }, [fsiNode.id, fsiNode.display_title, fsiNode.raw_body_text, fsiNode.node_type, fsiNode.structured_payload?.url]);

  useEffect(() => {
    setFieldValues(
      Object.fromEntries(
        fieldDefs.map((def) => [
          def.key,
          def.inputType === "number"
            ? formatMetricDisplay(fsiNode.structured_payload?.[def.key]) ||
              String(fsiNode.structured_payload?.[def.key] ?? "")
            : String(fsiNode.structured_payload?.[def.key] ?? ""),
        ]),
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

  const showDuplicateCorners = Boolean(selected && canEdit && onRequestDuplicate);
  const handleCornerDuplicate = useCallback(
    (corner: DuplicateCorner) => {
      onRequestDuplicate?.(fsiNode.id, corner);
    },
    [fsiNode.id, onRequestDuplicate],
  );

  const uiExpanded = isNodeUiExpanded(payload);
  const cardW = nodeCardWidth(payload, uiExpanded);
  const cardH = nodeCardHeight(payload, uiExpanded);

  const inputClass =
    "nodrag nopan nowheel w-full rounded border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-emerald-700 focus:outline-none";

  // Fields are editable based on edit permission alone (not selection).
  const editing = canEdit;
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

  const isLinkCard = isLinkNode(fsiNode);
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
    if (def.inputType === "number") {
      return <div className={fieldInputClass}>{formatMetricDisplay(val) || "—"}</div>;
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
    if (def.inputType === "number") {
      return editing ? (
        <input
          type="text"
          inputMode="decimal"
          value={val}
          onChange={(e) => setFieldValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
          onBlur={(e) => {
            const stored = normalizeMetricStorage(e.target.value);
            const display = formatMetricDisplay(stored) || stored;
            setFieldValues((prev) => ({ ...prev, [def.key]: display }));
            commitField(def.key, stored);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="e.g. 31k"
          className={fieldInputClass}
        />
      ) : (
        renderFieldValue(def, val)
      );
    }
    return editing ? (
      <input
        type="text"
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

  const renderFields = (opts?: { forceShow?: boolean }) => {
    if (fieldDefs.length === 0) return null;
    if (!opts?.forceShow && !uiExpanded) return null;
    const visibleDefs = fieldDefs.filter(
      (def) => canEdit || Boolean((fieldValues[def.key] ?? "").trim()),
    );
    if (visibleDefs.length === 0) return null;

    return (
      <div className="max-h-40 space-y-2 overflow-y-auto border-t border-black/10 px-1 pb-1 pt-2">
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

  const isWrittenHookOnly =
    nodeData.nodeType === "Written Hook" ||
    (nodeData.nodeType === "Hook Example" && fsiNode.structured_payload?.hook_kind === "written");

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
        className={`relative overflow-visible ${
          selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)] rounded-sm" : ""
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
        {screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt="Canvas screenshot"
            className="pointer-events-none block max-h-80 max-w-[280px] rounded-sm object-contain"
            draggable={false}
            onLoad={() => updateNodeInternals(id)}
          />
        ) : (
          <div className="flex h-[160px] w-[120px] items-center justify-center rounded-sm border border-dashed border-zinc-600 bg-zinc-900/60 px-2 text-center text-[11px] text-zinc-400">
            {replacingScreenshot ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
            ) : (
              "Paste image"
            )}
          </div>
        )}
        <FsiNodeDuplicateCorners visible={showDuplicateCorners} onCornerClick={handleCornerDuplicate} />
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
    const linkUrlEmpty = !linkUrl.trim();
    const isDropdown = isDropdownCardNode(fsiNode);
    const collapsedH = isDropdown ? DROPDOWN_COLLAPSED_HEIGHT : COMPACT_NODE_HEIGHT;
    const toggleExpanded = () => patchPayload({ ui_expanded: !uiExpanded });

    const dropdownLabel = isLinkCard
      ? "Link"
      : nodeData.nodeType === "Performance Insight" || nodeData.nodeType === "Performance"
        ? "Performance"
        : isWrittenHookOnly || nodeData.nodeType === "Written Hook"
          ? "Written Hook"
          : nodeData.nodeType;

    const renderLinkBody = () =>
      canEdit ? (
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onBlur={(e) => commitField("url", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`${NODE_FIELD_INPUT_CLASS} min-w-0 flex-1`}
            placeholder="https://..."
          />
          {!linkUrlEmpty ? (
            <a
              href={normalizeLinkHref(linkUrl)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open link"
              className="nodrag nopan flex h-7 w-7 shrink-0 items-center justify-center self-center rounded text-black/60 hover:bg-black/10 hover:text-black"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ) : null}
        </div>
      ) : linkUrlEmpty ? (
        <div className={NODE_TITLE_EMPTY_CLASS}>https://...</div>
      ) : (
        <a
          href={normalizeLinkHref(linkUrl)}
          target="_blank"
          rel="noopener noreferrer"
          title={linkUrl}
          className={`${NODE_TITLE_DISPLAY_CLASS} cursor-pointer underline decoration-black/40 hover:decoration-black`}
          onClick={(e) => e.stopPropagation()}
        >
          {linkUrl}
        </a>
      );

    const renderHookBody = () =>
      canEdit ? (
        <textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={(e) => {
            const next = e.target.value;
            commitBody(next);
            if (next.trim() && (titleEmpty || title === nodeData.nodeType)) {
              commitTitle(next.trim().slice(0, 80));
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Hook copy…"
          className={`${NODE_BODY_BOX_CLASS} mt-1 min-h-[80px]`}
        />
      ) : (
        <div className={`${NODE_BODY_BOX_CLASS} mt-1 min-h-[80px] whitespace-pre-wrap`}>
          {body ? <FsiLinkifiedText text={body} /> : "—"}
        </div>
      );

    // Accordion dropdown cards: Written Hook / Performance / Link
    if (isDropdown) {
      return (
        <div
          ref={rootRef}
          className={`relative box-border flex flex-col overflow-hidden rounded-2xl border-2 shadow-lg ${
            selected ? "ring-[3px] ring-sky-400 shadow-[0_0_0_5px_rgba(56,189,248,0.28)] ring-offset-0" : ""
          }`}
          style={{
            width: cardW,
            height: uiExpanded ? cardH : collapsedH,
            borderColor: nodeData.color,
            backgroundColor: nodeData.color,
          }}
        >
          {uiExpanded && canEdit && selected && (
            <NodeResizer
              minWidth={COMPACT_NODE_WIDTH}
              minHeight={DROPDOWN_COLLAPSED_HEIGHT + 80}
              onResizeEnd={(_event, params) => {
                patchPayload({
                  card_width: Math.round(params.width),
                  card_height: Math.round(params.height),
                });
              }}
            />
          )}
          <button
            type="button"
            title={uiExpanded ? `Collapse ${dropdownLabel}` : `Expand ${dropdownLabel}`}
            className="nodrag nopan flex h-11 w-full shrink-0 items-center justify-between gap-2 px-3 text-left hover:bg-black/5"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
          >
            <span className={NODE_TYPE_LABEL_CLASS}>{dropdownLabel}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-black/70 transition-transform duration-150",
                uiExpanded && "rotate-180",
              )}
            />
          </button>
          {uiExpanded && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
              {isLinkCard
                ? renderLinkBody()
                : isWrittenHookOnly || hookHasBody
                  ? renderHookBody()
                  : renderFields({ forceShow: true })}
            </div>
          )}
          <FsiNodeDuplicateCorners visible={showDuplicateCorners} onCornerClick={handleCornerDuplicate} />
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
          onToggle={toggleExpanded}
        />
        <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5 pr-7">
          <div className={NODE_TYPE_LABEL_CLASS}>{nodeData.nodeType}</div>
          {hookHasBody ? (
            canEdit ? (
              <textarea
                rows={uiExpanded ? 5 : 2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={(e) => {
                  const next = e.target.value;
                  commitBody(next);
                  if (next.trim() && (titleEmpty || title === nodeData.nodeType)) {
                    commitTitle(next.trim().slice(0, 80));
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Hook copy…"
                className={`${NODE_BODY_BOX_CLASS} mt-2 min-h-[40px] ${uiExpanded ? "min-h-[80px]" : ""}`}
              />
            ) : (
              <div className={`${NODE_BODY_BOX_CLASS} mt-2 min-h-[40px] whitespace-pre-wrap`}>
                {body ? <FsiLinkifiedText text={body} /> : "—"}
              </div>
            )
          ) : canEdit ? (
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
          {uiExpanded && carousel && (
            <FsiCarouselSlidesEditor
              slides={slides}
              canEdit={canEdit}
              onChange={(rows) => patchPayload({ slides_content: rows })}
            />
          )}
          {renderFields()}
        </div>
        <FsiNodeDuplicateCorners visible={showDuplicateCorners} onCornerClick={handleCornerDuplicate} />
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

      <FsiNodeDuplicateCorners visible={showDuplicateCorners} onCornerClick={handleCornerDuplicate} />
      <FsiNodeHandles
        canStartConnection={canEdit}
        canAcceptConnection={nodeData.isConnecting}
        requiredAnchors={connectionAnchors}
      />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
