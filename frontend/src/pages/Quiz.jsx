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
  const { user } = useAuth();
  const [lesson, setLesson] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [courseComplete, setCourseComplete] = useState(false);
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
        const summary = [data.content.intro, ...(data.content.key_points || [])].join(" ").slice(0, 6000);
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
      if (lesson.status !== "completed") {
        await supabase.from("user_lessons")
          .update({ status: "completed", score: percent, completed_at: new Date().toISOString() })
          .eq("id", lesson.id);
        await supabase.from("user_lessons")
          .update({ status: "current" })
          .eq("user_id", user.id).eq("position", lesson.position + 1).eq("status", "locked");
      }

      // Passing a lesson quiz never issues a certificate. Check whether this was the
      // last lesson; the certificate itself comes from the final course assessment.
      const { data } = await supabase
        .from("user_lessons")
        .select("id,status")
        .eq("user_id", user.id)
        .eq("career_field", lesson.career_field)
        .eq("specialization", lesson.specialization);
      const rows = data || [];
      setCourseComplete(rows.length > 0 && rows.every((row) => row.status === "completed"));
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
      <div className="flex flex-col gap-space-sm">
        <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2" role="alert">
          {error}
        </div>
        <button
          type="button"
          onClick={() => { loadedFor.current = id; load(); }}
          className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold"
        >
          Try again
        </button>
        <Link
          to={`/lesson/${id}`}
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
        >
          Back to the lesson
        </Link>
      </div>
    );
  }
  if (!lesson) return <Loader text="Preparing your quiz..." />;

  if (result) {
    const passed = result.passed;
    return (
      <div className="flex flex-col w-full pb-24">
        <div className="flex items-center justify-between pt-space-xs mb-space-md">
          <div className="flex items-center gap-space-sm">
            <button
              type="button"
              aria-label="Exit quiz"
              onClick={() => navigate("/learn")}
              className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {lesson.specialization}
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">{lesson.title}</h2>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col gap-space-md text-center items-center">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              passed ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            <span className="material-symbols-outlined text-[28px] filled">{passed ? "emoji_events" : "refresh"}</span>
          </div>
          <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">
            {passed ? "You passed" : "Not quite yet"}
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {score} of {questions.length} correct · {result.percent}%. You need {PASS_MARK}% to pass.
          </p>
          <div className="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden">
            <div className="bg-secondary-container h-full rounded-full" style={{ width: `${result.percent}%` }} />
          </div>
        </div>

        {error && (
          <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2 mt-space-md" role="alert">
            {error}
          </div>
        )}

        <div className="mt-space-lg flex flex-col gap-space-sm">
          {passed ? (
            saving ? (
              <Loader text="Saving your result..." />
            ) : (
              <>
                {courseComplete ? (
                  <Link
                    to="/course-assessment"
                    className="w-full h-12 bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
                  >
                    <span>Take the final assessment</span>
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </Link>
                ) : (
                  <Link
                    to="/learn"
                    className="w-full h-12 bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
                  >
                    <span>Continue to the next lesson</span>
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </Link>
                )}
                <p className="font-body-sm text-body-sm text-on-surface-variant text-center px-2">
                  {courseComplete
                    ? "Every lesson is complete. Your certificate is issued after you pass the final assessment."
                    : "This lesson is done. Your certificate comes at the end of the whole course."}
                </p>
                <Link
                  to="/learn"
                  className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
                >
                  Back to lessons
                </Link>
              </>
            )
          ) : (
            <>
              <button
                type="button"
                onClick={retry}
                className="w-full h-12 bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
              >
                <span>Try the quiz again</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
              <Link
                to={`/lesson/${lesson.id}`}
                className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
              >
                Review the lesson
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const question = questions[index];
  const answered = picked !== null;
  const isCorrect = answered && picked === question.answer_index;
  const percentDone = Math.round(((index + (answered ? 1 : 0)) / questions.length) * 100);

  return (
    <div className="flex flex-col w-full pb-24 gap-space-md">
      <div className="flex items-center justify-between pt-space-xs">
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            aria-label="Exit quiz"
            onClick={() => navigate(`/lesson/${lesson.id}`)}
            className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider truncate">
              {lesson.specialization}
            </span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">{lesson.title}</h2>
          </div>
        </div>
        <div className="bg-surface-container-high px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm shrink-0">
          <span className="material-symbols-outlined text-secondary text-[16px] filled">bolt</span>
          <span className="font-label-md text-label-md font-bold text-on-surface">
            Question {index + 1} of {questions.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden p-0.5">
          <div className="bg-secondary-container h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${percentDone}%` }} />
        </div>
        <div className="flex justify-between items-center text-on-surface-variant font-label-sm text-label-sm px-1">
          <span className="flex items-center gap-1 font-medium text-secondary">
            <span className="material-symbols-outlined text-[14px]">timer</span> Question {index + 1}
          </span>
          <span className="font-semibold text-on-surface">{percentDone}% Completed</span>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col gap-space-md relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-24 h-24 bg-secondary-fixed/30 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-2">
          <span className="bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm px-2.5 py-0.5 rounded-full font-bold">
            Concept Check
          </span>
          <span className="text-on-surface-variant font-body-sm text-body-sm">• Single Choice</span>
        </div>
        <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold leading-tight">
          {question.question}
        </h3>
      </div>

      <div className="flex flex-col gap-space-sm">
        {question.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i);
          const isPicked = picked === i;
          const isAnswer = answered && i === question.answer_index;
          const dim = answered && !isPicked && !isAnswer;

          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => choose(i)}
              className={`w-full text-left transition-all duration-200 rounded-2xl p-space-md flex items-center justify-between relative overflow-hidden active:scale-[0.99] cursor-pointer ${
                isPicked
                  ? isCorrect
                    ? "bg-secondary-fixed/40 shadow-md"
                    : "bg-error-container/60 shadow-md"
                  : "bg-surface-container-lowest shadow-sm hover:bg-surface-container-low"
              } ${dim ? "opacity-75" : ""}`}
            >
              {isPicked && (
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isCorrect ? "bg-secondary-container" : "bg-error"}`} />
              )}
              <div className={`flex items-start gap-space-md min-w-0 pr-2 ${isPicked ? "pl-1" : ""}`}>
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-label-lg text-label-lg font-bold shrink-0 ${
                    isPicked ? "bg-secondary-container text-on-secondary shadow-sm" : "bg-surface-container text-on-surface"
                  }`}
                >
                  {letter}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-headline-sm text-headline-sm font-bold ${isPicked ? "text-on-secondary-fixed" : "text-on-surface"}`}>
                      {option}
                    </span>
                    {isPicked && (
                      <span className="bg-secondary-container text-on-secondary font-label-sm text-label-sm px-2 py-0.5 rounded-full font-semibold">
                        Your pick
                      </span>
                    )}
                    {answered && isAnswer && !isPicked && (
                      <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-2 py-0.5 rounded-full font-semibold">
                        Correct answer
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  isPicked
                    ? isCorrect
                      ? "bg-on-tertiary-container text-on-secondary"
                      : "bg-error text-on-error"
                    : "bg-surface-container"
                }`}
              >
                {isPicked ? (
                  <span className="material-symbols-outlined text-[18px] font-bold filled">{isCorrect ? "check" : "close"}</span>
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-transparent" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-space-sm relative overflow-hidden">
          <div className="flex items-center gap-space-sm">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isCorrect ? "bg-on-tertiary-container/15 text-on-tertiary-container" : "bg-error-container text-on-error-container"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] font-bold filled">{isCorrect ? "check_circle" : "cancel"}</span>
            </div>
            <h4 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {isCorrect ? "Correct! Great job." : "Not quite."}
            </h4>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant pl-10 leading-relaxed">{question.explanation}</p>
        </div>
      )}

      {answered && (
        <div className="sticky bottom-2 z-20 pt-space-xs">
          <div className="bg-surface-container-lowest/95 backdrop-blur-md p-space-md rounded-2xl shadow-xl flex flex-col gap-space-sm">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="flex items-center text-on-tertiary-container font-label-md text-label-md font-bold">
                  <span className="material-symbols-outlined text-[16px] mr-1 filled">verified</span>
                  Score: {score} / {index + 1} so far
                </div>
                <span className="text-outline-variant font-label-sm text-label-sm">•</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {score === index + 1 ? "Flawless streak!" : "Keep going!"}
                </span>
              </div>
              <div className="flex gap-1">
                {questions.map((q, i) => (
                  <span
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i < index ? "bg-secondary-container" : i === index ? "bg-secondary-container" : "bg-surface-container-highest"
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={next}
              className="w-full h-12 bg-secondary-container hover:bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <span>{index + 1 < questions.length ? "Next Question" : "See my result"}</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
