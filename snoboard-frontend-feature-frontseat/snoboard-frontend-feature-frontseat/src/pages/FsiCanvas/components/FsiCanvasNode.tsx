import { memo, useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FsiNodeData } from "../lib/fsiFlowAdapter";
import { PERFORMANCE_LABELS } from "../lib/fsiNodeSchemas";
import { parseNodeScreenshots } from "../lib/fsiNodeMedia";
import { FsiNodeContentBlock, FsiNodeScreenshotsBlock } from "./FsiNodeContentBlocks";

function FsiCanvasNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FsiNodeData;
  const {
    fsiNode,
    canEdit,
    isNote,
    fieldDefs,
    onTitleChange,
    onBodyChange,
    onPayloadChange,
    onScreenshotsChange,
  } = nodeData;

  const [title, setTitle] = useState(fsiNode.display_title);
  const [body, setBody] = useState(fsiNode.raw_body_text ?? "");
  const payload = fsiNode.structured_payload ?? {};
  const [screenshots, setScreenshots] = useState<string[]>(() => parseNodeScreenshots(payload));
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fieldDefs.map((def) => [def.key, String(payload[def.key] ?? "")])),
  );

  useEffect(() => {
    setTitle(fsiNode.display_title);
    setBody(fsiNode.raw_body_text ?? "");
  }, [fsiNode.display_title, fsiNode.raw_body_text]);

  useEffect(() => {
    setScreenshots(parseNodeScreenshots(fsiNode.structured_payload));
  }, [fsiNode.id, fsiNode.structured_payload]);

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

  const commitScreenshots = useCallback(
    (next: string[]) => {
      setScreenshots(next);
      onScreenshotsChange?.(fsiNode.id, next);
    },
    [fsiNode.id, onScreenshotsChange],
  );

  const inputClass =
    "nodrag nopan w-full rounded border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-emerald-700 focus:outline-none";

  const editing = selected && canEdit;
  const isNiche = nodeData.nodeType === "Niche";
  const noteInputClass =
    "nodrag nopan w-full rounded-md border border-amber-900/30 bg-amber-950/25 px-2.5 py-2 text-xs text-emerald-950 placeholder:text-emerald-900/40 focus:border-amber-800 focus:outline-none";
  const nicheFieldClass =
    "nodrag nopan w-full rounded border border-amber-950/45 bg-amber-950/35 px-2 py-1.5 text-xs text-emerald-950 placeholder:text-emerald-900/35 focus:border-amber-900 focus:outline-none";
  const fieldInputClass = isNiche ? nicheFieldClass : inputClass;
  const borderClass = isNiche ? "border-amber-950/30" : "border-emerald-900/30";

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
        <div className={`${fieldInputClass} min-h-[2rem] whitespace-pre-wrap`}>{val || "—"}</div>
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
      <div className={fieldInputClass}>{val || "—"}</div>
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

  const renderContentAndScreenshots = (fieldClass: string) => {
    const showSection = Boolean(body) || screenshots.length > 0 || editing;
    if (!showSection) return null;

    return (
      <div className={`space-y-2 border-t ${borderClass} px-3 pb-3 pt-2`}>
        <FsiNodeContentBlock
          value={body}
          canEdit={canEdit}
          editing={editing}
          placeholder="Notes, links, context…"
          inputClass={fieldClass}
          onChange={setBody}
          onCommit={commitBody}
        />
        <FsiNodeScreenshotsBlock
          studyId={fsiNode.study_id}
          nodeId={fsiNode.id}
          screenshots={screenshots}
          canEdit={canEdit}
          editing={editing}
          inputClass={fieldClass}
          onChange={commitScreenshots}
        />
      </div>
    );
  };

  return (
    <div
      className={`min-w-[200px] max-w-[300px] rounded-md border-2 shadow-lg ${
        selected ? "ring-2 ring-white/50" : ""
      }`}
      style={{ borderColor: nodeData.color, backgroundColor: nodeData.color }}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-emerald-900 !bg-white" />

      {isNote ? (
        <>
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-950">Note</div>
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
                {body || "Empty note"}
              </div>
            )}
          </div>
          {(screenshots.length > 0 || editing) && (
            <div className="space-y-2 border-t border-amber-950/30 px-3 pb-3 pt-2">
              <FsiNodeScreenshotsBlock
                studyId={fsiNode.study_id}
                nodeId={fsiNode.id}
                screenshots={screenshots}
                canEdit={canEdit}
                editing={editing}
                inputClass={noteInputClass}
                onChange={commitScreenshots}
              />
            </div>
          )}
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
          {renderContentAndScreenshots(nicheFieldClass)}
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
          {renderContentAndScreenshots(inputClass)}
        </>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-emerald-900 !bg-white" />
    </div>
  );
}

export default memo(FsiCanvasNodeComponent);
