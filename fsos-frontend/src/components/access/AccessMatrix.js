// Reusable View/Edit-per-area access matrix (grouped areas with —/View/Edit toggles).
// Controlled: pass the current matrix + onChange(area, level). `disabled` renders read-only.
import React from "react";
import { AREAS, AREA_GROUP_ORDER, LEVELS, LEVEL_LABEL } from "../../domain/access";
import { cn } from "../../lib/utils";

const LEVEL_ON = {
  none: "bg-stone-200 text-stone-700",
  view: "bg-sky-100 text-sky-800",
  edit: "bg-emerald-100 text-emerald-800",
};

const GROUP_NOTE = {
  Workspace: "View and Edit both open these pages; actions inside follow the FSOS role rules.",
};

export function AccessMatrix({ value, onChange, disabled, baseline, testid }) {
  const setGroup = (group, level) => AREAS.filter((a) => a.group === group).forEach((a) => onChange(a.key, level));
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid={testid}>
      {AREA_GROUP_ORDER.map((group) => {
        const areas = AREAS.filter((a) => a.group === group);
        return (
          <div key={group}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500">{group}</span>
              {!disabled && (
                <div className="flex gap-1">
                  {LEVELS.map((l) => (
                    <button key={l} type="button" onClick={() => setGroup(group, l)} title={`Set all ${group} to ${LEVEL_LABEL[l]}`}
                      className="rounded border border-stone-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-stone-400 hover:text-stone-800">all {LEVEL_LABEL[l]}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              {areas.map((a) => {
                const changed = baseline && baseline[a.key] !== value[a.key];
                return (
                  <div key={a.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[13px] text-stone-800">
                      {a.label}
                      {a.external && <span className="text-[10px] text-stone-400">(external)</span>}
                      {changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`Differs from role default (${LEVEL_LABEL[baseline[a.key]]})`} />}
                    </span>
                    <div className="inline-flex shrink-0 gap-0.5 rounded-md border border-stone-200 bg-stone-50 p-0.5">
                      {LEVELS.map((l) => (
                        <button key={l} type="button" disabled={disabled} onClick={() => onChange(a.key, l)} data-testid={testid && `${testid}-${a.key}-${l}`}
                          className={cn("rounded px-2.5 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-default",
                            value[a.key] === l ? LEVEL_ON[l] : "text-stone-400 enabled:hover:text-stone-700")}>
                          {LEVEL_LABEL[l]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {GROUP_NOTE[group] && <p className="mt-1 text-[10px] text-stone-400">{GROUP_NOTE[group]}</p>}
          </div>
        );
      })}
    </div>
  );
}
