import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function initials(name, email) {
  const source = (name || email || "").trim();
  if (!source) return "PS";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return source.slice(0, 2);
}

// Fixed top bar. `back` renders a back arrow instead of the wordmark.
export default function AppBar({ title = "", back = "", right = null }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const label = initials(profile?.full_name, user?.email);

  return (
    <header className="appbar">
      <div className="appbar-inner">
        {back ? (
          <div className="appbar-side" style={{ minWidth: 0 }}>
            <button
              type="button"
              className="appbar-back"
              onClick={() => navigate(back)}
              aria-label="Go back"
            >
              <span className="mi" aria-hidden="true">arrow_back</span>
            </button>
            <span className="appbar-title">{title}</span>
          </div>
        ) : (
          <Link to="/home" className="wordmark" style={{ color: "var(--ink-strong)" }}>
            PathSync<span>.</span>
          </Link>
        )}

        <div className="appbar-side">
          {right}
          {!back && (
            <Link to="/profile" className="avatar" aria-label="Your profile">
              {label}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
