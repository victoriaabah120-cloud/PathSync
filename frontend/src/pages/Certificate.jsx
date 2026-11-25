import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import Icon from "../components/Icon.jsx";
import Loader from "../components/Loader.jsx";

export default function Certificate() {
  const { id } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("certificates").select("*").eq("id", id).single().then(({ data, error: loadError }) => {
      if (loadError || !data) setError("We could not find this certificate.");
      else setCertificate(data);
    });
  }, [id]);

  if (error) {
    return (
      <div className="stack" style={{ marginTop: 8 }}>
        <div className="error" role="alert">{error}</div>
        <Link to="/certificates" className="btn btn-ghost btn-block">Back to certificates</Link>
      </div>
    );
  }
  if (!certificate) return <Loader />;

  const date = new Date(certificate.issued_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="stack" style={{ marginTop: -4 }}>
      <div className="certificate">
        <div className="brand-mark" style={{ margin: "0 auto 8px" }}>
          <Icon name="award" size={24} filled />
        </div>
        <p className="muted small" style={{ margin: 0, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>PathSync</p>
        <h2 style={{ margin: "4px 0 8px" }}>Certificate of Completion</h2>
        <p className="muted small" style={{ margin: 0 }}>This certifies that</p>
        <div className="holder">{certificate.holder_name}</div>
        <p className="muted small" style={{ margin: 0 }}>has completed the lesson</p>
        <div className="lesson">
          {certificate.lesson_title}
          <div className="muted small" style={{ fontWeight: 400 }}>{certificate.specialization}</div>
        </div>
        <div className="meta">
          <div><span className="muted">Date</span><strong>{date}</strong></div>
          <div><span className="muted">Quiz score</span><strong>{certificate.score}%</strong></div>
          <div><span className="muted">Certificate ID</span><strong>{certificate.certificate_code}</strong></div>
        </div>
      </div>

      <p className="muted small">
        A PathSync certificate of completion shows you finished a lesson and passed its quiz. It is not an accredited qualification.
      </p>

      <button className="btn btn-primary btn-block no-print" onClick={() => window.print()}>
        <Icon name="download" size={18} />
        Download as PDF
      </button>
      <p className="muted small no-print" style={{ textAlign: "center" }}>In the print window, choose "Save as PDF" as the destination.</p>
    </div>
  );
}
