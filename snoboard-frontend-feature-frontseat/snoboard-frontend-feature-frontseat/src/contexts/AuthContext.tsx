import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const ALLOWED_DOMAIN = "owledmedia.com";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  domainError: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  domainError: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [domainError, setDomainError] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setDomainError(false);
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
      supabase.auth.signOut();
      return;
    }

    setUser(session.user);
    setSession(session);
    setDomainError(false);
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
    <AuthContext.Provider value={{ user, session, loading, domainError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
