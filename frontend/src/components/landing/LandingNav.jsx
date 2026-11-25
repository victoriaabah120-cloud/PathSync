import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const LINKS = [
  { id: "top", label: "Home" },
  { id: "vision", label: "Discover" },
  { id: "features", label: "Features" },
  { id: "about", label: "About" },
];

export function scrollToId(id) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (id === "top") {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    return;
  }
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("top");
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = window.scrollY;
      setScrolled(top > 14);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, top / max)) : 0);
      // Near the top the page is back at its hero, so Home is the current section.
      if (top < 160) setActive((current) => (current === "top" ? current : "top"));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const sections = ["vision", "features", "about"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (id) => {
    setOpen(false);
    scrollToId(id);
  };

  return (
    <>
      <div className="psl-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      <header className={`psl-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="psl-wrap psl-nav__inner">
          <a
            className="psl-brand"
            href="#top"
            onClick={(event) => {
              event.preventDefault();
              go("top");
            }}
          >
            <span className="psl-brand__mark">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 19V5h6.2a4.4 4.4 0 0 1 0 8.8H5"
                  stroke="#fff"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="17.4" cy="18.6" r="1.7" fill="#e9d5ff" />
              </svg>
            </span>
            PathSync
          </a>

          <nav className="psl-nav__links" aria-label="Landing sections">
            {LINKS.map((link) => (
              <a
                key={link.id}
                className={`psl-nav__link${active === link.id ? " is-active" : ""}`}
                href={`#${link.id}`}
                aria-current={active === link.id ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  go(link.id);
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="psl-nav__actions">
            <Link className="psl-nav__signin" to="/login">
              Sign In
            </Link>
            <Link className="psl-btn psl-btn--primary" to="/login?mode=signup" style={{ height: "2.75rem", paddingInline: "1.15rem", fontSize: "0.86rem" }}>
              Get Started
            </Link>
            <button
              type="button"
              className="psl-burger"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="psl-mobile-menu"
              onClick={() => setOpen((value) => !value)}
            >
              <span className="material-symbols-outlined">{open ? "close" : "menu"}</span>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="psl-menu" id="psl-mobile-menu">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(event) => {
                event.preventDefault();
                go(link.id);
              }}
            >
              {link.label}
            </a>
          ))}
          <div className="psl-menu__actions">
            <Link className="psl-btn psl-btn--ghost" to="/login" onClick={() => setOpen(false)}>
              Sign In
            </Link>
            <Link className="psl-btn psl-btn--primary" to="/login?mode=signup" onClick={() => setOpen(false)}>
              Get Started
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
