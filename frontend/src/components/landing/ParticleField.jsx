import { useEffect, useRef } from "react";

/**
 * Lightweight drifting particle field drawn on a canvas.
 * No libraries: one rAF loop, capped density, pauses when off-screen or hidden,
 * and renders a single static frame when reduced motion is requested.
 */
export default function ParticleField({ className = "psl-particles", density = 1 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let width = 0;
    let height = 0;
    let dots = [];
    let frame = 0;
    let visible = true;
    let running = false;

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

    function seed() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      const scale = dpr();
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);

      const count = Math.round(Math.min(70, Math.max(22, (width * height) / 24000)) * density);
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.5,
        vy: -(Math.random() * 0.16 + 0.04),
        sway: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.008 + 0.002,
        alpha: Math.random() * 0.5 + 0.18,
      }));
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      for (const dot of dots) {
        context.beginPath();
        context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(214, 190, 255, ${dot.alpha})`;
        context.fill();
      }
    }

    function tick() {
      if (!running) return;
      for (const dot of dots) {
        dot.y += dot.vy;
        dot.sway += dot.swaySpeed;
        dot.x += Math.sin(dot.sway) * 0.12;
        if (dot.y < -6) {
          dot.y = height + 6;
          dot.x = Math.random() * width;
        }
      }
      draw();
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    seed();
    draw();
    start();

    const onResize = () => {
      seed();
      draw();
    };

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            seed();
            draw();
          })
        : null;
    observer?.observe(canvas);

    const viewObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              if (visible) start();
              else stop();
            },
            { threshold: 0 },
          )
        : null;
    viewObserver?.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer?.disconnect();
      viewObserver?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
