import { Navigate } from "react-router-dom";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import { AREAS, type AreaKey } from "@/lib/accessModel";

/** Redirects away when the signed-in (or preview) role cannot view `area`. */
export function RequireArea({
  area,
  fallback,
  children,
}: {
  area: AreaKey;
  fallback?: string;
  children: React.ReactNode;
}) {
  const { canViewArea } = useAreaAccess();
  if (canViewArea(area)) return <>{children}</>;

  // Prefer an explicitly allowed sibling route; never bounce to a gated page the user also can't see.
  if (fallback) return <Navigate to={fallback} replace />;
  const alt = AREAS.find((a) => a.key !== area && !a.route.startsWith("http") && canViewArea(a.key));
  return <Navigate to={alt?.route || "/"} replace />;
}
