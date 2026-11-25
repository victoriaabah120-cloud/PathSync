import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pathsync.theme"; // "light" | "dark"; absent means the default gradient look
const ThemeContext = createContext(null);

const query = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function systemTheme() {
  return query()?.matches ? "dark" : "light";
}

function paint(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0716" : "#f8f9ff");
}

/**
 * Theme preference: "light", "dark" or "system".
 * The choice is stored on the device; with no stored choice the device setting wins
 * and keeps winning while the device setting changes.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // The indigo -> violet canvas is the default; Light and System are opt-in.
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const [system, setSystem] = useState(systemTheme);

  const resolved = preference === "system" ? system : preference;

  // Keep the <html> class and the browser chrome colour in step with the choice.
  useEffect(() => {
    paint(resolved);
  }, [resolved]);

  // Follow the device while the learner has not picked a theme themselves.
  useEffect(() => {
    const mq = query();
    if (!mq) return undefined;
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    setSystem(mq.matches ? "dark" : "light");
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const setTheme = useCallback((next) => {
    if (next !== "light" && next !== "dark" && next !== "system") return;
    setPreference(next);
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked in private mode: the theme still applies for this visit */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme: resolved, preference, setTheme, toggle }),
    [resolved, preference, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
