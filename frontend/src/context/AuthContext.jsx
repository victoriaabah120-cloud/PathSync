import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, supabaseReady } from "../services/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // null = not loaded yet, object = loaded
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) {
      setProfile(data);
      return;
    }
    // The signup trigger normally creates this row. This is a safety net.
    const { data: created } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: user.user_metadata?.full_name || "" })
      .select()
      .maybeSingle();
    setProfile(created || { id: user.id });
  }, []);

  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Wait a tick before calling Supabase from inside this callback (avoids a known deadlock).
      setTimeout(() => loadProfile(newSession?.user), 0);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user), [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = { session, user: session?.user ?? null, profile, loading, refreshProfile, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
