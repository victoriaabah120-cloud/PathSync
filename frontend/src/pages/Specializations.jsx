import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { findField } from "../data/careers.js";

export default function Specializations() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const field = findField(fieldId);
  const [custom, setCustom] = useState("");

  if (!field) return <Navigate to="/categories" replace />;

  function pick(spec) {
    const params = new URLSearchParams({ field: field.name, spec });
    navigate(`/setup?${params.toString()}`);
  }

  return (
    <div className="stack">
      <Link to="/categories" className="back">Back</Link>
      <h1>{field.name}</h1>
      <p className="muted">
        {field.id === "other" ? "Type the career you want to learn." : "Which type do you want to learn?"}
      </p>

      {field.specializations.map((spec) => (
        <button key={spec} className="option" onClick={() => pick(spec)}>{spec}</button>
      ))}

      {field.id === "other" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) pick(custom.trim());
          }}
          className="stack"
        >
          <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="For example: Pharmacist" maxLength={100} />
          <button className="btn btn-primary btn-block" disabled={!custom.trim()}>Build my learning path</button>
        </form>
      )}
    </div>
  );
}