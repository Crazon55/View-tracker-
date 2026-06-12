import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllUserRoles, setUserRole, deleteUserRole, cleanupTeamRoles } from "@/services/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, ChevronDown, UserPlus, Trash2 } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  senior_cs:         "Senior CS",
  boss_man:          "Boss Man",
  ai_dev:            "AI Dev",
  cs:                "CS (Content Strategist)",
  cw:                "Content Writer (CW)",
  editors:           "Editor",
  carousel_designer: "Carousel Designer",
  design:            "Designer",
  smm:               "Social Media Manager",
  content_creators:  "Content Creator",
};

const ROLE_COLOR: Record<string, string> = {
  senior_cs:         "bg-violet-500/20 text-violet-300 border-violet-500/30",
  boss_man:          "bg-violet-500/20 text-violet-300 border-violet-500/30",
  ai_dev:            "bg-violet-500/20 text-violet-300 border-violet-500/30",
  cs:                "bg-blue-500/20 text-blue-300 border-blue-500/30",
  cw:                "bg-sky-500/20 text-sky-300 border-sky-500/30",
  editors:           "bg-amber-500/20 text-amber-300 border-amber-500/30",
  carousel_designer: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  design:            "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  smm:               "bg-pink-500/20 text-pink-300 border-pink-500/30",
  content_creators:  "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const ALLOWED_DOMAIN = "owledmedia.com";
const DEPRECATED_ROLES = new Set(["ops_manager"]);

function activeRoles(roleStr: string): string[] {
  return (roleStr || "").split(",").map((r) => r.trim()).filter((r) => r && !DEPRECATED_ROLES.has(r));
}

export default function TeamRolesPage() {
  const { can, role } = usePermissions();
  const { ROLES, user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingChanges, setPendingChanges] = useState<Record<string, string[]>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([]);

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: getAllUserRoles,
    enabled: can("manage_team"),
  });

  useEffect(() => {
    if (!can("manage_team")) return;
    cleanupTeamRoles()
      .then(() => refetch())
      .catch(() => { /* backend may not be deployed yet */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const updateRoleMut = useMutation({
    mutationFn: ({ email, role, name }: { email: string; role: string; name: string }) =>
      setUserRole({ email, role, name }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setPendingChanges((prev) => { const next = { ...prev }; delete next[vars.email]; return next; });
      setOpenPicker(null);
      toast.success(`Role updated for ${vars.name}`);
    },
    onError: (_err, vars) => toast.error(`Failed to update role for ${vars.name}`),
  });

  const addMemberMut = useMutation({
    mutationFn: ({ email, role, name }: { email: string; role: string; name: string }) =>
      setUserRole({ email, role, name }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setShowAddForm(false);
      setNewEmail("");
      setNewName("");
      setNewRoles([]);
      toast.success(`${vars.name} added to the team`);
    },
    onError: () => toast.error("Failed to add team member"),
  });

  const removeMemberMut = useMutation({
    mutationFn: (email: string) => deleteUserRole(email),
    onSuccess: (_data, email) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      const removed = users.find((u) => u.email === email);
      toast.success(`${removed?.name || email} removed from the team`);
    },
    onError: () => toast.error("Failed to remove team member"),
  });

  if (!can("manage_team")) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">You don't have permission to manage the team.</p>
      </div>
    );
  }

  const normalizeEmail = (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.includes("@")) return trimmed;
    return `${trimmed}@${ALLOWED_DOMAIN}`;
  };

  const handleAddMember = () => {
    const email = normalizeEmail(newEmail);
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      toast.error(`Email must be an @${ALLOWED_DOMAIN} address`);
      return;
    }
    if (!newRoles.length) {
      toast.error("Select at least one role");
      return;
    }
    const name = newName.trim() || email.split("@")[0];
    addMemberMut.mutate({ email, role: newRoles.join(","), name });
  };

  const handleRemove = (email: string, name: string) => {
    if (!window.confirm(`Remove ${name || email} from the team? They will need to re-select a role on next login.`)) return;
    removeMemberMut.mutate(email);
  };

  const toggleNewRole = (rv: string) => {
    setNewRoles((prev) =>
      prev.includes(rv) ? prev.filter((r) => r !== rv) : [...prev, rv]
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
              <ShieldCheck className="w-6 h-6 text-violet-400" />
              Team Management
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Add or remove team members and change their roles. Changes take effect the next time they load the app.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-2 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-2 font-semibold transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Add member
          </button>
        </div>

        {showAddForm && (
          <div className="mb-6 bg-zinc-900 border border-violet-500/30 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white">Add team member</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={`name@${ALLOWED_DOMAIN}`}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Display name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Optional — defaults to email prefix"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">Roles</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLES.map((r) => {
                  const checked = newRoles.includes(r.value);
                  return (
                    <label key={r.value} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${checked ? "bg-violet-500/10 text-white border border-violet-500/30" : "text-zinc-400 hover:bg-zinc-800 border border-transparent"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleNewRole(r.value)} className="rounded border-zinc-700 bg-zinc-800 text-violet-500 w-3 h-3" />
                      {r.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowAddForm(false); setNewEmail(""); setNewName(""); setNewRoles([]); }}
                className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={addMemberMut.isPending}
                onClick={handleAddMember}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
              >
                {addMemberMut.isPending ? "Adding..." : "Add to team"}
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading team...
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Could not load team roles — the backend endpoint{" "}
            <span className="font-mono">GET /api/v1/user-roles</span> may not be deployed yet.
          </div>
        )}

        {!isLoading && !error && users.length === 0 && (
          <p className="text-zinc-500 text-sm">No team members found. Use "Add member" to get started.</p>
        )}

        {users.length > 0 && (
          <div className="space-y-2">
            {users.map((u) => {
              const currentRoles = activeRoles(u.role || "");
              const selectedRoles = pendingChanges[u.email] ?? currentRoles;
              const isDirty = selectedRoles.join(",") !== currentRoles.join(",");
              const isOpen = openPicker === u.email;
              const isSelf = user?.email?.toLowerCase() === u.email.toLowerCase();

              const toggleRole = (rv: string) => {
                const next = selectedRoles.includes(rv)
                  ? selectedRoles.filter((r) => r !== rv)
                  : [...selectedRoles, rv];
                setPendingChanges((prev) => ({ ...prev, [u.email]: next }));
              };

              return (
                <div key={u.email} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {u.name || u.email.split("@")[0]}
                        {isSelf && <span className="ml-2 text-[10px] text-zinc-500 font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex gap-1 flex-wrap justify-end">
                        {currentRoles.map((r: string) => (
                          <span key={r} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${ROLE_COLOR[r] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={() => setOpenPicker(isOpen ? null : u.email)}
                        className="flex items-center gap-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2.5 py-1.5 hover:border-violet-500 transition-colors"
                      >
                        Edit roles <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>

                      <button
                        disabled={!isDirty || updateRoleMut.isPending}
                        onClick={() => updateRoleMut.mutate({ email: u.email, role: selectedRoles.join(","), name: u.name })}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${isDirty ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}
                      >
                        {updateRoleMut.isPending ? "Saving..." : "Save"}
                      </button>

                      <button
                        disabled={removeMemberMut.isPending}
                        onClick={() => handleRemove(u.email, u.name)}
                        title="Remove from team"
                        className="text-xs p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-1.5">
                      {ROLES.map((r) => {
                        const checked = selectedRoles.includes(r.value);
                        return (
                          <label key={r.value} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${checked ? "bg-violet-500/10 text-white border border-violet-500/30" : "text-zinc-400 hover:bg-zinc-800 border border-transparent"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRole(r.value)} className="rounded border-zinc-700 bg-zinc-800 text-violet-500 w-3 h-3" />
                            {r.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
