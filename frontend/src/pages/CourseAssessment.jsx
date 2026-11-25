import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { startCourseAssessment, submitCourseAssessment } from "../services/api.js";
import Loader from "../components/Loader.jsx";

/**
 * The final course assessment. The questions come from the backend, the answers are
 * graded by the backend, and the certificate is only created once the backend has
 * confirmed that every lesson is finished and this assessment was passed.
 */
export default function CourseAssessment() {
  const { profile } = useAuth();
  const started = useRef(false);

  const [stage, setStage] = useState("starting"); // starting | questions | submitting | result | blocked | error | earned
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [message, setMessage] = useState("");

  async function begin() {
    setStage("starting");
    setMessage("");
    setResult(null);
    setIndex(0);
    try {
      const data = await startCourseAssessment(profile.career_field, profile.specialization);
      if (data.already_certified) {
        setCertificate(data.certificate);
        setStage("earned");
        return;
      }
      setAssessment(data);
      setAnswers(Array(data.questions.length).fill(null));
      setStage("questions");
    } catch (err) {
      setMessage(err.message);
      setStage(err.status === 409 ? "blocked" : "error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, []);

  function choose(optionIndex) {
    if (answers[index] !== null) return;
    const next = [...answers];
    next[index] = optionIndex;
    setAnswers(next);
  }

  async function next() {
    if (index + 1 < assessment.questions.length) {
      setIndex(index + 1);
      return;
    }
    setStage("submitting");
    try {
      const data = await submitCourseAssessment(assessment.assessment_id, answers);
      setResult(data);
      setCertificate(data.certificate || null);
      setStage("result");
    } catch (err) {
      setMessage(err.message);
      setStage("error");
    }
  }

  if (stage === "starting") return <Loader text="Preparing your final assessment..." />;
  if (stage === "submitting") return <Loader text="Marking your assessment..." />;

  if (stage === "blocked" || stage === "error") {
    return (
      <div className="flex flex-col w-full gap-space-md pt-2">
        <div className={`${stage === "blocked" ? "bg-secondary-fixed/60 text-on-secondary-fixed" : "bg-error-container text-on-error-container"} font-body-sm text-body-sm rounded-xl px-3 py-3`} role="alert">
          {message}
        </div>
        <button
          type="button"
          onClick={begin}
          className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold shadow-sm"
        >
          Try again
        </button>
        <Link
          to="/learn"
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
        >
          Back to the learning path
        </Link>
      </div>
    );
  }

  if (stage === "earned") {
    return (
      <div className="flex flex-col w-full gap-space-md pt-2">
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col items-center text-center gap-space-sm">
          <div className="w-14 h-14 rounded-full bg-secondary text-on-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] filled">workspace_premium</span>
          </div>
          <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold">Certificate already earned</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            You have completed this course and passed the final assessment.
          </p>
          {certificate && (
            <Link
              to={`/certificate/${certificate.id}`}
              className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
            >
              <span>View my certificate</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          )}
          <Link to="/learn" className="font-label-md text-label-md text-secondary font-semibold py-1">
            Back to the learning path
          </Link>
        </div>
      </div>
    );
  }

  if (stage === "result" && result) {
    const { passed, score, correct, total, pass_mark: passMark } = result;
    return (
      <div className="flex flex-col w-full gap-space-md pt-2">
        <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col items-center text-center gap-space-md">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${passed ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
            <span className="material-symbols-outlined text-[28px] filled">{passed ? "workspace_premium" : "refresh"}</span>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">
            {passed ? "Course complete" : "Not quite yet"}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {correct} of {total} correct · {score}%. You need {passMark}% to pass.
          </p>
          <div className="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden">
            <div className="bg-secondary h-full rounded-full" style={{ width: `${score}%` }} />
          </div>
          {passed && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Your certificate has been issued with a unique ID you can verify at any time.
            </p>
          )}
        </div>

        {passed ? (
          <div className="flex flex-col gap-space-sm">
            {certificate && (
              <Link
                to={`/certificate/${certificate.id}`}
                className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
              >
                <span>View my certificate</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
            )}
            {certificate && (
              <Link
                to={`/verify/${certificate.certificate_code}`}
                className="w-full h-12 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">verified</span>
                <span>Verify this certificate</span>
              </Link>
            )}
            <Link
              to="/learn"
              className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
            >
              Back to the learning path
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-space-sm">
            <button
              type="button"
              onClick={begin}
              className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"
            >
              <span>Take a new assessment</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <Link
              to="/learn"
              className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
            >
              Review the lessons
            </Link>
          </div>
        )}
      </div>
    );
  }

  const question = assessment.questions[index];
  const answered = answers[index] !== null;
  const progress = Math.round(((index + (answered ? 1 : 0)) / assessment.questions.length) * 100);
  const isLast = index + 1 === assessment.questions.length;

  return (
    <div className="flex flex-col w-full gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            Final assessment · {profile.specialization}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            Question {index + 1} of {assessment.questions.length}
          </span>
        </div>
        <span className="font-label-sm text-label-sm text-secondary font-bold">{progress}%</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
        <div className="h-full rounded-full bg-secondary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
          <span className="material-symbols-outlined text-[13px]">quiz</span>
          Single choice
        </span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-2 leading-snug">
          {question.question}
        </h2>

        <div className="flex flex-col gap-2 mt-space-md">
          {question.options.map((option, optionIndex) => {
            const selected = answers[index] === optionIndex;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(optionIndex)}
                disabled={answered}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  selected
                    ? "border-secondary bg-secondary-fixed/50 text-on-surface"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
                } ${answered && !selected ? "opacity-60" : ""}`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center font-label-sm text-label-sm font-bold shrink-0 ${selected ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant"}`}>
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="font-body-md text-body-md">{option}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={next}
        disabled={!answered}
        className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-40"
      >
        <span>{isLast ? "Submit the assessment" : "Next question"}</span>
        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
      </button>
      <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
        Your answers are marked on the server. You need {assessment.pass_mark}% to pass.
      </p>
    </div>
  );
}
