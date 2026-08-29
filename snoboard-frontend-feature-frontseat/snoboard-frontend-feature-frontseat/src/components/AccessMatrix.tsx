// Reusable View/Edit-per-tab access matrix (grouped areas with —/View/Edit toggles).
// Controlled: pass the current matrix + an onChange(area, level).
import { AREAS, AREA_GROUP_ORDER, type AreaKey, type AreaLevel } from "@/lib/accessModel";

const GROUP_ORDER = AREA_GROUP_ORDER;
const LEVELS: AreaLevel[] = ["none", "view", "edit"];
const LEVEL_LABEL: Record<AreaLevel, string> = { none: "—", view: "View", edit: "Edit" };
const LEVEL_ON: Record<AreaLevel, { bg: string; fg: string }> = {
  none: { bg: "rgba(255,255,255,.10)", fg: "#e5e5ea" },
  view: { bg: "rgba(56,189,248,.22)", fg: "#7dd3fc" },
  edit: { bg: "rgba(34,197,94,.22)", fg: "#86efac" },
};

export function AccessMatrix({
  value,
  onChange,
}: {
  value: Record<AreaKey, AreaLevel>;
  onChange: (area: AreaKey, level: AreaLevel) => void;
}) {
  const setGroupAll = (group: string, level: AreaLevel) => {
    for (const a of AREAS) if (a.group === group) onChange(a.key, level);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {GROUP_ORDER.map((group) => {
        const areas = AREAS.filter((a) => a.group === group);
        if (!areas.length) return null;
        return (
          <div key={group}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="f-eyebrow">{group}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setGroupAll(group, lvl)}
                    style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--f-faint)", background: "none", border: "1px solid var(--f-line)", borderRadius: 6, padding: "2px 6px", cursor: "pointer" }}
                    title={`Set all ${group} to ${LEVEL_LABEL[lvl]}`}
                  >
                    all {LEVEL_LABEL[lvl]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {areas.map((a) => (
                <div key={a.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13 }}>{a.label}</span>
                  <div style={{ display: "inline-flex", gap: 2, background: "rgba(0,0,0,.35)", border: "1px solid var(--f-line)", borderRadius: 9, padding: 2, flexShrink: 0 }}>
                    {LEVELS.map((lvl) => {
                      const on = value[a.key] === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => onChange(a.key, lvl)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                            background: on ? LEVEL_ON[lvl].bg : "transparent",
                            color: on ? LEVEL_ON[lvl].fg : "var(--f-dim)",
                          }}
                        >
                          {LEVEL_LABEL[lvl]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
