import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authRedirectUrl, supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

const INPUT =
  "w-full h-12 pl-11 pr-4 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low transition-colors";

export default function ResetPassword() {
  const { session, recovery, clearRecovery } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const settingNewPassword = recovery && Boolean(session);

  async function requestLink(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirectUrl("/"),
      });
      if (resetError) throw resetError;
      setNotice(
        `If an account exists for ${email.trim()}, a password reset link is on its way. ` +
          `Open it in the same browser to set a new password.`,
      );
    } catch (err) {
      setError(err.message || "We could not send the reset email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearRecovery();
      setNotice("Your password has been updated.");
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message || "We could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <div className="w-full max-w-md mx-auto flex flex-col min-h-screen relative pt-safe pb-safe">
        <main className="flex-1 flex flex-col relative w-full px-gutter bg-surface">
          <div className="flex flex-col w-full pb-safe space-y-6 pt-2">
            <div className="flex flex-col items-center text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary-fixed text-secondary">
                <span className="material-symbols-outlined text-[28px] filled">lock_reset</span>
              </div>
              <span className="font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight">PathSync</span>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                {settingNewPassword ? "Choose a new password for your account." : "We will email you a link to reset your password."}
              </p>
            </div>

            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col space-y-5">
              {settingNewPassword ? (
                <form className="flex flex-col space-y-4" onSubmit={savePassword}>
                  <div className="flex flex-col space-y-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="new-password">
                      New password
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">lock</span>
                      <input
                        id="new-password"
                        type="password"
                        className={INPUT}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        minLength={6}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
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
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 mt-2 bg-secondary hover:bg-secondary-container disabled:opacity-60 text-on-secondary rounded-xl font-label-lg text-label-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                  >
                    <span>{busy ? "Saving..." : "Save new password"}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </form>
              ) : (
                <form className="flex flex-col space-y-4" onSubmit={requestLink}>
                  <div className="flex flex-col space-y-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="reset-email">
                      Email address
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">mail</span>
                      <input
                        id="reset-email"
                        type="email"
                        className={INPUT}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
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
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 mt-2 bg-secondary hover:bg-secondary-container disabled:opacity-60 text-on-secondary rounded-xl font-label-lg text-label-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                  >
                    <span>{busy ? "Sending..." : "Send reset link"}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </form>
              )}

              <div className="relative flex items-center justify-center my-1">
                <div className="w-full h-px bg-surface-container-high" />
                <span className="absolute bg-surface-container-lowest px-3 font-label-sm text-label-sm text-on-surface-variant">
                  or
                </span>
              </div>

              <Link
                to="/login"
                className="w-full h-12 bg-surface-container-low hover:bg-surface-container text-on-surface rounded-xl font-label-lg text-label-lg flex items-center justify-center transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
