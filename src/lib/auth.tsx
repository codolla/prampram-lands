import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "staff" | "finance" | "manager" | "frontdesk" | "developer";

export interface AppProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  roles: AppRole[];
  isAuthenticated: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r) => r.role as AppRole);
}

async function fetchProfile(userId: string): Promise<AppProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let lastUserId: string | null = null;
    let cancelled = false;

    const handleSession = (sess: Session | null) => {
      if (cancelled) return;
      setSession(sess);
      const uid = sess?.user?.id ?? null;
      // Only refetch roles when the user identity actually changes,
      // not on every TOKEN_REFRESHED / USER_UPDATED event.
      if (uid !== lastUserId) {
        lastUserId = uid;
        if (uid) {
          // Defer to avoid Supabase auth deadlock.
          setTimeout(() => {
            fetchRoles(uid).then(setRoles);
            fetchProfile(uid).then(setProfile);
          }, 0);
        } else {
          setRoles([]);
          setProfile(null);
        }
      }
      // Flip loading off as soon as the session is known.
      // Don't block the UI on the roles round-trip.
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      handleSession(sess);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    const isDeveloper = roles.includes("developer");
    return {
      loading,
      session,
      user,
      profile,
      roles,
      isAuthenticated: !!user,
      hasRole: (r) => isDeveloper || roles.includes(r),
      hasAnyRole: (rs) => isDeveloper || rs.some((r) => roles.includes(r)),
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshRoles: async () => {
        if (session?.user) setRoles(await fetchRoles(session.user.id));
      },
      refreshProfile: async () => {
        if (session?.user) {
          setProfile(await fetchProfile(session.user.id));
        }
      },
    };
  }, [loading, session, profile, roles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function roleLabel(role: AppRole): string {
  if (role === "admin") return "Administrator";
  if (role === "developer") return "Developer";
  if (role === "manager") return "Manager";
  if (role === "frontdesk") return "Front Desk";
  if (role === "finance") return "Finance Officer";
  return "Staff";
}
