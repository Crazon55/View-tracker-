// Per-PERSON access editor. Each person: a role dropdown (quick preset) + their own
// View/Edit-per-tab matrix beside it. Role picks a starting matrix; then tune per person.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getUserAccess, setUserAccess, setUserRole, deleteUserRole } from "@/services/api";
import { StatusBadge } from "@/components/seeding/StatusBadge";
import { RoleSelect } from "@/components/RoleSelect";
import { AccessMatrix } from "@/components/AccessMatrix";
import { AREA_KEYS, resolveRoleAccess, type AreaKey, type AreaLevel } from "@/lib/accessModel";

type Person = { name: string; email: string; seeding_role?: string | null; fsos_role?: string | null };

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
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  const key = (e: string) => e.trim().toLowerCase();
  const roleFor = (p: Person) => roleDraft[key(p.email)] ?? p.fsos_role ?? "";

  const matrixFor = (p: Person): Record<AreaKey, AreaLevel> => {
    const k = key(p.email);
    if (draft[k]) return draft[k];
    const role = roleFor(p) || "pending";
    const saved = userAccess[k];
    if (saved && Object.keys(saved).length) return { ...resolveRoleAccess(role), ...saved };
    return resolveRoleAccess(role);
  };

  const setLevel = (p: Person, area: AreaKey, level: AreaLevel) =>
    setDraft((prev) => ({ ...prev, [key(p.email)]: { ...matrixFor(p), [area]: level } }));

  const pickRole = (p: Person, role: string) => {
    const k = key(p.email);
    setRoleDraft((prev) => ({ ...prev, [k]: role }));
    setDraft((prev) => ({ ...prev, [k]: resolveRoleAccess(role || "pending") }));
  };

  const dirty = (p: Person) => {
    const k = key(p.email);
    return !!draft[k] || (roleDraft[k] !== undefined && roleDraft[k] !== (p.fsos_role ?? ""));
  };

  const saveMut = useMutation({
    mutationFn: async (p: Person) => {
      const role = roleFor(p);
      if (role !== (p.fsos_role ?? "")) {
        if (!role) await deleteUserRole(p.email);
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

  const del = (p: Person) => {
    if (!window.confirm(`Remove ${p.name || p.email}'s role & access?`)) return;
    deleteUserRole(p.email).then(() => onRoleChanged(p.email, null, p.name)).catch(() => toast.error("Failed to remove"));
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {people.map((p) => {
        const k = key(p.email);
        const isOpen = open === k;
        const matrix = matrixFor(p);
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
                {p.seeding_role ? <StatusBadge status={p.seeding_role} /> : null}
                <RoleSelect value={roleFor(p)} onChange={(r) => pickRole(p, r)} disabled={saving} />
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
                  onClick={() => saveMut.mutate(p)}
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
