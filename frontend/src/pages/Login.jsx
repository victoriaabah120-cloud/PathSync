import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { SUPABASE_KEY, SUPABASE_URL, authRedirectUrl, supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

const CONFIRM_REDIRECT = authRedirectUrl("/");

function isNotConfirmed(error) {
  return (
    error?.code === "email_not_confirmed" ||
    error?.message?.toLowerCase().includes("email not confirmed")
  );
}

const INPUT =
  "w-full h-12 pl-11 pr-4 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low transition-colors";

export default function Login() {
  const { session, loading, authError, clearAuthError } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [error, setError] = useState(authError || "");
  const [notice, setNotice] = useState("");

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
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: CONFIRM_REDIRECT },
        });
        if (signUpError) throw signUpError;

        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setShowResend(true);
          setError("An account with this email already exists. Sign in, or send a new confirmation email.");
          return;
        }
        if (data.session) return;

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

  async function continueWithGoogle() {
    setError("");
    setNotice("");
    // Ask the project which providers exist first, so a disabled Google provider
    // explains itself instead of sending the user to an error page.
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_KEY },
      });
      const settings = await response.json();
      if (!settings?.external?.google) {
        setError(
          "Google sign-in is not enabled for this project yet. Use your email and password, or turn on the Google provider in Supabase.",
        );
        return;
      }
    } catch {
      /* if the check fails, fall through and let Supabase answer */
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: CONFIRM_REDIRECT },
    });
    if (oauthError) {
      setError(oauthError.message || "Google sign-in could not start. Try again.");
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
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <div className="w-full max-w-md mx-auto flex flex-col min-h-screen relative pt-safe pb-safe">
        <main className="flex-1 flex flex-col relative w-full px-gutter bg-surface">
          <div className="flex flex-col w-full pb-safe space-y-6 pt-2">
            {/* Brand Header */}
            <div className="flex flex-col items-center text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary-fixed text-secondary">
                <span className="material-symbols-outlined text-[28px] filled">insights</span>
              </div>
              <span className="font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight">PathSync</span>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                Learn and grow in any profession.
              </p>
            </div>

            {/* Main Card Container */}
            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col space-y-5">
              {/* Segmented Tab Controller */}
              <div className="w-full bg-surface-container-low p-1 rounded-xl flex relative">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`flex-1 py-2 text-center rounded-lg font-label-lg text-label-lg transition-all duration-200 ${
                    isSignup ? "text-on-surface-variant" : "bg-surface-container-lowest text-secondary shadow-sm"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`flex-1 py-2 text-center rounded-lg font-label-lg text-label-lg transition-all duration-200 ${
                    isSignup ? "bg-surface-container-lowest text-secondary shadow-sm" : "text-on-surface-variant"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Form Section */}
              <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
                <div className="flex items-center space-x-2 bg-secondary-fixed/50 px-3 py-2 rounded-xl">
                  <span className="material-symbols-outlined text-secondary text-sm filled">auto_awesome</span>
                  <span className="font-label-md text-label-md text-secondary">
                    Ready to unlock your customized career roadmap
                  </span>
                </div>

                {isSignup && (
                  <div className="flex flex-col space-y-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="full_name">
                      Full name
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                        person
                      </span>
                      <input
                        id="full_name"
                        name="full_name"
                        className={INPUT}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col space-y-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                      mail
                    </span>
                    <input
                      id="email"
                      name="email"
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

                <div className="flex flex-col space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="password">
                      Password
                    </label>
                    {!isSignup && (
                      <Link
                        to="/reset-password"
                        className="font-label-sm text-label-sm text-secondary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                      lock
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className="w-full h-12 pl-11 pr-11 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low transition-colors"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      aria-label="Toggle password visibility"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 text-outline hover:text-on-surface flex items-center justify-center p-0.5"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
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
                  <span>{busy ? "Please wait..." : "Continue"}</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>

                {showResend && (
                  <button
                    type="button"
                    onClick={resendConfirmation}
                    disabled={resending}
                    className="w-full h-11 bg-surface-container-low text-on-surface rounded-xl font-label-lg text-label-lg flex items-center justify-center disabled:opacity-60"
                  >
                    {resending ? "Sending..." : "Resend confirmation email"}
                  </button>
                )}
              </form>

              {/* Visual Divider */}
              <div className="relative flex items-center justify-center my-1">
                <div className="w-full h-px bg-surface-container-high" />
                <span className="absolute bg-surface-container-lowest px-3 font-label-sm text-label-sm text-on-surface-variant">
                  or continue with
                </span>
              </div>

              {/* Social Sign In */}
              <button
                type="button"
                onClick={continueWithGoogle}
                className="w-full h-12 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface rounded-xl font-label-lg text-label-lg shadow-sm active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Micro Feature Preview Tile */}
            <div className="w-full bg-surface-container-low rounded-2xl p-space-sm flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">explore</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-label-md text-label-md text-on-surface truncate">Curated Milestones</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  Join over 120,000 active learners globally
                </p>
              </div>
            </div>

            {/* Trust Terms */}
            <p className="font-body-sm text-body-sm text-on-surface-variant text-center px-4 leading-relaxed">
              By continuing, you agree to PathSync{" "}
              <a className="text-secondary hover:underline" href="https://pathsync-frontend-ddee.onrender.com" target="_blank" rel="noreferrer">
                terms of service
              </a>{" "}
              and{" "}
              <a className="text-secondary hover:underline" href="https://pathsync-frontend-ddee.onrender.com" target="_blank" rel="noreferrer">
                privacy policy
              </a>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
