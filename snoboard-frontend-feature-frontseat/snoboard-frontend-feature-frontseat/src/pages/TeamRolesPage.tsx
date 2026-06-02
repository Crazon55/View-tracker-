import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllUserRoles, setUserRole } from "@/services/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw } from "lucide-react";

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
  ops_manager:       "Ops Manager",
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
  ops_manager:       "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  content_creators:  "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

export default function TeamRolesPage() {
  const { can } = usePermissions();
  const { ROLES } = useAuth();
  const queryClient = useQueryClient();
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: getAllUserRoles,
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ email, role, name }: { email: string; role: string; name: string }) =>
      setUserRole({ email, role, name }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[vars.email];
        return next;
      });
      toast.success(`Role updated for ${vars.name}`);
    },
    onError: (_err, vars) => toast.error(`Failed to update role for ${vars.name}`),
  });

  if (!can('filter_by_person')) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">You don't have permission to manage team roles.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">

        <div className="mb-8">
          <h1 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
            <ShieldCheck className="w-6 h-6 text-violet-400" />
            Team Roles
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Change a team member's role. The new role takes effect the next time they load the app.
          </p>
        </div>

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
          <p className="text-zinc-500 text-sm">No team members found.</p>
        )}

        {users.length > 0 && (
          <div className="space-y-2">
            {users.map((u) => {
              const selected = pendingChanges[u.email] ?? u.role;
              const isDirty = selected !== u.role;

              return (
                <div
                  key={u.email}
                  className="flex items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.name || u.email.split("@")[0]}</p>
                    <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Current role badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${ROLE_COLOR[u.role] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>

                    {/* Role selector */}
                    <select
                      value={selected}
                      onChange={(e) =>
                        setPendingChanges((prev) => ({ ...prev, [u.email]: e.target.value }))
                      }
                      className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:border-violet-500 focus:outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>

                    {/* Save button — only visible when role changed */}
                    <button
                      disabled={!isDirty || updateRoleMut.isPending}
                      onClick={() =>
                        updateRoleMut.mutate({ email: u.email, role: selected, name: u.name })
                      }
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        isDirty
                          ? "bg-violet-600 hover:bg-violet-700 text-white"
                          : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      {updateRoleMut.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
