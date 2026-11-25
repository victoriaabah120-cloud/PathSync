import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
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
      <div className="stack">
        <Link to="/certificates" className="back">Back</Link>
        <div className="error" role="alert">{error}</div>
      </div>
    );
  }
  if (!certificate) return <Loader />;

  const date = new Date(certificate.issued_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="stack">
      <Link to="/certificates" className="back no-print">Back to certificates</Link>

      <div className="certificate">
        <p className="muted small" style={{ margin: 0 }}>PathSync</p>
        <h2>Certificate of Completion</h2>
        <p className="muted">This certifies that</p>
        <div className="holder">{certificate.holder_name}</div>
        <p className="muted">has completed the lesson</p>
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

      <button className="btn btn-primary btn-block no-print" onClick={() => window.print()}>Download as PDF</button>
      <p className="muted small no-print">In the print window, choose "Save as PDF" as the destination.</p>
    </div>
  );
}