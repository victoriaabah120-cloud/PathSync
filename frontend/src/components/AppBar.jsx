import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

function initials(name, email) {
  const source = (name || email || "").trim();
  if (!source) return "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return source.slice(0, 2);
}

/**
 * Top app bar, reproduced from the Stitch reference.
 * variant "brand" (default): PathSync wordmark + dot + avatar
 * variant "back": back arrow + page title
 */
export default function AppBar({ variant = "brand", title = "", back = "", right = null, wide = false }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const label = initials(profile?.full_name, user?.email);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 pt-safe bg-surface-container-lowest/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className={`${wide ? "max-w-5xl" : "max-w-md"} mx-auto h-16 px-gutter flex items-center justify-between`}>
        {variant === "back" ? (
          <div className="flex items-center gap-space-sm min-w-0">
            <button
              type="button"
              onClick={() => navigate(back || -1)}
              aria-label="Go back"
              className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">{title}</span>
          </div>
        ) : (
          <Link to="/home" className="flex items-center gap-space-xs">
            <span className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">PathSync</span>
            <span className="w-2 h-2 rounded-full bg-secondary" />
          </Link>
        )}

        <div className="flex items-center gap-space-sm">
          {right}
          <ThemeToggle />
          {variant === "back" && (
            <Link
              to="/home"
              aria-label="Back to the main menu"
              title="Main menu"
              className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-on-surface active:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">home</span>
            </Link>
          )}
          {variant === "brand" && (
            <Link
              to="/profile"
              aria-label="Your profile"
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center overflow-hidden"
            >
              {label ? (
                <span className="font-label-sm text-label-sm font-bold text-on-primary">{label}</span>
              ) : (
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
