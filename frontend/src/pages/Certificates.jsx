import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import Loader from "../components/Loader.jsx";

export default function Certificates() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState(null);

  useEffect(() => {
    supabase.from("certificates").select("*").eq("user_id", user.id).order("issued_at", { ascending: false })
      .then(({ data }) => setCertificates(data || []));
  }, [user.id]);

  if (certificates === null) return <Loader />;

  return (
    <div>
      <h1>Your certificates</h1>
      {certificates.length === 0 ? (
        <div className="card">
          <p>You have not earned a certificate yet. Pass a lesson quiz to earn your first one.</p>
          <Link to="/learn" className="btn btn-primary btn-block">Go to lessons</Link>
        </div>
      ) : (
        certificates.map((c) => (
          <Link key={c.id} to={`/certificate/${c.id}`} className="lesson-item completed">
            <div className="lesson-dot">{c.score}%</div>
            <div>
              <h3 style={{ marginBottom: 2 }}>{c.lesson_title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {c.specialization} - {new Date(c.issued_at).toLocaleDateString()}
              </p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
