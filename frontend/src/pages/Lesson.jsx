import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import { generateLesson } from "../services/api.js";
import Loader from "../components/Loader.jsx";
import Markdown from "../components/Markdown.jsx";

const pad = (n) => String(n).padStart(2, "0");

function allText(content) {
  if (!content) return "";
  const parts = [
    content.intro,
    content.introduction,
    ...(content.objectives || []),
    ...(content.sections || []).map((s) => `${s.heading || ""} ${s.body || ""}`),
    ...(content.examples || []).map((e) => `${e.title || ""} ${e.body || ""}`),
    ...(content.common_mistakes || []).map((m) => `${m.mistake || m} ${m.fix || ""}`),
    ...(content.key_points || []),
    ...(content.key_takeaways || []),
    ...(content.practice || []).map((p) => `${p.question || ""} ${p.answer || ""}`),
    ...(content.further_learning || []).map((f) => (typeof f === "string" ? f : `${f.title || ""} ${f.detail || ""}`)),
  ];
  return parts.filter(Boolean).join(" ");
}

function readMinutes(content) {
  const words = allText(content).split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}

// A numbered block heading, matching the Stitch lesson layout.
function BlockHeading({ number, title, icon }) {
  return (
    <div className="flex items-center gap-space-xs">
      <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
        {icon ? (
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        ) : (
          <span className="font-label-lg text-label-lg">{number}</span>
        )}
      </div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">{title}</h3>
    </div>
  );
}

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [total, setTotal] = useState(0);
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
    const { count } = await supabase
      .from("user_lessons")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.user_id);
    setTotal(count || 0);

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
          to="/learn"
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
        >
          Back to lessons
        </Link>
      </div>
    );
  }
  if (!lesson) return <Loader text={writing ? "Writing your lesson..." : "Loading..."} />;

  const content = lesson.content || {};
  const introduction = content.introduction || content.intro || "";
  const objectives = content.objectives || [];
  const sections = content.sections || [];
  const examples = content.examples || [];
  const mistakes = content.common_mistakes || [];
  const keyPoints = content.key_points || content.key_takeaways || [];
  const practice = content.practice || [];
  const further = content.further_learning || [];
  const progress = total ? Math.round((lesson.position / total) * 100) : 0;

  // Section numbers run continuously through the whole lesson.
  let step = 0;
  const nextStep = () => pad(++step);

  return (
    <div className="flex flex-col w-full pb-24">
      <div className="flex items-center justify-between py-space-sm mb-space-sm">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">
          <span className="material-symbols-outlined text-[16px] text-secondary">explore</span>
          <span>Learning Path</span>
        </div>
        <div className="flex items-center gap-space-xs bg-surface-container px-3 py-1 rounded-full text-secondary font-label-md text-label-md">
          <span className="material-symbols-outlined text-[14px]">format_list_numbered</span>
          <span>Lesson {lesson.position} of {total || lesson.position}</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs mb-space-lg">
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-2.5 py-1 rounded-full uppercase tracking-wider">
            {lesson.specialization} • Module {lesson.position}
          </span>
          <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-2 py-1 rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">schedule</span> {readMinutes(content)} min read
          </span>
          <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-2 py-1 rounded-full flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">sentiment_satisfied</span> Beginner Friendly
          </span>
        </div>
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mt-1">{lesson.title}</h2>
        <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mt-1">
          <div className="bg-secondary h-full rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {objectives.length > 0 && (
        <section className="mb-space-lg rounded-2xl bg-surface-container-low p-space-md ring-1 ring-outline-variant/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">flag</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Learning objectives</h3>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
            By the end of this lesson you should be able to:
          </p>
          <ul className="flex flex-col gap-1.5">
            {objectives.map((objective) => (
              <li className="flex items-start gap-2" key={objective}>
                <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5 shrink-0">check_circle</span>
                <span className="font-body-md text-body-md text-on-surface">{objective}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {introduction && (
        <section className="mb-space-lg">
          <Markdown className="md-lesson text-on-surface-variant">{introduction}</Markdown>
        </section>
      )}

      {sections.map((section, index) => (
        <section className="flex flex-col gap-space-md mb-space-lg" key={section.heading || index}>
          <BlockHeading number={nextStep()} title={section.heading} />
          <div className="text-on-surface-variant">
            <Markdown>{section.body}</Markdown>
          </div>
        </section>
      ))}

      {examples.length > 0 && (
        <section className="flex flex-col gap-space-md mb-space-lg">
          <BlockHeading number={nextStep()} title="Worked examples" />
          <div className="flex flex-col gap-space-sm">
            {examples.map((example, index) => (
              <div className="rounded-xl bg-surface-container-low p-space-md" key={example.title || index}>
                <p className="font-label-lg text-label-lg font-bold text-on-surface mb-1.5">{example.title}</p>
                <Markdown>{example.body}</Markdown>
              </div>
            ))}
          </div>
        </section>
      )}

      {mistakes.length > 0 && (
        <section className="flex flex-col gap-space-md mb-space-lg">
          <BlockHeading number={nextStep()} title="Common mistakes" />
          <div className="flex flex-col gap-space-sm">
            {mistakes.map((item, index) => {
              const mistake = typeof item === "string" ? item : item.mistake;
              const fix = typeof item === "string" ? "" : item.fix;
              return (
                <div className="rounded-xl bg-surface-container-low p-space-sm" key={mistake || index}>
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-error mt-0.5 shrink-0">error</span>
                    <p className="font-body-md text-body-md text-on-surface font-semibold">{mistake}</p>
                  </div>
                  {fix && (
                    <div className="flex items-start gap-2 mt-1.5 pl-6">
                      <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5 shrink-0">lightbulb</span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{fix}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="relative w-full h-36 rounded-xl overflow-hidden flex items-end p-space-sm mb-space-lg bg-gradient-to-br from-secondary-container via-secondary to-primary-container">
        <span className="material-symbols-outlined absolute inset-0 m-auto w-fit h-fit text-[56px] text-white/25">
          auto_stories
        </span>
        <div className="absolute inset-0 bg-gradient-to-t from-primary-container/85 via-primary-container/30 to-transparent" />
        <div className="relative z-10 flex items-center justify-between w-full text-on-primary">
          <div>
            <p className="font-label-md text-label-md font-bold">{lesson.title}</p>
            <p className="font-body-sm text-body-sm text-inverse-primary">
              {lesson.specialization} · Lesson {lesson.position}
            </p>
          </div>
          <span className="material-symbols-outlined text-inverse-primary text-[20px]">verified</span>
        </div>
      </section>

      {keyPoints.length > 0 && (
        <section className="flex flex-col gap-space-md mb-space-lg">
          <BlockHeading number={nextStep()} title="Key takeaways" />
          <div className="bg-surface-container rounded-xl p-space-md flex flex-col gap-space-sm">
            {keyPoints.map((point, i) => (
              <div className="flex items-start gap-space-sm" key={i}>
                <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <span className="material-symbols-outlined text-[16px]">check</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface">{point}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {practice.length > 0 && (
        <section className="flex flex-col gap-space-md mb-space-lg">
          <BlockHeading number={nextStep()} title="Check your understanding" />
          <div className="flex flex-col gap-space-sm">
            {practice.map((item, index) => (
              <details className="rounded-xl bg-surface-container-low p-space-sm group" key={item.question || index}>
                <summary className="font-body-md text-body-md text-on-surface font-semibold cursor-pointer list-none flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-secondary mt-0.5 shrink-0">help</span>
                  <span className="flex-1">{item.question}</span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-open:rotate-180 transition-transform shrink-0">
                    expand_more
                  </span>
                </summary>
                {item.answer && (
                  <div className="mt-2 pl-7">
                    <Markdown className="text-on-surface-variant">{item.answer}</Markdown>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}

      {further.length > 0 && (
        <section className="flex flex-col gap-space-md mb-space-xl">
          <BlockHeading number={nextStep()} title="Further learning" />
          <ul className="flex flex-col gap-2">
            {further.map((item, index) => {
              const text = typeof item === "string" ? item : [item.title, item.detail].filter(Boolean).join(" — ");
              return (
                <li className="flex items-start gap-2" key={text || index}>
                  <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5 shrink-0">north_east</span>
                  <span className="font-body-md text-body-md text-on-surface-variant">{text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2 mb-space-md">
        This lesson was written by AI. Check important details with official sources or a qualified professional.
      </p>

      <div className="w-full flex flex-col gap-space-sm items-center pt-space-xs">
        <Link
          to={`/quiz/${lesson.id}`}
          className="w-full h-12 bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md transition-all active:scale-[0.98] hover:bg-secondary-container"
        >
          <span>Take the Quiz</span>
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </Link>
        <Link
          to="/coach"
          className="flex items-center justify-center gap-space-xs py-2 text-secondary font-label-md text-label-md transition-colors active:opacity-75"
        >
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          <span>Ask the AI Coach about this lesson</span>
        </Link>
      </div>
    </div>
  );
}
