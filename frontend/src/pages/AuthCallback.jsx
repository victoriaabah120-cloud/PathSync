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

  // Give the session a moment to appear before declaring the link unusable.
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
    <div className="app">
      <main className="screen">
        <div className="wordmark">PathSync<span>.</span></div>
        <h1>This link did not work</h1>
        <p className="muted">{message}</p>
        <div className="stack" style={{ marginTop: 20 }}>
          <Link className="btn btn-primary btn-block" to="/login">
            Go to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
