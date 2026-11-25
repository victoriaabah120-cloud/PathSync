import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, supabaseReady } from "../services/supabase.js";
import { cleanAuthHash, completeAuthRedirect } from "../services/authCallback.js";

const AuthContext = createContext(null);

// One shared promise: React StrictMode mounts effects twice, and the redirect must
// be handled exactly once while both runs still receive its result.
let redirectPromise = null;
function ensureRedirectHandled() {
  if (!redirectPromise) redirectPromise = completeAuthRedirect();
  return redirectPromise;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // null = not loaded yet, object = loaded
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when a confirmation link could not be verified, so a page can explain why.
  const [authError, setAuthError] = useState("");
  // True while the user arrived from a password recovery link.
  const [recovery, setRecovery] = useState(() => {
    if (typeof window === "undefined") return false;
    return /(^|[#&?])type=recovery/.test(window.location.hash + window.location.search);
  });

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

    let active = true;

    (async () => {
      // Runs once per page load, before the session is read, so a ?code= or
      // ?token_hash= link is exchanged before the app routes anywhere.
      const result = await ensureRedirectHandled();
      if (active && result.error) setAuthError(result.error);

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      cleanAuthHash();
      await loadProfile(data.session?.user);
      if (active) setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(newSession);
      // Wait a tick before calling Supabase from inside this callback (avoids a known deadlock).
      setTimeout(() => {
        if (active) loadProfile(newSession?.user);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user), [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(""), []);
  const clearRecovery = useCallback(() => setRecovery(false), []);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    authError,
    recovery,
    clearRecovery,
    clearAuthError,
    refreshProfile,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
