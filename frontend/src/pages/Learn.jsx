import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import Loader from "../components/Loader.jsx";

const pad = (n) => String(n).padStart(2, "0");

export default function Learn() {
  const { user, profile } = useAuth();
  const [lessons, setLessons] = useState(null);

  useEffect(() => {
    supabase
      .from("user_lessons")
      .select("id,title,summary,position,status,score,completed_at")
      .eq("user_id", user.id)
      .order("position")
      .then(({ data }) => setLessons(data || []));
  }, [user.id]);

  if (lessons === null) return <Loader />;

  const completed = lessons.filter((l) => l.status === "completed").length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const current = lessons.find((l) => l.status === "current");
  const circumference = 2 * Math.PI * 20;

  return (
    <div className="flex flex-col w-full pb-6 space-y-5">
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-space-xs text-on-surface-variant min-w-0">
          <span className="material-symbols-outlined text-[18px]">engineering</span>
          <span className="font-label-md text-label-md uppercase tracking-wider">Career Roadmap</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="font-label-md text-label-md text-secondary font-semibold truncate">{profile.specialization}</span>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold shrink-0">
          <span className="material-symbols-outlined text-[13px] filled">verified</span>
          Learning Track
        </span>
      </div>

      <div className="space-y-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{profile.specialization} Path</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Finish each lesson and pass its quiz to unlock the next one.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-md p-space-md">
        <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-secondary/5 pointer-events-none" />
        <div className="flex items-start justify-between gap-space-md mb-3">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container text-secondary font-label-sm text-label-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              {current ? "Active Module" : "Path complete"}
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">
              {current ? current.title : "Every lesson complete"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
              {current ? current.summary : "Review any lesson, or start a new career from your profile."}
            </p>
          </div>
          <div className="relative flex items-center justify-center shrink-0 w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
              <circle className="text-surface-container" cx="24" cy="24" fill="transparent" r="20" stroke="currentColor" strokeWidth="4" />
              <circle
                className="text-secondary"
                cx="24"
                cy="24"
                fill="transparent"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (percent / 100) * circumference}
              />
            </svg>
            <span className="absolute font-label-md text-label-md font-bold text-on-surface">{percent}%</span>
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Progress</span>
            <span className="font-semibold text-secondary">
              {completed} of {lessons.length} Milestones Active
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full bg-secondary transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <div className="relative space-y-4 pt-1">
        {lessons.map((lesson) => {
          const isDone = lesson.status === "completed";
          const isCurrent = lesson.status === "current";
          const isLocked = lesson.status === "locked";
          const date = lesson.completed_at
            ? new Date(lesson.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "";

          return (
            <div className="relative flex items-start gap-3" key={lesson.id}>
              <div className="flex flex-col items-center self-stretch shrink-0 w-8">
                {isDone && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary-fixed text-secondary shadow-sm">
                    <span className="material-symbols-outlined text-[18px] filled">check_circle</span>
                  </div>
                )}
                {isCurrent && (
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-on-secondary shadow-md">
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    <span className="absolute -inset-1 rounded-full bg-secondary/20 animate-ping" />
                  </div>
                )}
                {isLocked && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px]">lock</span>
                  </div>
                )}
                <div className={`w-0.5 flex-1 my-1 ${isDone ? "bg-secondary/30" : "bg-surface-container-highest"}`} />
              </div>

              {isDone && (
                <Link to={`/lesson/${lesson.id}`} className="flex-1 rounded-2xl bg-surface-container-lowest shadow-sm p-space-md mb-2 transition-transform active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-label-sm text-label-sm text-secondary font-semibold">Lesson {pad(lesson.position)}</span>
                    <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[13px] text-secondary">event_available</span>
                      Completed on {date}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{lesson.title}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{lesson.summary}</p>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-surface-container">
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[16px]">menu_book</span>
                      <span>Lesson {lesson.position} of {lessons.length}</span>
                      <span className="mx-1">•</span>
                      <span className="material-symbols-outlined text-[16px]">quiz</span>
                      <span>{lesson.score}% Quiz</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-secondary font-semibold flex items-center gap-0.5">
                      Review <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </span>
                  </div>
                </Link>
              )}

              {isCurrent && (
                <div className="flex-1 rounded-2xl bg-surface-container-lowest shadow-md p-space-md mb-2 ring-2 ring-secondary/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-secondary-fixed/50 to-transparent pointer-events-none rounded-bl-3xl" />
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-sm text-label-sm text-secondary font-bold">Lesson {pad(lesson.position)}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
                        In Progress
                      </span>
                    </div>
                    <span className="font-label-sm text-label-sm text-secondary font-bold">{percent}% done</span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{lesson.title}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{lesson.summary}</p>
                  <div className="w-full h-1.5 rounded-full bg-surface-container my-3 overflow-hidden">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[16px]">menu_book</span>
                      <span>Module {lesson.position} of {lessons.length}</span>
                    </div>
                    <Link
                      to={`/lesson/${lesson.id}`}
                      className="inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg shadow-sm hover:bg-secondary-container active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">play_circle</span>
                      Resume Lesson
                    </Link>
                  </div>
                </div>
              )}

              {isLocked && (
                <div className="flex-1 rounded-2xl bg-surface-container-low/70 shadow-sm p-space-md mb-2 opacity-85">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Lesson {pad(lesson.position)}</span>
                    <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[12px]">lock_clock</span>
                      Unlocks after Lesson {lesson.position - 1}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{lesson.title}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{lesson.summary}</p>
                  <div className="flex items-center gap-2 mt-3 pt-2 text-on-surface-variant font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[15px]">timer</span>
                    <span>Pass Lesson {lesson.position - 1} to unlock</span>
                    <span className="mx-1">•</span>
                    <span>Includes AI-written lesson &amp; quiz</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
