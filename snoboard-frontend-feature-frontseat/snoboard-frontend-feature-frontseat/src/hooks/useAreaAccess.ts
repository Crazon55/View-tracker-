// Loads the signed-in user's per-person access matrix (Users & Roles → Save)
// and exposes the same helpers nav/route gating use — so saved edits actually apply.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAccess } from "@/services/api";
import {
  AREA_KEYS,
  canEditArea,
  canSeeAnyNonSeeding,
  canSeeAnySeeding,
  canView,
  getAreaLevel,
  resolvePersonAccess,
  type AreaKey,
  type AreaLevel,
  type PersonAccess,
} from "@/lib/accessModel";

/** Ignore all-none matrices that wiped multi-role defaults (legacy save bug). */
function usablePersonAccess(
  role: string | null | undefined,
  saved: PersonAccess | null | undefined,
): PersonAccess | null {
  if (!saved || !Object.keys(saved).length) return null;
  const defaults = resolvePersonAccess(role || "pending", null);
  const savedAllNone = AREA_KEYS.every((k) => (saved[k] ?? "none") === "none");
  const roleHasAccess = AREA_KEYS.some((k) => defaults[k] !== "none");
  if (savedAllNone && roleHasAccess) return null;
  return saved;
}

export function useAreaAccess() {
  const { user, role, isRolePreviewActive } = useAuth();
  const email = (user?.email || "").trim().toLowerCase();

  const { data: allAccess = {} } = useQuery({
    queryKey: ["user-access"],
    queryFn: async () =>
      ((await getUserAccess()) ?? {}) as Record<string, PersonAccess>,
    enabled: !!email,
    staleTime: 30_000,
  });

  // Role preview should show the *role defaults*, not the admin's personal matrix.
  const personAccess = useMemo<PersonAccess | null>(() => {
    if (isRolePreviewActive || !email) return null;
    return usablePersonAccess(role, allAccess[email]);
  }, [allAccess, email, isRolePreviewActive, role]);

  return useMemo(
    () => ({
      personAccess,
      canViewArea: (area: AreaKey) => canView(role, area, undefined, personAccess),
      canEditArea: (area: AreaKey) => canEditArea(role, area, undefined, personAccess),
      getLevel: (area: AreaKey): AreaLevel =>
        getAreaLevel(role, area, undefined, personAccess),
      canSeeContent: () => canSeeAnyNonSeeding(role, undefined, personAccess),
      canSeeSeeding: () => canSeeAnySeeding(role, undefined, personAccess),
    }),
    [role, personAccess],
  );
}
