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
  const totalSteps = QUESTIONS.length + 1;
  const percent = Math.round((index / totalSteps) * 100);

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
    const top = results[0];
    return (
      <div className="flex flex-col w-full pb-8">
        <div className="flex flex-col gap-2 pt-2 mb-6">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-secondary font-semibold">All questions answered</span>
            <span className="font-label-md text-label-md text-on-surface-variant">100% Complete</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary-fixed overflow-hidden">
            <div className="h-full bg-secondary rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-secondary font-label-md text-label-md font-semibold mb-0.5">
              <span className="material-symbols-outlined text-base filled">auto_awesome</span>
              <span>Live Suggestions</span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Your Matches Based on Answers</h2>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {results.map((career) => (
            <div
              key={`${career.field}-${career.specialization}`}
              className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm flex flex-col"
            >
              <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-secondary-container via-secondary to-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[52px] text-white/90 filled">{careerIcon(career.field)}</span>
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-primary-container/85 text-on-primary font-label-sm text-label-sm">
                  {career.field}
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  High Fit
                </div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">{career.specialization}</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">{career.why}</p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-label-md text-label-md text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">school</span>
                    {career.field}
                  </span>
                  <button
                    type="button"
                    onClick={() => choose(career)}
                    className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1 hover:bg-surface-container-highest transition-colors"
                  >
                    <span>View Path</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {top && (
            <button
              type="button"
              onClick={() => choose(top)}
              className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-md hover:bg-secondary-container transition-all active:scale-[0.99]"
            >
              <span>Explore {top.specialization}</span>
              <span className="material-symbols-outlined text-base">east</span>
            </button>
          )}
          <Link
            to="/categories"
            className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center hover:bg-surface-container-high transition-colors"
          >
            Continue Assessment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8">
      <div className="flex flex-col gap-2 pt-2 mb-6">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-label-md text-secondary font-semibold">
            {isFreeTextStep ? "Last step" : `Question ${index + 1} of ${QUESTIONS.length}`}
          </span>
          <span className="font-label-md text-label-md text-on-surface-variant">{percent}% Complete</span>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary-fixed overflow-hidden">
          <div className="h-full bg-secondary rounded-full transition-all duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col gap-4 mb-8">
        <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-semibold">
          <span className="material-symbols-outlined text-sm leading-none filled">psychology</span>
          <span>{isFreeTextStep ? "Question: Your goals" : `Question ${index + 1}: ${question.step}`}</span>
        </div>

        {isFreeTextStep ? (
          <>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
              Where do you want to be in 5 years?
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Optional. A sentence or two is plenty.
            </p>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              maxLength={500}
              placeholder="For example: leading a small team and mentoring new colleagues."
              className="w-full min-h-[110px] p-4 rounded-xl bg-surface-container-low font-body-md text-body-md text-on-surface shadow-sm outline-none focus:bg-surface-container transition-colors"
            />
          </>
        ) : (
          <>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{question.text}</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Select the option that feels most natural to you. You can adjust this anytime later.
            </p>
            <div aria-label={question.text} className="flex flex-col gap-3 mt-2" role="radiogroup">
              {[...question.options, NOT_SURE].map((option) => {
                const selected = chosen.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => toggle(option)}
                    className={`group relative flex items-start text-left p-4 rounded-xl shadow-sm transition-all duration-200 cursor-pointer ${
                      selected ? "bg-secondary-fixed/30" : "bg-surface-container-low hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex-1 pr-3">
                      <p className="font-label-lg text-label-lg text-on-surface font-semibold">{option}</p>
                      {question.hint && option !== NOT_SURE && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{question.hint}</p>
                      )}
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm transition-colors ${
                        selected ? "bg-secondary text-on-secondary" : "bg-surface-container-highest"
                      }`}
                    >
                      <span className={`material-symbols-outlined text-base ${selected ? "" : "text-transparent"}`}>check</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2 mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {isFreeTextStep ? (
          <button
            type="button"
            onClick={submit}
            className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-md hover:bg-secondary-container transition-all active:scale-[0.99]"
          >
            <span>Find my careers</span>
            <span className="material-symbols-outlined text-base">east</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => setIndex(index + 1)}
            className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-md hover:bg-secondary-container disabled:opacity-50 transition-all active:scale-[0.99]"
          >
            <span>Continue Assessment</span>
            <span className="material-symbols-outlined text-base">east</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => (index === 0 ? navigate("/intent") : setIndex(index - 1))}
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center hover:bg-surface-container-high transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function careerIcon(field = "") {
  const name = field.toLowerCase();
  if (name.includes("engineer")) return "engineering";
  if (name.includes("health") || name.includes("medical") || name.includes("nurs")) return "health_and_safety";
  if (name.includes("law") || name.includes("legal")) return "gavel";
  if (name.includes("art") || name.includes("design") || name.includes("media")) return "palette";
  if (name.includes("business") || name.includes("finance") || name.includes("account")) return "trending_up";
  if (name.includes("educat") || name.includes("teach")) return "school";
  if (name.includes("agri")) return "agriculture";
  if (name.includes("tech") || name.includes("data") || name.includes("comput")) return "memory";
  return "explore";
}
