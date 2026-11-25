import { useEffect, useState } from "react";

const QUOTES = [
  "Don’t just prepare for the future. Start building it.",
  "Your background doesn’t determine your destination. Your decisions do.",
  "Great ideas deserve a place to grow.",
  "Your next achievement could begin with one decision today.",
];

export default function Quotes() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearInterval(timer);
      if (document.hidden) return;
      timer = window.setInterval(() => setIndex((value) => (value + 1) % QUOTES.length), 6200);
    };
    schedule();
    const onVisibility = () => {
      if (document.hidden) window.clearInterval(timer);
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="psl-quotes">
      <div className="psl-quotes__mark" aria-hidden="true">
        <span className="material-symbols-outlined filled">format_quote</span>
      </div>

      <div className="psl-quote" aria-live="polite">
        {QUOTES.map((quote, i) => (
          <p key={quote} className={i === index ? "is-active" : ""} aria-hidden={i === index ? undefined : "true"}>
            {quote}
          </p>
        ))}
      </div>

      <div className="psl-quotes__dots" role="tablist" aria-label="Motivational quotes">
        {QUOTES.map((quote, i) => (
          <button
            key={quote}
            type="button"
            role="tab"
            className={`psl-dot${i === index ? " is-active" : ""}`}
            aria-selected={i === index}
            aria-label={`Show quote ${i + 1}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
