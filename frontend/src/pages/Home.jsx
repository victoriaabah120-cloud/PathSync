import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { quoteOfTheDay } from "../data/quotes.js";
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

  return (
    <div className="stack">
      <div>
        <p className="muted small" style={{ margin: 0 }}>{greeting()}</p>
        <h1>{firstName}</h1>
        <p className="muted">Learning: {profile.specialization}</p>
      </div>

      <div className="card card-tint">
        <p className="muted small">Daily motivation</p>
        <p className="quote">{quoteOfTheDay()}</p>
      </div>

      {current ? (
        <div className="card">
          <span className="chip">Lesson {current.position} of {lessons.length}</span>
          <h2>{current.title}</h2>
          <p className="muted">{current.summary}</p>
          <div className="progress"><div style={{ width: `${percent}%` }} /></div>
          <p className="muted small" style={{ marginTop: 6 }}>{completed} of {lessons.length} lessons complete</p>
          <Link to={`/lesson/${current.id}`} className="btn btn-primary btn-block">Continue lesson</Link>
        </div>
      ) : (
        <div className="card">
          <h2>All lessons complete</h2>
          <p className="muted">Well done. You finished every lesson in this path.</p>
          <Link to="/certificates" className="btn btn-primary btn-block">See your certificates</Link>
        </div>
      )}

      <div className="grid-2">
        <div className="card"><h2>{completed}</h2><span className="muted">Lessons completed</span></div>
        <div className="card"><h2>{certificateCount}</h2><span className="muted">Certificates earned</span></div>
      </div>

      <Link to="/coach" className="card card-dark" style={{ display: "block" }}>
        <strong>Ask your AI Coach</strong>
        <p className="muted" style={{ margin: 0 }}>Stuck on something? Get a simple explanation or a practice exercise.</p>
      </Link>
    </div>
  );
}
