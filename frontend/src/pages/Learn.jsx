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

  return (
    <div>
      <h1>{profile.specialization}</h1>
      <p className="muted">Finish each lesson and pass the quiz to unlock the next one.</p>

      {lessons.map((lesson) => {
        const locked = lesson.status === "locked";
        const body = (
          <>
            <div className="lesson-dot">
              {lesson.status === "completed" ? <Icon name="check" size={18} /> : locked ? <Icon name="lock" size={16} /> : lesson.position}
            </div>
            <div>
              <h3 style={{ marginBottom: 2 }}>{lesson.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>{lesson.summary}</p>
              {lesson.status === "completed" && <span className="chip ok" style={{ marginTop: 8 }}>Completed - {lesson.score}%</span>}
              {lesson.status === "current" && <span className="chip" style={{ marginTop: 8 }}>Up next</span>}
            </div>
          </>
        );
        return locked ? (
          <div key={lesson.id} className="lesson-item locked">{body}</div>
        ) : (
          <Link key={lesson.id} to={`/lesson/${lesson.id}`} className={`lesson-item ${lesson.status}`}>{body}</Link>
        );
      })}
    </div>
  );
}
