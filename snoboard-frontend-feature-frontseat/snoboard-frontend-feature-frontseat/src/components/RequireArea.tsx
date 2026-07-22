import { Navigate } from "react-router-dom";
import { useAreaAccess } from "@/hooks/useAreaAccess";
import type { AreaKey } from "@/lib/accessModel";

/** Redirects away when the signed-in (or preview) role cannot view `area`. */
export function RequireArea({
  area,
  fallback = "/seeding",
  children,
}: {
  area: AreaKey;
  fallback?: string;
  children: React.ReactNode;
}) {
  const { canViewArea } = useAreaAccess();
  if (!canViewArea(area)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
