import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Loader from "../components/Loader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// Landing page for a confirmation link that points at /auth/callback.
// The exchange itself happens in AuthContext, before the session is read.
export default function AuthCallback() {
  const { session, profile, loading, authError } = useAuth();
  const navigate = useNavigate();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || !session || profile === null) return;
    navigate(profile?.career_field ? "/home" : "/intent", { replace: true });
  }, [loading, session, profile, navigate]);

  if (loading || !waited || session) return <Loader text="Confirming your email..." />;

  const message =
    authError ||
    "We could not confirm your email from this link. It may have expired or already been used. Send yourself a new one and open it soon after it arrives.";

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <div className="w-full max-w-md mx-auto flex flex-col min-h-screen relative pt-safe pb-safe">
        <main className="flex-1 flex flex-col relative w-full px-gutter bg-surface">
          <div className="flex flex-col w-full pb-safe space-y-6 pt-2">
            <div className="flex flex-col items-center text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-error-container text-error">
                <span className="material-symbols-outlined text-[28px]">link_off</span>
              </div>
              <span className="font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight">PathSync</span>
            </div>

            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col space-y-4">
              <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">This link did not work</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">{message}</p>
              <Link
                to="/login"
                className="w-full h-12 bg-secondary hover:bg-secondary-container text-on-secondary rounded-xl font-label-lg text-label-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
              >
                <span>Go to sign in</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
