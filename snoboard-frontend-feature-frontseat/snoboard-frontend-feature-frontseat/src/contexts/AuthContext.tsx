import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAccessToken, getUserRole, setUserRole } from "@/services/api";
import { hasPermission } from "@/lib/permissions";

const ALLOWED_DOMAIN = "owledmedia.com";
const ROLE_PREVIEW_PREFIX = "role_preview_";

function rolePreviewStorageKey(email: string) {
  return `${ROLE_PREVIEW_PREFIX}${email}`;
}

/** Retired roles mapped to their replacement (content_creators → cs). */
function normalizeRole(role: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of role.split(",").map((r) => r.trim()).filter(Boolean)) {
    const r = raw === "content_creators" ? "cs"
      : raw === "experiment-x" || raw === "experimentx" ? "experiment_x"
      : raw;
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out.join(",");
}

const ROLES = [
  { value: "senior_cs",         label: "Senior CS" },
  { value: "boss_man",          label: "Content growth & operations" },
  { value: "ai_dev",            label: "AI Dev" },
  { value: "cs",                label: "CS (Content Strategist)" },
  { value: "cw",                label: "Content Writer (CW)" },
  { value: "editors",           label: "Editor" },
  { value: "carousel_designer", label: "Carousel Designer" },
  { value: "design",            label: "Designer" },
  { value: "smm",               label: "Social Media Manager (SMM)" },
  { value: "experiment_x",      label: "Experiment Creator (The Bizz / XF / TECH)" },
  { value: "content_ops_intern",  label: "Content Ops Intern" },
];

function roleLabel(roleValue: string | null): string | null {
  if (!roleValue) return null;
  const primary = roleValue.split(",")[0]?.trim();
  return ROLES.find((r) => r.value === primary)?.label || primary || roleValue;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  domainError: boolean;
  /** Effective role — preview role when active, otherwise the signed-in role. */
  role: string | null;
  /** Real role from profile / localStorage. */
  actualRole: string | null;
  roleName: string | null;
  actualRoleName: string | null;
  rolePreview: string | null;
  isRolePreviewActive: boolean;
  canUseRolePreview: boolean;
  needsRole: boolean;
  setRole: (role: string) => Promise<void>;
  setRolePreview: (role: string) => void;
  clearRolePreview: () => void;
  clearRole: () => void;
  signOut: () => Promise<void>;
  ROLES: typeof ROLES;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  domainError: false,
  role: null,
  actualRole: null,
  roleName: null,
  actualRoleName: null,
  rolePreview: null,
  isRolePreviewActive: false,
  canUseRolePreview: false,
  needsRole: false,
  setRole: async () => {},
  setRolePreview: () => {},
  clearRolePreview: () => {},
  clearRole: () => {},
  signOut: async () => {},
  ROLES,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [domainError, setDomainError] = useState(false);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [rolePreview, setRolePreviewState] = useState<string | null>(null);
  const [needsRole, setNeedsRole] = useState(false);

  const clearStoredPreview = (email?: string | null) => {
    if (email) sessionStorage.removeItem(rolePreviewStorageKey(email));
    setRolePreviewState(null);
  };

  const loadStoredPreview = (email: string, realRole: string | null) => {
    if (!realRole || !hasPermission(realRole, "manage_team")) {
      clearStoredPreview(email);
      return;
    }
    const stored = sessionStorage.getItem(rolePreviewStorageKey(email));
    if (stored && ROLES.some((r) => r.value === stored)) {
      setRolePreviewState(stored);
    } else {
      clearStoredPreview(email);
    }
  };

  const signOut = async () => {
    const email = user?.email;
    await supabase.auth.signOut();
    setAccessToken(null);
    setUser(null);
    setSession(null);
    setDomainError(false);
    setActualRole(null);
    setRolePreviewState(null);
    setNeedsRole(false);
    if (email) sessionStorage.removeItem(rolePreviewStorageKey(email));
  };

  const clearRole = () => {
    if (user?.email) {
      localStorage.removeItem(`role_${user.email}`);
      clearStoredPreview(user.email);
    }
    setActualRole(null);
    setNeedsRole(true);
  };

  const handleSetRole = async (newRole: string) => {
    if (!user?.email) return;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
    localStorage.setItem(`role_${user.email}`, newRole);
    try {
      await setUserRole({ email: user.email, role: newRole, name });
    } catch (err) {
      console.error("Failed to save role to backend (using local fallback):", err);
    }
    setActualRole(newRole);
    setNeedsRole(false);
    loadStoredPreview(user.email, newRole);
  };

  const applyRole = (email: string, rawRole: string, name?: string) => {
    const role = normalizeRole(rawRole);
    localStorage.setItem(`role_${email}`, role);
    setActualRole(role);
    setNeedsRole(false);
    loadStoredPreview(email, role);
    if (role !== rawRole && name !== undefined) {
      setUserRole({ email, role, name }).catch(() => {});
    }
  };

  const fetchRole = async (email: string) => {
    const localRole = localStorage.getItem(`role_${email}`);
    if (localRole) {
      applyRole(email, localRole);
    }
    try {
      const data = await getUserRole(email);
      if (data?.role) {
        applyRole(email, data.role, data.name || "");
      } else if (!localRole) {
        clearStoredPreview(email);
        setNeedsRole(true);
      }
    } catch {
      if (!localRole) {
        clearStoredPreview(email);
        setNeedsRole(true);
      }
    }
  };

  const setRolePreview = (previewRole: string) => {
    if (!user?.email || !actualRole || !hasPermission(actualRole, "manage_team")) return;
    if (!ROLES.some((r) => r.value === previewRole)) return;
    sessionStorage.setItem(rolePreviewStorageKey(user.email), previewRole);
    setRolePreviewState(previewRole);
  };

  const clearRolePreview = () => {
    clearStoredPreview(user?.email);
  };

  const validateAndSetUser = (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setSession(null);
      setDomainError(false);
      setActualRole(null);
      setRolePreviewState(null);
      return;
    }

    const email = session.user.email || "";
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setDomainError(true);
      setUser(null);
      setSession(null);
      setAccessToken(null);
      setRolePreviewState(null);
      supabase.auth.signOut();
      return;
    }

    setAccessToken(session.access_token);
    setUser(session.user);
    setSession(session);
    setDomainError(false);
    fetchRole(email);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      validateAndSetUser(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        validateAndSetUser(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const canUseRolePreview = !!actualRole && hasPermission(actualRole, "manage_team");
  const isRolePreviewActive = canUseRolePreview && !!rolePreview;
  const effectiveRole = isRolePreviewActive ? rolePreview : actualRole;

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      domainError,
      role: effectiveRole,
      actualRole,
      roleName: roleLabel(effectiveRole),
      actualRoleName: roleLabel(actualRole),
      rolePreview: isRolePreviewActive ? rolePreview : null,
      isRolePreviewActive,
      canUseRolePreview,
      needsRole,
      setRole: handleSetRole,
      setRolePreview,
      clearRolePreview,
      clearRole,
      signOut,
      ROLES,
    }),
    [
      user,
      session,
      loading,
      domainError,
      effectiveRole,
      actualRole,
      rolePreview,
      isRolePreviewActive,
      canUseRolePreview,
      needsRole,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
