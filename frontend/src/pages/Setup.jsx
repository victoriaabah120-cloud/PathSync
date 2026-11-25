import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generatePath } from "../services/api.js";
import { supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";
import Loader from "../components/Loader.jsx";

// Builds the learning path for the chosen career, saves it, then opens the home screen.
export default function Setup() {
  const [params] = useSearchParams();
  const field = params.get("field");
  const spec = params.get("spec");
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  async function build() {
    setError("");
    try {
      const { lessons } = await generatePath(field, spec);

      // Replace any older path. Certificates you already earned are kept.
      await supabase.from("user_lessons").delete().eq("user_id", user.id);

      const rows = lessons.map((lesson, i) => ({
        user_id: user.id,
        career_field: field,
        specialization: spec,
        position: i + 1,
        title: lesson.title,
        summary: lesson.summary || "",
        status: i === 0 ? "current" : "locked",
      }));
      const { error: insertError } = await supabase.from("user_lessons").insert(rows);
      if (insertError) throw insertError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ career_field: field, specialization: spec })
        .eq("id", user.id);
      if (profileError) throw profileError;

      await refreshProfile();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err.message || "We could not build your learning path.");
    }
  }

  useEffect(() => {
    if (!field || !spec) {
      navigate("/intent", { replace: true });
      return;
    }
    if (started.current) return; // React StrictMode runs effects twice in development
    started.current = true;
    build();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col w-full gap-space-md pt-6">
        <div className="w-12 h-12 rounded-2xl bg-error-container text-error flex items-center justify-center">
          <span className="material-symbols-outlined text-[26px]">error</span>
        </div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">That did not work</h1>
        <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2" role="alert">
          {error}
        </div>
        <button
          type="button"
          onClick={build}
          className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-md"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => navigate("/intent")}
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold"
        >
          Choose a different career
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-space-md pt-16">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary-fixed text-secondary">
        <span className="material-symbols-outlined text-[30px] filled">auto_awesome</span>
        <span className="absolute -inset-1 rounded-2xl bg-secondary/10 animate-ping" />
      </div>
      <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold text-center">
        Building your {spec} path
      </h1>
      <Loader text="Writing six lessons with your AI mentor..." />
    </div>
  );
}
