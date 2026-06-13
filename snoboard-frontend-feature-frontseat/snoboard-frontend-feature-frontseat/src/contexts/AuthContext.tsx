import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAccessToken, getUserRole, setUserRole } from "@/services/api";

const ALLOWED_DOMAIN = "owledmedia.com";

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

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  domainError: boolean;
  role: string | null;
  roleName: string | null;
  needsRole: boolean;
  setRole: (role: string) => Promise<void>;
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
  roleName: null,
  needsRole: false,
  setRole: async () => {},
  clearRole: () => {},
  signOut: async () => {},
  ROLES,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [domainError, setDomainError] = useState(false);
  const [role, setRoleState] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [needsRole, setNeedsRole] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setAccessToken(null);
    setUser(null);
    setSession(null);
    setDomainError(false);
    setRoleState(null);
    setNeedsRole(false);
  };

  const clearRole = () => {
    if (user?.email) localStorage.removeItem(`role_${user.email}`);
    setRoleState(null);
    setRoleName(null);
    setNeedsRole(true);
  };

  const handleSetRole = async (newRole: string) => {
    if (!user?.email) return;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
    // Save to localStorage immediately so it persists across refreshes
    localStorage.setItem(`role_${user.email}`, newRole);
    try {
      await setUserRole({ email: user.email, role: newRole, name });
    } catch (err) {
      console.error("Failed to save role to backend (using local fallback):", err);
    }
    setRoleState(newRole);
    setRoleName(ROLES.find((r) => r.value === newRole)?.label || newRole);
    setNeedsRole(false);
  };

  const applyRole = (email: string, rawRole: string, name?: string) => {
    const role = normalizeRole(rawRole);
    localStorage.setItem(`role_${email}`, role);
    setRoleState(role);
    const primary = role.split(",")[0]?.trim();
    setRoleName(ROLES.find((r) => r.value === primary)?.label || primary || role);
    setNeedsRole(false);
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
        setNeedsRole(true);
      }
    } catch {
      if (!localRole) setNeedsRole(true);
    }
  };

  const validateAndSetUser = (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setSession(null);
      setDomainError(false);
      return;
    }

    const email = session.user.email || "";
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setDomainError(true);
      setUser(null);
      setSession(null);
      setAccessToken(null);
      supabase.auth.signOut();
      return;
    }

    setAccessToken(session.access_token);
    setUser(session.user);
    setSession(session);
    setDomainError(false);

    // Fetch role after auth
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

  return (
    <AuthContext.Provider value={{ user, session, loading, domainError, role, roleName, needsRole, setRole: handleSetRole, clearRole, signOut, ROLES }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
