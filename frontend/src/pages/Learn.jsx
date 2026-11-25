import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import Icon from "../components/Icon.jsx";
import Loader from "../components/Loader.jsx";

export default function Learn() {
  const { user, profile } = useAuth();
  const [lessons, setLessons] = useState(null);

  useEffect(() => {
    supabase.from("user_lessons").select("id,title,summary,position,status,score").eq("user_id", user.id).order("position")
      .then(({ data }) => setLessons(data || []));
  }, [user.id]);

  if (lessons === null) return <Loader />;

  const completed = lessons.filter((l) => l.status === "completed").length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const current = lessons.find((l) => l.status === "current");
  const circumference = 2 * Math.PI * 20;

  return (
    <div className="stack" style={{ marginTop: -4 }}>
      <section>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.68rem" }}>
            <Icon name="engineering" size={16} />
            Career roadmap
            <Icon name="chevron" size={14} />
            <span style={{ color: "var(--violet)", textTransform: "none", letterSpacing: 0 }}>{profile.career_field}</span>
          </span>
          <span className="chip" style={{ margin: 0 }}>
            <Icon name="verified" size={13} filled />
            Path
          </span>
        </div>
        <h1 style={{ marginBottom: 4 }}>{profile.specialization} Path</h1>
        <p className="lead" style={{ margin: 0 }}>
          Finish each lesson and pass its quiz to unlock the next one.
        </p>
      </section>

      <section className="card" style={{ position: "relative", overflow: "hidden" }}>
        <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="chip neutral" style={{ marginBottom: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--violet)", display: "inline-block" }} />
              {current ? "Active lesson" : "Path finished"}
            </span>
            <h2 style={{ fontSize: "1rem", margin: "2px 0 2px" }}>
              {current ? current.title : "Every lesson complete"}
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              {current ? current.summary : "You finished this path. Review any lesson or start a new career."}
            </p>
          </div>
          <div className="gauge">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle className="track" cx="24" cy="24" r="20" />
              <circle
                className="value"
                cx="24"
                cy="24"
                r="20"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (percent / 100) * circumference}
              />
            </svg>
            <span>{percent}%</span>
          </div>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="muted small">Progress</span>
          <span className="small" style={{ color: "var(--violet)", fontWeight: 800 }}>
            {completed} of {lessons.length} complete
          </span>
        </div>
        <div className="progress"><div style={{ width: `${percent}%` }} /></div>
      </section>

      <div className="section-title">
        <h3>Your lessons</h3>
        <span>{lessons.length} lessons</span>
      </div>

      <section className="timeline">
        {lessons.map((lesson) => {
          const locked = lesson.status === "locked";
          const body = (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.64rem" }}>
                  Lesson {lesson.position}
                </span>
                {lesson.status === "completed" && <span className="chip ok" style={{ margin: 0 }}>Completed · {lesson.score}%</span>}
                {lesson.status === "current" && <span className="chip" style={{ margin: 0 }}>Up next</span>}
                {locked && <span className="chip neutral" style={{ margin: 0 }}>Locked</span>}
              </div>
              <h3 style={{ margin: "4px 0 2px" }}>{lesson.title}</h3>
              <p className="muted small">{lesson.summary}</p>
            </>
          );

          return (
            <div className="timeline-item" key={lesson.id}>
              <div className="timeline-rail">
                <div className={`timeline-node ${lesson.status}`}>
                  {lesson.status === "completed" ? (
                    <Icon name="check" size={16} />
                  ) : locked ? (
                    <Icon name="lock" size={14} />
                  ) : (
                    lesson.position
                  )}
                </div>
                <div className="timeline-connector" />
              </div>
              {locked ? (
                <div className="timeline-card locked">{body}</div>
              ) : (
                <Link to={`/lesson/${lesson.id}`} className={`timeline-card ${lesson.status}`}>{body}</Link>
              )}
            </div>
          );
        })}
      </section>

      <p className="muted small" style={{ marginTop: 18 }}>
        Lessons are written by AI for your chosen career. Check important details with official sources.
      </p>
    </div>
  );
}
