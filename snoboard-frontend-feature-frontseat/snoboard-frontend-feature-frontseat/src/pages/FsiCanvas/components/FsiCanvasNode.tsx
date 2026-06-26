import { memo, useCallback, useEffect, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { FsiLinkifiedText, looksLikeUrl, normalizeLinkHref } from "../lib/fsiLinkText";
import { uploadFsiNodeScreenshotFiles } from "../lib/fsiNodeMedia";
import { getScreenshotImageUrl, isScreenshotNode } from "../lib/fsiHierarchy";
import { clipboardImageFiles } from "../lib/fsiScreenshotNode";
import { isLinkNode } from "../lib/fsiWhiteboardTypes";
import FsiNodeHandles from "./FsiNodeHandles";

function FsiCanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
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
  } = nodeData;

  const [title, setTitle] = useState(fsiNode.display_title);
  const [body, setBody] = useState(fsiNode.raw_body_text ?? "");
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

  const inputClass =
    "nodrag nopan w-full rounded border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-emerald-700 focus:outline-none";

  const editing = selected && canEdit;
  const isScreenshot = isScreenshotNode(fsiNode);
  const screenshotUrl = getScreenshotImageUrl(fsiNode);
  const [replacingScreenshot, setReplacingScreenshot] = useState(false);

  const isLink = isLinkNode(fsiNode);
  const isNiche = nodeData.nodeType === "Niche";
  const noteInputClass =
    "nodrag nopan w-full rounded-sm border border-amber-900/20 bg-amber-50/80 px-2.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-amber-700 focus:outline-none";
  const nicheFieldClass =
    "nodrag nopan w-full rounded border border-amber-950/45 bg-amber-950/35 px-2 py-1.5 text-xs text-emerald-950 placeholder:text-emerald-900/35 focus:border-amber-900 focus:outline-none";
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
        className={fieldInputClass}
      />
    ) : (
      renderFieldValue(def, val)
    );
  };

  const renderFields = () => {
    if (fieldDefs.length === 0) return null;
    const visibleDefs = fieldDefs.filter(
      (def) => editing || Boolean((fieldValues[def.key] ?? "").trim()),
    );
    if (visibleDefs.length === 0) return null;

    return (
      <div className={`max-h-56 space-y-2 overflow-y-auto border-t ${borderClass} px-3 pb-3 pt-2`}>
        {visibleDefs.map((def) => {
          const val = fieldValues[def.key] ?? "";
          return (
            <div key={def.key}>
              <label className="mb-0.5 block text-[9px] font-semibold uppercase text-emerald-950/70">
                {def.label}
              </label>
              {renderFieldInput(def, val)}
            </div>
          );
        })}
      </div>
    );
  };

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
        className={`relative w-[280px] overflow-visible rounded-md border-2 border-pink-500/80 bg-zinc-950 shadow-lg ${
          selected ? "ring-2 ring-white/50" : ""
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
          largeHitZone
          requiredAnchors={connectionAnchors}
        />
      </div>
    );
  }

  if (isCompact) {
    return (
      <div
        className={`relative overflow-visible min-w-[120px] max-w-[280px] rounded-md border-2 px-4 py-2.5 shadow-lg ${
          selected ? "ring-2 ring-white/50" : ""
        }`}
        style={{ borderColor: nodeData.color, backgroundColor: nodeData.color }}
      >
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            className="nodrag nopan w-full bg-transparent text-center text-sm font-semibold text-emerald-950 placeholder:text-emerald-900/40 focus:outline-none"
            placeholder={nodeData.nodeType}
          />
        ) : (
          <div className="text-center text-sm font-semibold leading-tight text-emerald-950">
            {title || nodeData.nodeType}
          </div>
        )}
        <div className="mt-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-emerald-950/70">
          {nodeData.nodeType}
        </div>
        <FsiNodeHandles
          canStartConnection={canEdit}
          requiredAnchors={connectionAnchors}
        />
      </div>
    );
  }

  if (isLink) {
    const url = fieldValues.url ?? "";
    const showUrl = editing || Boolean(url.trim());
    return (
      <div
        className={`relative overflow-visible min-w-[160px] max-w-[280px] rounded-md border-2 px-4 py-2.5 shadow-lg ${
          selected ? "ring-2 ring-white/50" : ""
        }`}
        style={{ borderColor: nodeData.color, backgroundColor: nodeData.color }}
      >
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            className="nodrag nopan mb-1 w-full bg-transparent text-center text-sm font-semibold text-emerald-950 placeholder:text-emerald-900/40 focus:outline-none"
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
            {editing ? (
              <input
                type="text"
                value={url}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, url: e.target.value }))}
                onBlur={(e) => commitField("url", e.target.value)}
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
                {url}
              </a>
            )}
          </div>
        )}
        <FsiNodeHandles
          canStartConnection={canEdit}
          requiredAnchors={connectionAnchors}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-visible min-w-[200px] max-w-[300px] rounded-md border-2 shadow-lg ${
        selected ? "ring-2 ring-white/50" : ""
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

      <FsiNodeHandles canStartConnection={canEdit} requiredAnchors={connectionAnchors} />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
