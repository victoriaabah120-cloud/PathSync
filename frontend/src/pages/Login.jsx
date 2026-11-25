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
  const [showPassword, setShowPassword] = useState(false);
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

  function switchMode(next) {
    setMode(next);
    setError("");
    setNotice("");
    setShowResend(false);
  }

  return (
    <div className="app">
      <main className="auth-shell">
        <div className="auth-head">
          <div className="brand-mark">
            <span className="mi lg fill" aria-hidden="true">insights</span>
          </div>
          <div className="wordmark">PathSync<span>.</span></div>
          <p>Learn and grow in any profession.</p>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="segmented" role="tablist" aria-label="Sign in or create an account">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={isSignup ? "seg-btn" : "seg-btn active"}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={isSignup ? "seg-btn active" : "seg-btn"}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="stack">
            {isSignup && (
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Your name</span>
                <div className="input-wrap">
                  <span className="mi sm" aria-hidden="true">person</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Ada Obi"
                  />
                </div>
              </label>
            )}

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Email address</span>
              <div className="input-wrap">
                <span className="mi sm" aria-hidden="true">mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </div>
            </label>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Password</span>
              <div className="input-wrap">
                <span className="mi sm" aria-hidden="true">lock</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder={isSignup ? "At least 6 characters" : "Your password"}
                  style={{ paddingRight: 46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 8,
                    width: 36,
                    height: 36,
                    border: 0,
                    background: "transparent",
                    color: "var(--outline)",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <span className="mi sm" aria-hidden="true">visibility</span>
                </button>
              </div>
            </label>

            {error && <div className="error" role="alert">{error}</div>}
            {notice && <div className="notice" role="status">{notice}</div>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
              {!busy && <span className="mi sm" aria-hidden="true">arrow_forward</span>}
            </button>

            {showResend && (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={resendConfirmation}
                disabled={resending || !email.trim()}
              >
                {resending ? "Sending..." : "Resend confirmation email"}
              </button>
            )}
          </form>
        </div>

        <div className="card-tint" style={{ borderRadius: 16, padding: 12, display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div className="tile-icon" style={{ margin: 0, width: 32, height: 32, flex: "none" }}>
            <span className="mi sm" aria-hidden="true">explore</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.8rem" }}>A path built around you</p>
            <p className="muted small" style={{ margin: 0 }}>Pick a career, learn in short lessons, earn certificates.</p>
          </div>
        </div>

        <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}>
          Confirmation links open {siteUrl()}.
        </p>
      </main>
    </div>
  );
}
