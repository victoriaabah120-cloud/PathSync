import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import Icon from "../components/Icon.jsx";
import Loader from "../components/Loader.jsx";

export default function Certificates() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState(null);

  useEffect(() => {
    supabase.from("certificates").select("*").eq("user_id", user.id).order("issued_at", { ascending: false })
      .then(({ data }) => setCertificates(data || []));
  }, [user.id]);

  if (certificates === null) return <Loader />;

  const best = certificates.reduce((top, c) => Math.max(top, c.score || 0), 0);

  return (
    <div className="stack" style={{ marginTop: -4 }}>
      <div>
        <span className="eyebrow">Achievements</span>
        <h1 style={{ margin: "6px 0 4px" }}>Your certificates</h1>
        <p className="lead" style={{ margin: 0 }}>
          {certificates.length === 0
            ? "Pass a lesson quiz to earn your first certificate."
            : `${certificates.length} earned${best ? ` · best score ${best}%` : ""}`}
        </p>
      </div>

      {certificates.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24 }}>
          <div className="brand-mark" style={{ margin: "0 auto 10px" }}>
            <Icon name="award" size={24} />
          </div>
          <h2 style={{ fontSize: "1.05rem" }}>No certificates yet</h2>
          <p className="muted small">Finish a lesson and pass its quiz to unlock one.</p>
          <Link to="/learn" className="btn btn-primary btn-block" style={{ marginTop: 6 }}>Go to lessons</Link>
        </div>
      ) : (
        certificates.map((c) => (
          <Link key={c.id} to={`/certificate/${c.id}`} className="card card-link" style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit" }}>
            <div className="metric-icon" style={{ flex: "none" }}>
              <Icon name="award" size={18} filled />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem" }}>{c.lesson_title}</p>
              <p className="muted small" style={{ margin: 0 }}>
                {c.specialization} · {new Date(c.issued_at).toLocaleDateString()}
              </p>
            </div>
            <span className="chip ok" style={{ margin: 0 }}>{c.score}%</span>
          </Link>
        ))
      )}

      <p className="muted small" style={{ marginTop: 8 }}>
        A PathSync certificate shows you finished a lesson and passed its quiz. It is not an accredited qualification.
      </p>
    </div>
  );
}
