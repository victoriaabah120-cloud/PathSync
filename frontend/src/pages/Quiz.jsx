import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import { generateQuiz } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import Loader from "../components/Loader.jsx";

const PASS_MARK = 60; // percent needed to pass

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [lesson, setLesson] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [certificateId, setCertificateId] = useState(null);
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
      navigate(`/lesson/${id}`, { replace: true });
      return;
    }
    let quiz = data.quiz;
    if (!Array.isArray(quiz) || quiz.length === 0) {
      try {
        const summary = [data.content.intro, ...(data.content.key_points || [])].join(" ");
        const response = await generateQuiz(data.career_field, data.specialization, data.title, summary);
        quiz = response.questions;
        await supabase.from("user_lessons").update({ quiz }).eq("id", id);
      } catch (err) {
        setError(err.message);
        return;
      }
    }
    setLesson(data);
    setQuestions(quiz);
  }

  useEffect(() => {
    if (loadedFor.current === id) return;
    loadedFor.current = id;
    load();
  }, [id]);

  function choose(optionIndex) {
    if (picked !== null) return;
    setPicked(optionIndex);
    if (optionIndex === questions[index].answer_index) setScore((s) => s + 1);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    await finish();
  }

  async function finish() {
    const percent = Math.round((score / questions.length) * 100);
    const passed = percent >= PASS_MARK;
    setResult({ percent, passed });
    if (!passed) return;

    setSaving(true);
    try {
      if (lesson.status === "completed") {
        // Already passed before: just find the existing certificate.
        const { data } = await supabase.from("certificates").select("id").eq("lesson_id", lesson.id).maybeSingle();
        setCertificateId(data?.id || null);
      } else {
        await supabase.from("user_lessons")
          .update({ status: "completed", score: percent, completed_at: new Date().toISOString() })
          .eq("id", lesson.id);
        // Unlock the next lesson.
        await supabase.from("user_lessons")
          .update({ status: "current" })
          .eq("user_id", user.id).eq("position", lesson.position + 1).eq("status", "locked");

        const holder = profile?.full_name || user.email.split("@")[0];
        const { data: certificate, error: certError } = await supabase.from("certificates").insert({
          user_id: user.id,
          lesson_id: lesson.id,
          holder_name: holder,
          lesson_title: lesson.title,
          career_field: lesson.career_field,
          specialization: lesson.specialization,
          score: percent,
          certificate_code: `PS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        }).select("id").single();
        if (certError) throw certError;
        setCertificateId(certificate.id);
      }
    } catch (err) {
      setError(err.message || "We could not save your result.");
    } finally {
      setSaving(false);
    }
  }

  function retry() {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setResult(null);
    setError("");
  }

  if (error && !result) {
    return (
      <div className="stack">
        <Link to={`/lesson/${id}`} className="back">Back to the lesson</Link>
        <div className="error" role="alert">{error}</div>
        <button className="btn btn-primary btn-block" onClick={() => { loadedFor.current = id; load(); }}>Try again</button>
      </div>
    );
  }
  if (!lesson) return <Loader text="Preparing your quiz..." />;

  if (result) {
    return (
      <div className="stack">
        <h1>{result.passed ? "You passed" : "Not quite yet"}</h1>
        <div className="card">
          <h2>{result.percent}%</h2>
          <p className="muted">
            {score} of {questions.length} correct. You need {PASS_MARK}% to pass.
          </p>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {result.passed ? (
          saving ? <Loader text="Saving your certificate..." /> : (
            <>
              {certificateId && <Link to={`/certificate/${certificateId}`} className="btn btn-primary btn-block">View my certificate</Link>}
              <Link to="/learn" className="btn btn-ghost btn-block">Back to lessons</Link>
            </>
          )
        ) : (
          <>
            <button className="btn btn-primary btn-block" onClick={retry}>Try the quiz again</button>
            <Link to={`/lesson/${lesson.id}`} className="btn btn-ghost btn-block">Review the lesson</Link>
          </>
        )}
      </div>
    );
  }

  const question = questions[index];
  return (
    <div className="stack">
      <Link to={`/lesson/${lesson.id}`} className="back">Back to the lesson</Link>
      <div className="progress"><div style={{ width: `${(index / questions.length) * 100}%` }} /></div>
      <p className="muted small">Question {index + 1} of {questions.length}</p>
      <h2>{question.question}</h2>

      <div>
        {question.options.map((option, i) => {
          let className = "option";
          if (picked !== null) {
            if (i === question.answer_index) className += " correct";
            else if (i === picked) className += " wrong";
          }
          return (
            <button key={i} className={className} disabled={picked !== null} onClick={() => choose(i)}>{option}</button>
          );
        })}
      </div>

      {picked !== null && (
        <>
          <div className={picked === question.answer_index ? "notice" : "error"}>
            <strong>{picked === question.answer_index ? "Correct. " : "Not quite. "}</strong>
            {question.explanation}
          </div>
          <button className="btn btn-primary btn-block" onClick={next}>
            {index + 1 < questions.length ? "Next question" : "See my result"}
          </button>
        </>
      )}
    </div>
  );
}