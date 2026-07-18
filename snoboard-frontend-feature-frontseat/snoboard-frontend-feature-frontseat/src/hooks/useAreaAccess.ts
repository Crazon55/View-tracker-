// Loads the signed-in user's per-person access matrix (Users & Roles → Save)
// and exposes the same helpers nav/route gating use — so saved edits actually apply.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAccess } from "@/services/api";
import {
  canEditArea,
  canSeeAnyNonSeeding,
  canView,
  getAreaLevel,
  type AreaKey,
  type AreaLevel,
  type PersonAccess,
} from "@/lib/accessModel";

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
    const saved = allAccess[email];
    if (!saved || !Object.keys(saved).length) return null;
    return saved;
  }, [allAccess, email, isRolePreviewActive]);

  return useMemo(
    () => ({
      personAccess,
      canViewArea: (area: AreaKey) => canView(role, area, undefined, personAccess),
      canEditArea: (area: AreaKey) => canEditArea(role, area, undefined, personAccess),
      getLevel: (area: AreaKey): AreaLevel =>
        getAreaLevel(role, area, undefined, personAccess),
      canSeeContent: () => canSeeAnyNonSeeding(role, undefined, personAccess),
    }),
    [role, personAccess],
  );
}
