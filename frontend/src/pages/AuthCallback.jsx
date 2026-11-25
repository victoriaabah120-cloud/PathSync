import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Loader from "../components/Loader.jsx";
import Icon from "../components/Icon.jsx";
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
      <main className="auth-shell">
        <div className="auth-head">
          <div className="brand-mark" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>
            <Icon name="refresh" size={26} />
          </div>
          <div className="wordmark">PathSync<span>.</span></div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h1 style={{ fontSize: "1.3rem", marginBottom: 6 }}>This link did not work</h1>
          <p className="lead" style={{ margin: 0 }}>{message}</p>
          <Link className="btn btn-primary btn-block" to="/login" style={{ marginTop: 18 }}>
            Go to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
