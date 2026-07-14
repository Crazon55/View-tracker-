// Role → per-area access editor. Each role expands to a View/Edit-per-tab matrix.
// Reads persisted overrides (merged over defaults) and saves per role to the backend.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getRoleAccess, setRoleAccess } from "@/services/api";
import {
  AREAS, ALL_ROLES, AREA_KEYS, resolveRoleAccess,
  type AreaKey, type AreaLevel, type AccessOverrides,
} from "@/lib/accessModel";

const GROUP_ORDER = ["Content", "Growth", "Canvas", "Seeding", "Admin"] as const;
const LEVELS: AreaLevel[] = ["none", "view", "edit"];
const LEVEL_LABEL: Record<AreaLevel, string> = { none: "—", view: "View", edit: "Edit" };
const LEVEL_ON: Record<AreaLevel, { bg: string; fg: string }> = {
  none: { bg: "rgba(255,255,255,.10)", fg: "#e5e5ea" },
  view: { bg: "rgba(56,189,248,.22)", fg: "#7dd3fc" },
  edit: { bg: "rgba(34,197,94,.22)", fg: "#86efac" },
};

export function RoleAccessEditor() {
  const qc = useQueryClient();
  const { data: overrides = {} } = useQuery({
    queryKey: ["role-access"],
    queryFn: async () => ((await getRoleAccess()) ?? {}) as AccessOverrides,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<AreaKey, AreaLevel>>>({});

  const saveMut = useMutation({
    mutationFn: ({ role, matrix }: { role: string; matrix: Record<AreaKey, AreaLevel> }) =>
      setRoleAccess(role, matrix),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["role-access"] });
      setDraft((p) => { const n = { ...p }; delete n[vars.role]; return n; });
      toast.success("Access updated");
    },
    onError: () => toast.error("Failed to save access"),
  });

  const matrixFor = (role: string): Record<AreaKey, AreaLevel> =>
    draft[role] ?? resolveRoleAccess(role, overrides);

  const setLevel = (role: string, area: AreaKey, level: AreaLevel) =>
    setDraft((p) => ({ ...p, [role]: { ...matrixFor(role), [area]: level } }));

  const setGroupAll = (role: string, group: string, level: AreaLevel) => {
    const next = { ...matrixFor(role) };
    for (const a of AREAS) if (a.group === group) next[a.key] = level;
    setDraft((p) => ({ ...p, [role]: next }));
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {ALL_ROLES.map((r) => {
        const isOpen = open === r.key;
        const matrix = matrixFor(r.key);
        const dirty = !!draft[r.key];
        const editCount = AREA_KEYS.filter((k) => matrix[k] === "edit").length;
        const viewCount = AREA_KEYS.filter((k) => matrix[k] === "view").length;
        return (
          <div key={r.key} className="seeding-surface" style={{ padding: "14px 16px", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: "var(--f-faint)" }}>
                  {r.key === "admin" ? "Full access" : `${editCount} edit · ${viewCount} view`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="f-ghost"
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--f-line)", borderRadius: 8, padding: "6px 10px" }}
                >
                  Edit access
                  <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                </button>
                <button
                  type="button"
                  className="f-primary"
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => saveMut.mutate({ role: r.key, matrix })}
                  style={{ fontSize: 12, padding: "6px 14px", opacity: dirty ? 1 : 0.5 }}
                >
                  {saveMut.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--f-line)", display: "grid", gap: 16 }}>
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
                              onClick={() => setGroupAll(r.key, group, lvl)}
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
                                const on = matrix[a.key] === lvl;
                                return (
                                  <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => setLevel(r.key, a.key, lvl)}
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
                {r.key === "admin" && (
                  <div style={{ fontSize: 11, color: "var(--f-faint)" }}>
                    Admin always has full access — changes here are ignored for safety.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
