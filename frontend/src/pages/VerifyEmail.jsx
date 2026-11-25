import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authRedirectUrl, supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";
import Icon from "../components/Icon.jsx";

// Shown when a session exists but the account's email is still unconfirmed.
export default function VerifyEmail() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const email = user?.email || "your email address";

  async function resend() {
    if (!user?.email) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: { emailRedirectTo: authRedirectUrl("/") },
      });
      if (resendError) throw resendError;
      setNotice(`A new confirmation link is on its way to ${user.email}.`);
    } catch (err) {
      setError(err?.message || "We could not send the email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <main className="auth-shell">
        <div className="auth-head">
          <div className="brand-mark">
            <Icon name="mail" size={26} filled />
          </div>
          <div className="wordmark">PathSync<span>.</span></div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h1 style={{ fontSize: "1.3rem", marginBottom: 6 }}>Confirm your email</h1>
          <p className="lead" style={{ margin: 0 }}>
            We sent a confirmation link to {email}. Open it to unlock your learning path. The link
            brings you back to PathSync automatically.
          </p>

          {error && <div className="error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
          {notice && <div className="notice" role="status" style={{ marginTop: 14 }}>{notice}</div>}

          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn btn-primary btn-block" onClick={resend} disabled={busy}>
              {busy ? "Sending..." : "Resend confirmation email"}
            </button>
            <button className="btn btn-ghost btn-block" onClick={leave} disabled={busy}>
              Use a different account
            </button>
          </div>

          <p style={{ textAlign: "center", margin: "14px 0 0" }}>
            <Link to="/login" className="small" style={{ fontWeight: 600 }}>Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
