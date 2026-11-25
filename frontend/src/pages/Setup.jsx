import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generatePath } from "../services/api.js";
import { supabase } from "../services/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";
import Icon from "../components/Icon.jsx";
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
      <div className="stack" style={{ marginTop: 8 }}>
        <div className="brand-mark" style={{ margin: "0 0 6px", background: "var(--bad-soft)", color: "var(--bad)" }}>
          <Icon name="refresh" size={24} />
        </div>
        <h1 style={{ margin: 0 }}>That did not work</h1>
        <div className="error" role="alert">{error}</div>
        <button className="btn btn-primary btn-block" onClick={build}>Try again</button>
        <button className="btn btn-ghost btn-block" onClick={() => navigate("/intent")}>Choose a different career</button>
      </div>
    );
  }
  return <Loader text={`Building your ${spec} learning path...`} />;
}
