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

// Consecutive days of study, counted back from the most recent completed lesson.
function studyStreak(lessons) {
  const days = lessons
    .filter((l) => l.completed_at)
    .map((l) => new Date(l.completed_at).toDateString());
  if (days.length === 0) return 0;
  const unique = [...new Set(days)].map((d) => new Date(d));
  unique.sort((a, b) => b - a);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const gap = Math.round((startOfToday - new Date(unique[0].getFullYear(), unique[0].getMonth(), unique[0].getDate())) / 86400000);
  if (gap > 1) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    const diff = Math.round((unique[i - 1] - unique[i]) / 86400000);
    if (diff === 1) streak += 1;
    else break;
  }
  return streak;
}

export default function Home() {
  const { user, profile } = useAuth();
  const [lessons, setLessons] = useState(null);
  const [certificateCount, setCertificateCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_lessons")
        .select("id,title,summary,position,status,score,completed_at")
        .eq("user_id", user.id)
        .order("position");
      setLessons(data || []);
      const { count } = await supabase
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setCertificateCount(count || 0);
    }
    load();
  }, [user.id]);

  if (lessons === null) return <Loader />;

  const firstName = (profile?.full_name || user.email.split("@")[0]).split(" ")[0];
  const completed = lessons.filter((l) => l.status === "completed").length;
  const current = lessons.find((l) => l.status === "current");
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const streak = studyStreak(lessons);

  // Today's focus: the lesson in progress and the two that follow it.
  const focusStart = current ? lessons.findIndex((l) => l.id === current.id) : lessons.length - 1;
  const focus = lessons.slice(Math.max(focusStart, 0), Math.max(focusStart, 0) + 3);
  const focusDone = focus.filter((l) => l.status === "completed").length;

  return (
    <div className="flex flex-col w-full gap-space-lg">
      {/* 1. Warm Hero Greeting */}
      <section className="flex flex-col gap-space-xs pt-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-label-md text-secondary uppercase tracking-wider font-semibold">Daily Sync</span>
          <div className="flex items-center gap-1 bg-surface-container-high px-space-sm py-0.5 rounded-full text-on-surface">
            <span className="material-symbols-outlined text-secondary text-[16px] filled">local_fire_department</span>
            <span className="font-label-sm text-label-sm font-bold">
              {streak} {streak === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold tracking-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Ready to make progress in {profile.specialization} today?
        </p>
      </section>

      {/* 2. Quote of the Day Card */}
      <section className="relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm p-space-md">
        <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-secondary-fixed/30 pointer-events-none blur-xl" />
        <div className="flex items-start gap-space-md relative z-10">
          <div className="w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-secondary text-[22px] filled">format_quote</span>
          </div>
          <div className="flex flex-col gap-space-xs">
            <p className="font-body-md text-body-md text-on-surface font-medium italic leading-relaxed">
              “{quoteOfTheDay()}”
            </p>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold tracking-wide">
              — PathSync daily sync
            </span>
          </div>
        </div>
      </section>

      {/* 3. Current Lesson Card */}
      {current ? (
        <section className="rounded-2xl bg-surface-container-lowest shadow-sm overflow-hidden flex flex-col">
          <div className="relative w-full h-36 bg-surface-container overflow-hidden bg-gradient-to-br from-secondary-container via-secondary to-primary-container">
            <span className="material-symbols-outlined absolute inset-0 m-auto w-fit h-fit text-[64px] text-white/25">menu_book</span>
            <div className="absolute inset-0 bg-gradient-to-t from-on-surface/90 via-on-surface/40 to-transparent flex flex-col justify-end p-space-md">
              <span className="inline-flex self-start items-center px-space-sm py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm font-bold tracking-wider uppercase mb-1">
                Current Lesson • Module {current.position}
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-secondary font-bold truncate">{current.title}</h2>
            </div>
          </div>
          <div className="p-space-md flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant">{profile.specialization} Fundamentals</span>
              <span className="font-label-md text-label-md text-secondary font-bold">{percent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
              <div className="h-full bg-secondary rounded-full transition-all duration-500 ease-out" style={{ width: `${percent}%` }} />
            </div>
            <Link
              to={`/lesson/${current.id}`}
              className="w-full h-12 bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-space-xs shadow-md shadow-secondary/20 active:scale-[0.98] transition-transform"
            >
              <span>Continue Lesson</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-surface-container-lowest shadow-sm p-space-md flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Every lesson complete</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            You finished this path. Open your certificates, or start a new career from your profile.
          </p>
          <Link
            to="/certificates"
            className="w-full h-12 bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-space-xs shadow-md active:scale-[0.98] transition-transform"
          >
            <span>See your certificates</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </section>
      )}

      {/* 4. Today's Tasks */}
      {focus.length > 0 && (
        <section className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Today's Focus</h3>
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
              {focusDone} of {focus.length} complete
            </span>
          </div>
          <div className="flex flex-col gap-space-xs">
            {focus.map((lesson) => {
              const done = lesson.status === "completed";
              const locked = lesson.status === "locked";
              const inner = (
                <>
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      done ? "bg-secondary text-on-secondary" : "bg-surface-container text-transparent"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-body-md text-body-md select-none truncate ${
                        done ? "text-on-surface-variant line-through" : "text-on-surface font-medium"
                      }`}
                    >
                      {lesson.title}
                    </p>
                  </div>
                  {done ? (
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 filled">verified</span>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold">
                      Lesson {lesson.position}
                    </span>
                  )}
                </>
              );
              const shell = "group w-full p-space-md rounded-2xl bg-surface-container-lowest shadow-sm flex items-center gap-space-md transition-all";
              return locked ? (
                <div key={lesson.id} className={`${shell} opacity-60`}>{inner}</div>
              ) : (
                <Link key={lesson.id} to={`/lesson/${lesson.id}`} className={`${shell} active:scale-[0.99] cursor-pointer`}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Quick Stats */}
      <section className="flex flex-col gap-space-xs">
        <span className="font-label-md text-label-md text-on-surface-variant px-0.5 font-semibold">Your Milestones</span>
        <div className="grid grid-cols-2 gap-space-md">
          <div className="p-space-md rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
            <div className="w-8 h-8 rounded-xl bg-secondary-fixed flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px] filled">bolt</span>
            </div>
            <div className="flex flex-col mt-space-xs">
              <span className="font-headline-lg-mobile text-headline-lg-mobile font-extrabold text-on-surface tracking-tight">
                {streak} {streak === 1 ? "Day" : "Days"}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Study Streak</span>
            </div>
          </div>
          <div className="p-space-md rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
            <div className="w-8 h-8 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined text-[20px] filled">workspace_premium</span>
            </div>
            <div className="flex flex-col mt-space-xs">
              <span className="font-headline-lg-mobile text-headline-lg-mobile font-extrabold text-on-surface tracking-tight">
                {certificateCount} Earned
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Certificates</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Mentor Note */}
      <section className="p-space-md rounded-2xl bg-surface-container-low flex items-center gap-space-md mb-space-sm">
        <Link to="/coach" className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-secondary to-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px] text-white filled">auto_awesome</span>
          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary ring-2 ring-surface-container-low" />
        </Link>
        <Link to="/coach" className="flex flex-col min-w-0">
          <span className="font-label-md text-label-md font-bold text-on-surface truncate">Coach Maya is online</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
            Ready to review your {profile.specialization} lessons whenever you are.
          </p>
        </Link>
      </section>
    </div>
  );
}
