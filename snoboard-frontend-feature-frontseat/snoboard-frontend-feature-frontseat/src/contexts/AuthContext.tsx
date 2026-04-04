import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAccessToken, getUserRole, setUserRole } from "@/services/api";

const ALLOWED_DOMAIN = "owledmedia.com";

const ROLES = [
  { value: "cs", label: "CS (Content Strategist)" },
  { value: "cdi", label: "CDI (Content Director)" },
  { value: "design", label: "Design" },
  { value: "ai_automations", label: "AI / Automations" },
  { value: "ops_manager", label: "Ops Manager (Faceless)" },
  { value: "cw", label: "Content Writers (CW)" },
  { value: "editors", label: "Editors" },
  { value: "content_creators", label: "Content Creators" },
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

  const handleSetRole = async (newRole: string) => {
    if (!user?.email) return;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";
    await setUserRole({ email: user.email, role: newRole, name });
    setRoleState(newRole);
    setRoleName(ROLES.find((r) => r.value === newRole)?.label || newRole);
    setNeedsRole(false);
  };

  const fetchRole = async (email: string) => {
    try {
      const data = await getUserRole(email);
      if (data?.role) {
        setRoleState(data.role);
        setRoleName(ROLES.find((r) => r.value === data.role)?.label || data.role);
        setNeedsRole(false);
      } else {
        setNeedsRole(true);
      }
    } catch {
      setNeedsRole(true);
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
    <AuthContext.Provider value={{ user, session, loading, domainError, role, roleName, needsRole, setRole: handleSetRole, signOut, ROLES }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
