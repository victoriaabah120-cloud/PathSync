import { useEffect, useRef } from "react";

/**
 * The hero composition: layered glass panels floating in CSS 3D space.
 * Pointer movement on desktop shifts the whole stack a few pixels; touch
 * devices and reduced-motion users simply see the ambient float animations.
 */
export default function HeroScene() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const finePointer = window.matchMedia?.("(pointer: fine)")?.matches;
    if (reduced || !finePointer) return undefined;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;

    const apply = () => {
      frame = 0;
      layer.style.transform = `translate3d(${targetX.toFixed(2)}px, ${targetY.toFixed(2)}px, 0) rotateX(${(
        targetY * -0.06
      ).toFixed(2)}deg) rotateY(${(targetX * 0.08).toFixed(2)}deg)`;
    };

    const onMove = (event) => {
      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;
      targetX = nx * 14;
      targetY = ny * 12;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="psl-scene" aria-hidden="true">
      <div className="psl-scene__halo" />
      <div className="psl-scene__rings">
        <svg viewBox="0 0 400 400" focusable="false">
          <ellipse cx="200" cy="200" rx="188" ry="120" />
          <ellipse cx="200" cy="200" rx="120" ry="188" />
          <circle cx="200" cy="200" r="150" />
        </svg>
      </div>

      <div className="psl-scene__layer" ref={layerRef}>
        <div className="psl-panel psl-panel--main">
          <div className="psl-panel__top">
            <div>
              <p className="psl-panel__label">Career roadmap</p>
              <p className="psl-panel__title">Your learning path</p>
            </div>
            <div className="psl-ring">
              <svg viewBox="0 0 48 48" focusable="false">
                <defs>
                  <linearGradient id="psl-ring-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#e9d5ff" />
                  </linearGradient>
                </defs>
                <circle className="psl-ring__track" cx="24" cy="24" r="20" />
                <circle
                  className="psl-ring__value"
                  cx="24"
                  cy="24"
                  r="20"
                  strokeDasharray="125.6"
                  strokeDashoffset="44"
                />
              </svg>
              <span className="psl-ring__label">
                <span className="material-symbols-outlined filled" style={{ fontSize: 20, color: "#f3e9ff" }}>
                  auto_awesome
                </span>
              </span>
            </div>
          </div>

          <div className="psl-panel__row">
            <span className="psl-panel__dot">
              <span className="material-symbols-outlined">menu_book</span>
            </span>
            <div>
              <p className="psl-panel__text">Learn the foundations</p>
              <p className="psl-panel__hint">A written lesson for every step</p>
            </div>
          </div>
          <div className="psl-panel__row">
            <span className="psl-panel__dot">
              <span className="material-symbols-outlined">quiz</span>
            </span>
            <div>
              <p className="psl-panel__text">Check your understanding</p>
              <p className="psl-panel__hint">Short quiz, instant feedback</p>
            </div>
          </div>
          <div className="psl-panel__row">
            <span className="psl-panel__dot">
              <span className="material-symbols-outlined">workspace_premium</span>
            </span>
            <div>
              <p className="psl-panel__text">Mark the milestone</p>
              <p className="psl-panel__hint">A certificate when you pass</p>
            </div>
          </div>

          <div className="psl-bar">
            <span style={{ width: "64%" }} />
          </div>
        </div>

        <div className="psl-panel psl-panel--quiz">
          <div className="psl-panel__top" style={{ marginBottom: "0.45rem" }}>
            <span className="psl-chip">
              <span className="material-symbols-outlined">quiz</span>
              Concept check
            </span>
          </div>
          <p className="psl-panel__text">Single choice question</p>
          <p className="psl-panel__hint">Instant feedback after you answer</p>
        </div>

        <div className="psl-panel psl-panel--cert">
          <div className="psl-panel__top" style={{ marginBottom: "0.45rem" }}>
            <span className="psl-chip psl-chip--live">
              <span className="material-symbols-outlined filled">verified</span>
              Certificate
            </span>
          </div>
          <p className="psl-panel__text">Issued on completion</p>
        </div>

        <div className="psl-panel psl-panel--streak">
          <div className="psl-panel__top" style={{ marginBottom: "0.3rem" }}>
            <span className="psl-chip">
              <span className="material-symbols-outlined">local_fire_department</span>
              Daily focus
            </span>
          </div>
          <p className="psl-panel__hint">Small steps, every day</p>
        </div>

        <div className="psl-scene__base" />
      </div>
    </div>
  );
}
