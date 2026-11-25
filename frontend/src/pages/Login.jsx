import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" or "signup"
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!loading && session) return <Navigate to="/home" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  function switchMode(event) {
    event.preventDefault();
    setMode(isSignup ? "signin" : "signup");
    setError("");
    setNotice("");
  }

  return (
    <div className="app">
      <main className="screen">
        <div className="wordmark">PathSync<span>.</span></div>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">Sync your skills. Shape your future.</p>

        <form onSubmit={handleSubmit} className="stack">
          {isSignup && (
            <label className="field">
              <span>Your name</span>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </label>

          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="notice">{notice}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 18, textAlign: "center" }}>
          {isSignup ? "Already have an account? " : "New to PathSync? "}
          <a href="#" onClick={switchMode}>{isSignup ? "Sign in" : "Create an account"}</a>
        </p>
      </main>
    </div>
  );
}