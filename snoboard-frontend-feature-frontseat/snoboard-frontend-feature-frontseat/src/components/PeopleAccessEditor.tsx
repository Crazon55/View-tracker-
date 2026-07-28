// Per-PERSON access editor. Each person: multi-role checkboxes + View/Edit-per-tab matrix.
// Roles are stored as a comma-joined string (same convention as Team Roles).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getUserAccess, setUserAccess, setUserRole, deleteUserRole } from "@/services/api";
import { api as seedingApi } from "@/services/seeding/client";
import { AccessMatrix } from "@/components/AccessMatrix";
import { ALL_ROLES, AREA_KEYS, resolvePersonAccess, type AreaKey, type AreaLevel } from "@/lib/accessModel";

type Person = { name: string; email: string; seeding_role?: string | null; fsos_role?: string | null };

function parseRoles(roleStr: string | null | undefined): string[] {
  if (!roleStr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(roleStr).split(",").map((r) => r.trim().toLowerCase()).filter(Boolean)) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function rolesKey(roles: string[]): string {
  return [...roles].sort().join(",");
}

/** A prior bug saved multi-role as all-none. Ignore that so role defaults show. */
function isBlankAllNone(
  saved: Partial<Record<AreaKey, AreaLevel>> | undefined,
  roleDefaults: Record<AreaKey, AreaLevel>,
): boolean {
  if (!saved || !Object.keys(saved).length) return true;
  const savedAllNone = AREA_KEYS.every((k) => (saved[k] ?? "none") === "none");
  const roleHasAccess = AREA_KEYS.some((k) => roleDefaults[k] !== "none");
  return savedAllNone && roleHasAccess;
}

export function PeopleAccessEditor({
  people,
  onRoleChanged,
}: {
  people: Person[];
  onRoleChanged: (email: string, role: string | null, name: string) => void;
}) {
  const qc = useQueryClient();
  const { data: userAccess = {} } = useQuery({
    queryKey: ["user-access"],
    queryFn: async () => ((await getUserAccess()) ?? {}) as Record<string, Record<AreaKey, AreaLevel>>,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<AreaKey, AreaLevel>>>({});
  const [roleDraft, setRoleDraft] = useState<Record<string, string[]>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);

  const key = (e: string) => e.trim().toLowerCase();
  const rolesFor = (p: Person) => roleDraft[key(p.email)] ?? parseRoles(p.fsos_role);
  const roleStrFor = (p: Person) => rolesFor(p).join(",");

  const matrixFor = (p: Person): Record<AreaKey, AreaLevel> => {
    const k = key(p.email);
    if (draft[k]) return draft[k];
    const role = roleStrFor(p) || "pending";
    // Multi-role must use resolvePersonAccess (comma-join is not a single role key).
    const roleDefaults = resolvePersonAccess(role, null);
    const saved = userAccess[k];
    if (isBlankAllNone(saved, roleDefaults)) return roleDefaults;
    return resolvePersonAccess(role, saved);
  };

  const setLevel = (p: Person, area: AreaKey, level: AreaLevel) =>
    setDraft((prev) => ({ ...prev, [key(p.email)]: { ...matrixFor(p), [area]: level } }));

  const toggleRole = (p: Person, role: string) => {
    const k = key(p.email);
    const cur = rolesFor(p);
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setRoleDraft((prev) => ({ ...prev, [k]: next }));
    // Rebuild matrix from the selected roles' defaults (highest wins per area).
    setDraft((prev) => ({
      ...prev,
      [k]: resolvePersonAccess(next.join(",") || "pending", null),
    }));
  };

  const dirty = (p: Person) => {
    const k = key(p.email);
    const rolesChanged = roleDraft[k] !== undefined
      && rolesKey(roleDraft[k]) !== rolesKey(parseRoles(p.fsos_role));
    if (rolesChanged || !!draft[k]) return true;
    // Prompt Save when a corrupt all-none matrix is being healed from role defaults.
    const role = roleStrFor(p) || "pending";
    const roleDefaults = resolvePersonAccess(role, null);
    return isBlankAllNone(userAccess[k], roleDefaults) && AREA_KEYS.some((a) => roleDefaults[a] !== "none");
  };

  const saveMut = useMutation({
    mutationFn: async (p: Person) => {
      const roles = rolesFor(p);
      const role = roles.join(",");
      const prev = p.fsos_role ?? "";
      if (rolesKey(roles) !== rolesKey(parseRoles(prev))) {
        if (!roles.length) await deleteUserRole(p.email);
        else await setUserRole({ email: p.email, role, name: p.name });
        onRoleChanged(p.email, role || null, p.name);
      }
      await setUserAccess(p.email, matrixFor(p));
      return p;
    },
    onSuccess: (p) => {
      const k = key(p.email);
      qc.invalidateQueries({ queryKey: ["user-access"] });
      setDraft((prev) => { const n = { ...prev }; delete n[k]; return n; });
      setRoleDraft((prev) => { const n = { ...prev }; delete n[k]; return n; });
      toast.success(`Saved ${p.name || p.email}`);
    },
    onError: () => toast.error("Failed to save"),
  });

  const del = async (p: Person) => {
    if (!window.confirm(`Remove ${p.name || p.email}'s role & access?`)) return;
    const email = p.email;
    try {
      await deleteUserRole(email);
    } catch (err: any) {
      // Backend now treats missing FSOS role as success; keep going for seeding cleanup.
      const msg = String(err?.message || "");
      if (!/not found/i.test(msg)) {
        toast.error(msg || "Failed to remove role");
        return;
      }
    }
    try {
      await setUserAccess(email, {});
    } catch { /* optional */ }
    try {
      await seedingApi.delete(`/users/by-email?email=${encodeURIComponent(email)}`);
    } catch { /* seeding profile may not exist */ }
    onRoleChanged(email, null, p.name);
    toast.success(`Removed ${p.name || email}`);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {people.map((p) => {
        const k = key(p.email);
        const isOpen = open === k;
        const isPickerOpen = pickerOpen === k;
        const matrix = matrixFor(p);
        const selected = rolesFor(p);
        const editCount = AREA_KEYS.filter((a) => matrix[a] === "edit").length;
        const viewCount = AREA_KEYS.filter((a) => matrix[a] === "view").length;
        const saving = saveMut.isPending && saveMut.variables?.email === p.email;
        return (
          <div key={p.email} className="seeding-surface" style={{ padding: "12px 16px", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--f-faint)" }}>{p.email}</div>
                <div style={{ fontSize: 11, color: "var(--f-faint)", marginTop: 2 }}>{editCount} edit · {viewCount} view</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 320 }}>
                  {selected.filter((r) => r !== "pending").length ? selected.filter((r) => r !== "pending").map((r) => {
                    const label = ALL_ROLES.find((x) => x.key === r)?.short ?? r;
                    return (
                      <span
                        key={r}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                          border: "1px solid var(--f-line)", color: "var(--f-ink)", textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {label}
                      </span>
                    );
                  }) : (
                    <span style={{ fontSize: 11, color: "var(--f-faint)" }}>
                      {selected.includes("pending") ? "Pending access" : "No roles"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="f-ghost"
                  disabled={saving}
                  onClick={() => setPickerOpen(isPickerOpen ? null : k)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--f-line)", borderRadius: 8, padding: "6px 10px" }}
                >
                  Edit roles
                  <ChevronDown size={12} style={{ transform: isPickerOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                </button>
                <button
                  type="button"
                  className="f-ghost"
                  onClick={() => setOpen(isOpen ? null : k)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--f-line)", borderRadius: 8, padding: "6px 10px" }}
                >
                  Edit access
                  <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                </button>
                <button
                  type="button"
                  className="f-primary"
                  disabled={!dirty(p) || saving}
                  onClick={() => {
                    if (!rolesFor(p).length) {
                      toast.error("Select at least one role");
                      return;
                    }
                    saveMut.mutate(p);
                  }}
                  style={{ fontSize: 12, padding: "6px 14px", opacity: dirty(p) ? 1 : 0.5 }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={() => del(p)}
                  className="f-ghost"
                  style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, color: "#f2777c", border: "1px solid var(--f-line)" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {isPickerOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--f-line)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ALL_ROLES.filter((r) => r.key !== "pending").map((r) => {
                  const checked = selected.includes(r.key);
                  return (
                    <label
                      key={r.key}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
                        padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${checked ? "rgba(139,92,246,.45)" : "var(--f-line)"}`,
                        background: checked ? "rgba(139,92,246,.14)" : "transparent",
                        color: checked ? "#c4b5fd" : "var(--f-ink)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={() => toggleRole(p, r.key)}
                        style={{ accentColor: "#8b5cf6" }}
                      />
                      {r.label}
                    </label>
                  );
                })}
              </div>
            )}
            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--f-line)" }}>
                <AccessMatrix value={matrix} onChange={(area, level) => setLevel(p, area, level)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
