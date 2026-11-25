import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import { generateLesson } from "../services/api.js";
import Loader from "../components/Loader.jsx";
import Paragraphs from "../components/Paragraphs.jsx";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const loadedFor = useRef(null);

  async function load() {
    setError("");
    const { data, error: loadError } = await supabase.from("user_lessons").select("*").eq("id", id).single();
    if (loadError || !data) {
      setError("We could not find this lesson.");
      return;
    }
    if (data.status === "locked") {
      navigate("/learn", { replace: true });
      return;
    }
    if (!data.content) {
      // First time opening this lesson: the AI writes it, then we save it so it never changes.
      setWriting(true);
      try {
        const content = await generateLesson(data.career_field, data.specialization, data.title, data.summary);
        await supabase.from("user_lessons").update({ content }).eq("id", id);
        data.content = content;
      } catch (err) {
        setError(err.message);
        setWriting(false);
        return;
      }
      setWriting(false);
    }
    setLesson(data);
  }

  useEffect(() => {
    if (loadedFor.current === id) return; // avoids a double AI call in development
    loadedFor.current = id;
    load();
  }, [id]);

  if (error) {
    return (
      <div className="stack">
        <Link to="/learn" className="back">Back to lessons</Link>
        <div className="error" role="alert">{error}</div>
        <button className="btn btn-primary btn-block" onClick={() => { loadedFor.current = id; load(); }}>Try again</button>
      </div>
    );
  }
  if (!lesson) return <Loader text={writing ? "Writing your lesson..." : "Loading..."} />;

  const content = lesson.content;
  return (
    <div className="lesson-body">
      <Link to="/learn" className="back">Back to lessons</Link>
      <span className="chip">Lesson {lesson.position}</span>
      <h1>{lesson.title}</h1>
      <p className="muted">{content.intro}</p>

      {(content.sections || []).map((section, i) => (
        <section key={i}>
          <h2>{section.heading}</h2>
          <Paragraphs text={section.body} />
        </section>
      ))}

      {(content.key_points || []).length > 0 && (
        <div className="card card-tint" style={{ marginTop: 20 }}>
          <h3>Key points</h3>
          <ul className="key-points">{content.key_points.map((point, i) => <li key={i}>{point}</li>)}</ul>
        </div>
      )}

      <p className="warn" style={{ marginTop: 20 }}>
        This lesson was written by AI. Check important details with official sources or a qualified professional.
      </p>

      <Link to={`/quiz/${lesson.id}`} className="btn btn-primary btn-block">Take the quiz</Link>
    </div>
  );
}
