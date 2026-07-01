import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getFallbackRouteForRole, isRouteAllowed } from "@/lib/permissions";

export function RolePreviewRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isRolePreviewActive } = useAuth();

  useEffect(() => {
    if (!isRolePreviewActive || !role) return;

    const path = location.pathname;
    if (path === "/wrap") return;
    if (isRouteAllowed(role, path)) return;

    const fallback = getFallbackRouteForRole(role);
    if (fallback !== path) {
      navigate(fallback, { replace: true });
    }
  }, [isRolePreviewActive, role, location.pathname, navigate]);

  return null;
}
