import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authRedirectUrl, supabase, siteUrl } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

// Where Supabase should send the user after they click the link in their email.
// Locally this is http://localhost:5173, in production it is the Render site.
const CONFIRM_REDIRECT = authRedirectUrl("/");

function isNotConfirmed(error) {
  return (
    error?.code === "email_not_confirmed" ||
    error?.message?.toLowerCase().includes("email not confirmed")
  );
}

export default function Login() {
  const { session, loading, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [error, setError] = useState(authError || "");
  const [notice, setNotice] = useState("");

  // A confirmation link can fail before this page mounts, so keep the banner in sync.
  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  if (!loading && session) return <Navigate to="/home" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setShowResend(false);
    clearAuthError();
    setBusy(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: CONFIRM_REDIRECT,
          },
        });

        if (signUpError) throw signUpError;

        // Supabase returns an empty identities list when the email is already registered.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setShowResend(true);
          setNotice("");
          setError("An account with this email already exists. Sign in, or send a new confirmation email.");
          return;
        }

        if (data.session) {
          // Email confirmation is switched off in Supabase: the user is already in.
          return;
        }

        setShowResend(true);
        setNotice(
          `Account created. We sent a confirmation link to ${email.trim()}. ` +
            `Open it to activate your account; it brings you back to PathSync. ` +
            `If it is not there in a minute, check your spam folder.`,
        );
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          if (isNotConfirmed(signInError)) {
            setShowResend(true);
            setError(
              `Your email is not confirmed yet. Open the confirmation link we sent to ${email.trim()}, ` +
                `or send yourself a new one below.`,
            );
            return;
          }
          throw signInError;
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    const target = email.trim();
    if (!target) {
      setError("Type your email address first, then resend the confirmation email.");
      return;
    }

    setError("");
    setNotice("");
    setResending(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: CONFIRM_REDIRECT },
      });

      if (resendError) throw resendError;

      setNotice(
        `A new confirmation email is on its way to ${target}. Open the newest link; ` +
          `older links stop working once a new one is sent.`,
      );
      setShowResend(false);
    } catch (err) {
      const message = err?.message || "";
      if (err?.status === 429 || message.toLowerCase().includes("rate limit")) {
        setError("Please wait a minute before asking for another email.");
      } else if (message.toLowerCase().includes("already confirmed")) {
        setError("This email is already confirmed. Try signing in instead.");
      } else {
        setError(message || "We could not send the email. Check the address and try again.");
      }
    } finally {
      setResending(false);
    }
  }

  const isSignup = mode === "signup";

  function switchMode(event) {
    event.preventDefault();
    setMode(isSignup ? "signin" : "signup");
    setError("");
    setNotice("");
    setShowResend(false);
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
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
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
          {notice && <div className="notice" role="status">{notice}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>

          {showResend && (
            <button
              type="button"
              className="btn btn-block"
              onClick={resendConfirmation}
              disabled={resending || !email.trim()}
            >
              {resending ? "Sending..." : "Resend confirmation email"}
            </button>
          )}
        </form>

        <p className="muted" style={{ marginTop: 18, textAlign: "center" }}>
          {isSignup ? "Already have an account? " : "New to PathSync? "}
          <a href="#" onClick={switchMode}>
            {isSignup ? "Sign in" : "Create an account"}
          </a>
        </p>

        {!isSignup && (
          <p className="muted" style={{ marginTop: 10, textAlign: "center", fontSize: 13 }}>
            Confirmation links open {siteUrl()}.
          </p>
        )}
      </main>
    </div>
  );
}
