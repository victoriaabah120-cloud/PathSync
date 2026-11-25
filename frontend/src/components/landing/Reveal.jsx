import { useEffect, useRef, useState } from "react";

/**
 * Reveals children once they scroll into view. Falls back to visible
 * immediately when IntersectionObserver is missing or motion is reduced.
 */
export default function Reveal({ children, as: Tag = "div", delay = 0, variant = "", className = "", ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const variantClass = variant ? ` psl-reveal--${variant}` : "";

  return (
    <Tag
      ref={ref}
      className={`psl-reveal${variantClass}${shown ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? { "--psl-delay": `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
