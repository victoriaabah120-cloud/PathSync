import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import Loader from "../components/Loader.jsx";

export default function Certificates() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false })
      .then(({ data }) => setCertificates(data || []));
    supabase
      .from("user_lessons")
      .select("id,title,position,status")
      .eq("user_id", user.id)
      .order("position")
      .then(({ data }) => setLessons(data || []));
  }, [user.id]);

  const groups = useMemo(() => {
    const map = new Map();
    (certificates || []).forEach((c) => {
      map.set(c.specialization, (map.get(c.specialization) || 0) + 1);
    });
    return [...map.entries()];
  }, [certificates]);

  if (certificates === null) return <Loader />;

  const completed = lessons.filter((l) => l.status === "completed").length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const current = lessons.find((l) => l.status === "current");
  const nextLocked = lessons.find((l) => l.status === "locked");
  const lessonsAway = nextLocked ? nextLocked.position - completed : 0;
  const shown = filter === "all" ? certificates : certificates.filter((c) => c.specialization === filter);

  return (
    <div className="flex flex-col w-full pb-8 space-y-space-md">
      <div className="flex flex-col space-y-space-xs pt-space-xs">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 text-secondary font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-[14px] filled">workspace_premium</span>
            Verified Credentials
          </span>
          <button
            type="button"
            aria-label="Share certificates"
            onClick={async () => {
              const url = `${window.location.origin}/certificates`;
              try {
                if (navigator.share) await navigator.share({ title: "My PathSync certificates", url });
                else await navigator.clipboard.writeText(url);
              } catch {
                /* the user cancelled the share sheet */
              }
            }}
            className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
          </button>
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface tracking-tight">
          My Certificates &amp; Progress
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Track your career milestones and verified achievements.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-space-md shadow-sm">
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-secondary/5 blur-2xl pointer-events-none" />
        <div className="flex items-start justify-between gap-space-sm mb-space-sm relative z-10">
          <div className="min-w-0">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Current Track</p>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-1.5 mt-0.5 truncate">
              {profile.specialization}
              <span className="w-2 h-2 rounded-full bg-secondary inline-block shrink-0" />
            </h2>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-low text-secondary font-label-md text-label-md shrink-0">
            <span className="material-symbols-outlined text-[16px]">trending_up</span>
            {percent}% Done
          </div>
        </div>
        <div className="w-full h-2.5 rounded-full bg-surface-container overflow-hidden mb-space-md">
          <div className="h-full rounded-full bg-secondary transition-all duration-700 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-space-xs pt-space-xs">
          <div className="flex flex-col items-center justify-center p-space-sm rounded-xl bg-surface-container-low text-center">
            <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-1">
              <span className="material-symbols-outlined text-[16px] filled">verified</span>
            </div>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{certificates.length}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Earned</span>
          </div>
          <div className="flex flex-col items-center justify-center p-space-sm rounded-xl bg-surface-container-low text-center">
            <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-1">
              <span className="material-symbols-outlined text-[16px]">pending</span>
            </div>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{current ? 1 : 0}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">In Progress</span>
          </div>
          <div className="flex flex-col items-center justify-center p-space-sm rounded-xl bg-surface-container-low text-center">
            <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center text-secondary mb-1">
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
            </div>
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{lessons.length}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">Lessons</span>
          </div>
        </div>
      </div>

      {certificates.length > 0 && (
        <div className="flex items-center gap-space-xs overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-all ${
              filter === "all" ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span>All Certificates</span>
            <span
              className={`w-5 h-5 rounded-full text-label-sm font-label-sm flex items-center justify-center ${
                filter === "all" ? "bg-white/20 text-on-secondary" : "bg-surface-container-highest text-on-surface"
              }`}
            >
              {certificates.length}
            </span>
          </button>
          {groups.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setFilter(name)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full font-label-md text-label-md whitespace-nowrap transition-all ${
                filter === name ? "bg-secondary text-on-secondary shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span>{name}</span>
              <span
                className={`w-5 h-5 rounded-full text-label-sm font-label-sm flex items-center justify-center ${
                  filter === name ? "bg-white/20 text-on-secondary" : "bg-surface-container-highest text-on-surface"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-space-xl text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-secondary mb-space-sm">
            <span className="material-symbols-outlined text-[32px]">workspace_premium</span>
          </div>
          <p className="font-headline-sm text-headline-sm text-on-surface font-bold">No certificates yet</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-xs">
            Finish a lesson and pass its quiz to earn your first verified certificate.
          </p>
          <Link
            to="/learn"
            className="mt-space-md px-space-md py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-label-md shadow-sm"
          >
            Go to lessons
          </Link>
        </div>
      ) : (
        <div className="space-y-space-md">
          {shown.map((cert) => (
            <div key={cert.id} className="flex flex-col rounded-2xl bg-surface-container-lowest overflow-hidden shadow-sm transition-all hover:shadow-md">
              <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-secondary-container via-secondary to-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[52px] text-white/25 filled">workspace_premium</span>
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/30 to-transparent" />
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md shadow-sm">
                  <span className="material-symbols-outlined text-[14px] text-secondary filled">check_circle</span>
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface">Verified</span>
                </div>
                <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-center shadow-sm text-secondary">
                  <span className="material-symbols-outlined text-[18px]">verified_user</span>
                </div>
              </div>
              <div className="p-space-md -mt-2 relative z-10 flex flex-col space-y-space-sm">
                <div>
                  <span className="font-label-sm text-label-sm text-secondary font-semibold uppercase tracking-wider">
                    {cert.specialization} • Final assessment {cert.score}%
                  </span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-0.5">{cert.course_title}</h3>
                </div>
                <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-1 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
                    <span className="truncate">
                      Issued{" "}
                      {new Date(cert.issued_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant/80 shrink-0">ID: {cert.certificate_code}</span>
                </div>
                <div className="grid grid-cols-2 gap-space-xs pt-space-xs">
                  <Link
                    to={`/certificate/${cert.id}`}
                    className="flex items-center justify-center gap-1.5 h-12 px-3 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg active:scale-98 transition-transform shadow-sm hover:opacity-95"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    <span>View Card</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => navigate(`/certificate/${cert.id}?print=1`)}
                    className="flex items-center justify-center gap-1.5 h-12 px-3 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg hover:bg-surface-container-high active:scale-98 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextLocked && (
        <div className="rounded-2xl bg-surface-container-low p-space-md relative overflow-hidden">
          <div className="flex items-start gap-space-sm">
            <div className="w-11 h-11 rounded-xl bg-surface-container-highest flex-shrink-0 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[22px]">lock</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  Next Milestone
                </span>
                <span className="font-label-sm text-label-sm text-error font-medium">
                  Locked • {lessonsAway} {lessonsAway === 1 ? "lesson" : "lessons"} away
                </span>
              </div>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface mt-1 truncate">{nextLocked.title}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Complete the lessons before it to unlock this module and its certificate.
              </p>
              <div className="flex items-center gap-2 mt-space-sm pt-1">
                <div className="flex-1 bg-surface-container-highest h-2 rounded-full overflow-hidden">
                  <div className="bg-secondary/60 h-full rounded-full" style={{ width: `${percent}%` }} />
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                  {completed}/{lessons.length} Done
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
