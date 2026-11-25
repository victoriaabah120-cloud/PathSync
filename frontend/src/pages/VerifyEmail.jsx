import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authRedirectUrl, supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

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
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <ThemeToggle floating />
      <div className="w-full max-w-md mx-auto flex flex-col min-h-screen relative pt-safe pb-safe">
        <main className="flex-1 flex flex-col relative w-full px-gutter bg-surface">
          <div className="flex flex-col w-full pb-safe space-y-6 pt-2">
            <div className="flex flex-col items-center text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary-fixed text-secondary">
                <span className="material-symbols-outlined text-[28px] filled">mail</span>
              </div>
              <span className="font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight">PathSync</span>
            </div>

            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col space-y-4">
              <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Confirm your email</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                We sent a confirmation link to {email}. Open it to unlock your learning path. The link brings you back
                to PathSync automatically.
              </p>

              {error && (
                <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2" role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className="bg-secondary-fixed/60 text-on-secondary-fixed font-body-sm text-body-sm rounded-xl px-3 py-2" role="status">
                  {notice}
                </div>
              )}

              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="w-full h-12 bg-secondary hover:bg-secondary-container disabled:opacity-60 text-on-secondary rounded-xl font-label-lg text-label-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
              >
                <span>{busy ? "Sending..." : "Resend confirmation email"}</span>
              </button>
              <button
                type="button"
                onClick={leave}
                disabled={busy}
                className="w-full h-12 bg-surface-container-low hover:bg-surface-container text-on-surface rounded-xl font-label-lg text-label-lg flex items-center justify-center transition-colors"
              >
                Use a different account
              </button>
              <p className="text-center">
                <Link to="/login" className="font-label-md text-label-md text-secondary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
