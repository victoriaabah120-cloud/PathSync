import { useTheme } from "../context/ThemeContext.jsx";

/**
 * Sun in light mode, moon in dark mode. Clicking switches the whole app theme
 * and remembers the choice on this device.
 */
export default function ThemeToggle({ floating = false, className = "" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const next = isDark ? "light" : "dark";

  const base =
    "flex items-center justify-center rounded-full transition-colors active:scale-95 duration-150";
  const shape = floating
    ? "fixed top-3 right-3 z-[60] w-10 h-10 bg-surface-container-lowest/90 backdrop-blur shadow-md ring-1 ring-outline-variant/40"
    : "w-9 h-9 bg-surface-container-low hover:bg-surface-container text-on-surface";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      aria-pressed={isDark}
      data-theme-toggle=""
      className={`${base} ${shape} ${className}`}
    >
      <span className="material-symbols-outlined text-[20px] text-on-surface" aria-hidden="true">
        {isDark ? "dark_mode" : "light_mode"}
      </span>
    </button>
  );
}
