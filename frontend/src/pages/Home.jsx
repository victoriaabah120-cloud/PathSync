import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { quoteOfTheDay } from "../data/quotes.js";
import Icon from "../components/Icon.jsx";
import Loader from "../components/Loader.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const { user, profile } = useAuth();
  const [lessons, setLessons] = useState(null);
  const [certificateCount, setCertificateCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("user_lessons").select("id,title,summary,position,status").eq("user_id", user.id).order("position");
      setLessons(data || []);
      const { count } = await supabase.from("certificates").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setCertificateCount(count || 0);
    }
    load();
  }, [user.id]);

  if (lessons === null) return <Loader />;

  const firstName = (profile?.full_name || user.email.split("@")[0]).split(" ")[0];
  const completed = lessons.filter((l) => l.status === "completed").length;
  const current = lessons.find((l) => l.status === "current");
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const upcoming = lessons.filter((l) => l.status !== "completed").slice(0, 3);

  return (
    <div className="stack" style={{ marginTop: -4 }}>
      <section>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">Daily sync</span>
          <span className="chip neutral" style={{ margin: 0 }}>
            <Icon name="streak" size={14} filled />
            {completed > 0 ? `${completed} done` : "New start"}
          </span>
        </div>
        <h1 style={{ marginBottom: 4 }}>{greeting()}, {firstName}</h1>
        <p className="lead" style={{ margin: 0 }}>
          Ready to make progress in {profile.specialization} today?
        </p>
      </section>

      <section className="card quote-card">
        <div className="quote-icon">
          <Icon name="quote" size={20} filled />
        </div>
        <div>
          <p className="quote">“{quoteOfTheDay()}”</p>
          <span className="muted small">Quote of the day</span>
        </div>
      </section>

      {current ? (
        <section className="card card-hero">
          <div className="card-hero-top">
            <span className="chip solid" style={{ alignSelf: "flex-start", marginBottom: 6 }}>
              Current lesson · {current.position} of {lessons.length}
            </span>
            <h2>{current.title}</h2>
          </div>
          <div className="card-hero-body">
            <div className="row">
              <span className="muted small">{profile.specialization}</span>
              <span style={{ color: "var(--violet)", fontWeight: 800, fontSize: "0.85rem" }}>{percent}%</span>
            </div>
            <div className="progress"><div style={{ width: `${percent}%` }} /></div>
            <Link to={`/lesson/${current.id}`} className="btn btn-primary btn-block">
              Continue lesson
              <Icon name="forward" size={18} />
            </Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <span className="chip ok">Path complete</span>
          <h2>All lessons complete</h2>
          <p className="muted">Well done. You finished every lesson in this path.</p>
          <Link to="/certificates" className="btn btn-primary btn-block">See your certificates</Link>
        </section>
      )}

      <section>
        <div className="section-title">
          <h3>Your milestones</h3>
          <span>{lessons.length} lessons in this path</span>
        </div>
        <div className="grid-2">
          <div className="card metric">
            <div className="metric-icon"><Icon name="checkCircle" size={18} filled /></div>
            <div>
              <div className="metric-value">{completed}</div>
              <div className="metric-label">Lessons completed</div>
            </div>
          </div>
          <div className="card metric">
            <div className="metric-icon neutral"><Icon name="award" size={18} filled /></div>
            <div>
              <div className="metric-value">{certificateCount}</div>
              <div className="metric-label">Certificates earned</div>
            </div>
          </div>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section>
          <div className="section-title">
            <h3>Next up</h3>
            <Link to="/learn" className="small" style={{ fontWeight: 700 }}>See all</Link>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {upcoming.map((lesson) => (
              <Link
                key={lesson.id}
                to={lesson.status === "locked" ? "/learn" : `/lesson/${lesson.id}`}
                className="card card-link"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}
              >
                <div className={`timeline-node ${lesson.status}`} style={{ width: 30, height: 30 }}>
                  {lesson.status === "current" ? lesson.position : <Icon name="lock" size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem" }}>{lesson.title}</p>
                  <p className="muted small" style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {lesson.summary || `Lesson ${lesson.position}`}
                  </p>
                </div>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <Link to="/coach" className="coach-note" style={{ color: "inherit" }}>
          <div className="presence">
            <div className="avatar" style={{ background: "var(--violet)", color: "#fff" }}>
              <Icon name="sparkle" size={18} filled />
            </div>
            <span className="dot" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem" }}>Your AI Coach is ready</p>
            <p className="muted small" style={{ margin: 0 }}>Stuck on something? Ask for a simpler explanation.</p>
          </div>
          <Icon name="chevron" size={18} />
        </Link>
      </section>
    </div>
  );
}
