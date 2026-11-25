import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QUESTIONS, NOT_SURE } from "../data/assessment.js";
import { recommendCareers } from "../services/api.js";
import Loader from "../components/Loader.jsx";

export default function Assessment() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // question id -> list of chosen options
  const [freeText, setFreeText] = useState("");
  const [stage, setStage] = useState("questions"); // "questions" | "loading" | "results"
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const lastIndex = QUESTIONS.length; // the step after the last question is the free-text box
  const isFreeTextStep = index === lastIndex;
  const question = QUESTIONS[index];
  const chosen = question ? answers[question.id] || [] : [];
  const progress = Math.round((index / (QUESTIONS.length + 1)) * 100);

  function toggle(option) {
    setAnswers((previous) => {
      const current = previous[question.id] || [];
      if (option === NOT_SURE) {
        return { ...previous, [question.id]: current.includes(NOT_SURE) ? [] : [NOT_SURE] };
      }
      let next = current.filter((item) => item !== NOT_SURE);
      if (next.includes(option)) next = next.filter((item) => item !== option);
      else if (question.max === 1) next = [option];
      else if (next.length < question.max) next = [...next, option];
      return { ...previous, [question.id]: next };
    });
  }

  async function submit() {
    setError("");
    setStage("loading");
    try {
      const payload = QUESTIONS.map((q) => ({ question: q.text, answers: answers[q.id] || [] }));
      const data = await recommendCareers(payload, freeText);
      setResults(data.careers);
      setStage("results");
    } catch (err) {
      setError(err.message);
      setStage("questions");
    }
  }

  function choose(career) {
    const params = new URLSearchParams({ field: career.field, spec: career.specialization });
    navigate(`/setup?${params.toString()}`);
  }

  if (stage === "loading") return <Loader text="Finding careers that fit you..." />;

  if (stage === "results") {
    return (
      <div className="stack">
        <h1>Careers that may suit you</h1>
        <p className="muted">These are suggestions to explore, not a final answer. Pick the one you want to learn.</p>
        {results.map((career) => (
          <div className="card" key={`${career.field}-${career.specialization}`}>
            <span className="chip">{career.field}</span>
            <h2>{career.specialization}</h2>
            <p>{career.why}</p>
            <div>{career.key_skills.map((skill) => <span className="chip ok" key={skill}>{skill}</span>)}</div>
            <button className="btn btn-primary btn-block" onClick={() => choose(career)}>Choose this career</button>
          </div>
        ))}
        <Link to="/categories" className="btn btn-ghost btn-block">Browse all careers instead</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="progress" aria-label="Progress"><div style={{ width: `${progress}%` }} /></div>

      {isFreeTextStep ? (
        <>
          <p className="muted small">Goals</p>
          <h1>Where do you want to be in 5 years?</h1>
          <p className="muted">Optional. A sentence or two is plenty.</p>
          <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} maxLength={500} />
        </>
      ) : (
        <>
          <p className="muted small">{question.step} - question {index + 1} of {QUESTIONS.length}</p>
          <h1>{question.text}</h1>
          <p className="muted">{question.hint}</p>
          <div>
            {[...question.options, NOT_SURE].map((option) => (
              <button key={option} className={chosen.includes(option) ? "option selected" : "option"} onClick={() => toggle(option)}>
                {option}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div className="error" role="alert">{error}</div>}

      <div className="row">
        <button className="btn btn-ghost" onClick={() => (index === 0 ? navigate("/intent") : setIndex(index - 1))}>Back</button>
        {isFreeTextStep ? (
          <button className="btn btn-primary" onClick={submit}>Find my careers</button>
        ) : (
          <button className="btn btn-primary" disabled={chosen.length === 0} onClick={() => setIndex(index + 1)}>Next</button>
        )}
      </div>
    </div>
  );
}