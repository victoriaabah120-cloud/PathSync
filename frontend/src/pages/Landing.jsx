import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import LandingNav, { scrollToId } from "../components/landing/LandingNav.jsx";
import HeroScene from "../components/landing/HeroScene.jsx";
import ParticleField from "../components/landing/ParticleField.jsx";
import Quotes from "../components/landing/Quotes.jsx";
import Reveal from "../components/landing/Reveal.jsx";
import "../landing.css";

const SIGNUP = "/login?mode=signup";

const VISION_ROWS = [
  {
    icon: "menu_book",
    title: "Learning",
    text: "Explore knowledge, ask questions and develop your understanding.",
  },
  {
    icon: "lightbulb",
    title: "Innovation",
    text: "Develop ideas and move closer to the things you want to build.",
  },
  {
    icon: "groups",
    title: "Collaboration",
    text: "Share knowledge and make meaningful connections as you grow.",
  },
];

const FEATURES = [
  {
    icon: "menu_book",
    title: "LEARN AND DISCOVER",
    text: "Explore knowledge, ask questions, discover new perspectives and develop your understanding through intelligent digital experiences.",
    tag: "Live in PathSync",
    tagIcon: "check_circle",
  },
  {
    icon: "lightbulb",
    title: "CREATE AND INNOVATE",
    text: "Turn your ideas into meaningful projects. Explore possibilities, experiment with concepts and bring your creativity to life.",
    tag: "On the roadmap",
    tagIcon: "schedule",
  },
  {
    icon: "groups",
    title: "CONNECT AND COLLABORATE",
    text: "Experience a connected environment that encourages collaboration, knowledge sharing and meaningful interactions.",
    tag: "On the roadmap",
    tagIcon: "schedule",
  },
];

const POSSIBILITY_STEPS = [
  "Every achievement starts somewhere.",
  "Every skill begins with curiosity.",
  "Every innovation begins with an idea.",
  "PathSync gives you a space to take that first step.",
];

const VALUES = [
  { icon: "lightbulb", title: "Innovation", text: "Embrace new ideas and possibilities." },
  { icon: "trending_up", title: "Growth", text: "Keep learning, improving and developing." },
  { icon: "groups", title: "Collaboration", text: "Make meaningful connections and share knowledge." },
  { icon: "explore", title: "Opportunity", text: "Discover new ways to develop your potential." },
  { icon: "workspace_premium", title: "Excellence", text: "Strive to make every achievement meaningful." },
];

const FOOTER_LINKS = [
  { id: "top", label: "Home" },
  { id: "vision", label: "Discover" },
  { id: "features", label: "Features" },
  { id: "about", label: "About" },
];

export default function Landing() {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const verifyCode = params.get("verify");

  // A certificate can be checked from /?verify=CODE. Unlike /verify/CODE this link
  // works on the static host, which has no rewrite rule for deep links.
  if (verifyCode) return <Navigate to={`/verify/${encodeURIComponent(verifyCode)}`} replace />;

  // Signed-in visitors keep the existing behaviour and go straight to the app.
  if (loading) {
    return (
      <div className="psl" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="psl-brand">
          <span className="psl-brand__mark">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 19V5h6.2a4.4 4.4 0 0 1 0 8.8H5" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17.4" cy="18.6" r="1.7" fill="#e9d5ff" />
            </svg>
          </span>
          PathSync
        </span>
      </div>
    );
  }
  if (session) return <Navigate to="/home" replace />;

  return (
    <div className="psl">
      <a className="psl-skip" href="#psl-main">
        Skip to content
      </a>

      <div className="psl-bg" aria-hidden="true">
        <span className="psl-orb psl-orb--1" />
        <span className="psl-orb psl-orb--2" />
        <span className="psl-orb psl-orb--3" />
        <span className="psl-noise" />
      </div>

      <LandingNav />

      <main id="psl-main">
        {/* ---------- hero ---------- */}
        <section className="psl-hero" aria-labelledby="psl-hero-title">
          <ParticleField />
          <div className="psl-wrap psl-hero__grid">
            <div>
              <Reveal as="h1" id="psl-hero-title" className="psl-h1">
                YOUR POTENTIAL
                <br />
                <span className="psl-grad">HAS NO LIMITS.</span>
              </Reveal>

              <Reveal as="p" className="psl-hero__sub" delay={90}>
                Your Journey. Your Growth. Your Future.
              </Reveal>

              <Reveal as="p" className="psl-hero__desc" delay={150}>
                PathSync is a connected digital environment designed to empower learning, simplify collaboration,
                encourage innovation and transform ambitious ideas into meaningful achievements.
              </Reveal>

              <Reveal className="psl-hero__cta" delay={210}>
                <Link className="psl-btn psl-btn--primary" to={SIGNUP}>
                  Get Started
                  <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
                    arrow_forward
                  </span>
                </Link>
                <button type="button" className="psl-btn psl-btn--ghost" onClick={() => scrollToId("vision")}>
                  Explore PathSync
                  <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
                    south
                  </span>
                </button>
              </Reveal>

              <Reveal className="psl-hero__chips" delay={270}>
                <span className="psl-chip">
                  <span className="material-symbols-outlined">route</span>
                  Guided career paths
                </span>
                <span className="psl-chip">
                  <span className="material-symbols-outlined">auto_awesome</span>
                  AI coach
                </span>
                <span className="psl-chip">
                  <span className="material-symbols-outlined">workspace_premium</span>
                  Lesson certificates
                </span>
              </Reveal>
            </div>

            <Reveal variant="scale" delay={140}>
              <HeroScene />
            </Reveal>
          </div>
        </section>

        {/* ---------- A. vision ---------- */}
        <section className="psl-section" id="vision" aria-labelledby="psl-vision-title">
          <div className="psl-wrap psl-vision">
            <div>
              <Reveal as="span" className="psl-eyebrow">
                <span className="material-symbols-outlined">visibility</span>
                Our Vision
              </Reveal>
              <Reveal as="h2" id="psl-vision-title" className="psl-h2" delay={70} style={{ marginTop: "1.1rem" }}>
                More Than a Platform. A Space for Possibilities.
              </Reveal>
              <Reveal as="p" className="psl-lede" delay={140} style={{ marginTop: "1.1rem", maxWidth: "34rem" }}>
                We believe that learning, innovation and collaboration should work together. PathSync brings these
                experiences into one connected environment where people can explore knowledge, develop ideas and move
                closer to their ambitions.
              </Reveal>
            </div>

            <div style={{ position: "relative" }}>
              <Reveal variant="right" delay={120} className="psl-glass psl-vision__panel">
                {VISION_ROWS.map((row) => (
                  <div className="psl-vision__stat" key={row.title}>
                    <span className="psl-vision__icon">
                      <span className="material-symbols-outlined">{row.icon}</span>
                    </span>
                    <p>
                      <strong>{row.title}</strong>
                      {row.text}
                    </p>
                  </div>
                ))}
              </Reveal>

              <span className="psl-float-chip" style={{ top: "-0.9rem", right: "1.2rem" }}>
                <span className="material-symbols-outlined">hub</span>
                One connected environment
              </span>
              <span className="psl-float-chip" style={{ bottom: "-0.9rem", left: "0.6rem", animationDelay: "-3s" }}>
                <span className="material-symbols-outlined">flag</span>
                Built for ambition
              </span>
            </div>
          </div>
        </section>

        {/* ---------- B. what PathSync offers ---------- */}
        <section className="psl-section psl-float-soft" id="features" aria-labelledby="psl-features-title">
          <div className="psl-wrap">
            <Reveal as="h2" id="psl-features-title" className="psl-h2">
              What PathSync Offers
            </Reveal>

            <div className="psl-cards">
              {FEATURES.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 110} className="psl-card">
                  <div className="psl-card__icon">
                    <span className="material-symbols-outlined">{feature.icon}</span>
                  </div>
                  <h3 className="psl-h3">{feature.title}</h3>
                  <p>{feature.text}</p>
                  <span className="psl-card__tag">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {feature.tagIcon}
                    </span>
                    {feature.tag}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- C. the power of possibility ---------- */}
        <section className="psl-section" id="possibility" aria-labelledby="psl-possibility-title">
          <div className="psl-wrap">
            <div className="psl-possibility">
              <div className="psl-possibility__grid">
                <div>
                  <Reveal as="span" className="psl-eyebrow">
                    <span className="material-symbols-outlined">bolt</span>
                    The Power of Possibility
                  </Reveal>
                  <Reveal as="h2" id="psl-possibility-title" className="psl-h2" delay={70} style={{ marginTop: "1.1rem" }}>
                    Big Ideas Begin With Small Decisions.
                  </Reveal>
                  <Reveal as="p" className="psl-lede" delay={140} style={{ marginTop: "1.1rem", maxWidth: "32rem" }}>
                    Every achievement starts somewhere. Every skill begins with curiosity. Every innovation begins with
                    an idea. PathSync gives you a space to take that first step.
                  </Reveal>
                </div>

                <div className="psl-steps">
                  {POSSIBILITY_STEPS.map((step, index) => (
                    <Reveal key={step} delay={index * 90} className="psl-step">
                      <span className="psl-step__n">{String(index + 1).padStart(2, "0")}</span>
                      <span>{step}</span>
                      <span className="material-symbols-outlined">north_east</span>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- D. why PathSync ---------- */}
        <section className="psl-section psl-float-soft psl-float-soft--alt" id="about" aria-labelledby="psl-about-title">
          <div className="psl-wrap">
            <Reveal as="h2" id="psl-about-title" className="psl-h2">
              Why PathSync?
            </Reveal>

            <div className="psl-values">
              {VALUES.map((value, index) => (
                <Reveal key={value.title} delay={index * 80} className="psl-value">
                  <span className="psl-value__icon">
                    <span className="material-symbols-outlined">{value.icon}</span>
                  </span>
                  <div>
                    <h3>{value.title}</h3>
                    <p>{value.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- E. motivational quotes ---------- */}
        <section className="psl-section" aria-labelledby="psl-quotes-title">
          <div className="psl-wrap">
            <Reveal as="h2" id="psl-quotes-title" className="psl-eyebrow" style={{ marginBottom: "1.4rem" }}>
              <span className="material-symbols-outlined">format_quote</span>
              Motivational Quotes
            </Reveal>
            <Reveal variant="scale" delay={90}>
              <Quotes />
            </Reveal>
          </div>
        </section>

        {/* ---------- F. final call to action ---------- */}
        <section className="psl-section" id="start" aria-labelledby="psl-start-title">
          <div className="psl-wrap">
            <Reveal variant="scale" className="psl-final">
              <div className="psl-final__glow" aria-hidden="true" />
              <h2 id="psl-start-title" className="psl-h2">
                YOUR JOURNEY DOESN’T HAVE TO WAIT.
              </h2>
              <p className="psl-lede" style={{ marginTop: "1.1rem", maxWidth: "38rem", marginInline: "auto" }}>
                Take the first step towards discovering what’s possible. Your next chapter starts here.
              </p>
              <div className="psl-final__actions">
                <Link className="psl-btn psl-btn--primary" to={SIGNUP}>
                  Start Your Journey
                  <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
                    arrow_forward
                  </span>
                </Link>
                <p className="psl-final__hint">
                  Already have an account?{" "}
                  <Link className="psl-link" to="/login">
                    Sign In
                  </Link>
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="psl-footer">
        <div className="psl-wrap psl-footer__inner">
          <a
            className="psl-brand"
            href="#top"
            onClick={(event) => {
              event.preventDefault();
              scrollToId("top");
            }}
            style={{ fontSize: "1rem" }}
          >
            <span className="psl-brand__mark" style={{ width: "2rem", height: "2rem", borderRadius: "0.65rem" }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 19V5h6.2a4.4 4.4 0 0 1 0 8.8H5" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="17.4" cy="18.6" r="1.7" fill="#e9d5ff" />
              </svg>
            </span>
            PathSync
          </a>

          <nav className="psl-footer__links" aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToId(link.id);
                }}
              >
                {link.label}
              </a>
            ))}
            <Link to="/login">Sign In</Link>
            <Link to={SIGNUP}>Get Started</Link>
          </nav>

          <p className="psl-footer__copy">© {new Date().getFullYear()} PathSync. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
