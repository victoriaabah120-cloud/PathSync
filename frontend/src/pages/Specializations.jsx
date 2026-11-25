import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { findField } from "../data/careers.js";
import Icon from "../components/Icon.jsx";

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
    <div className="stack" style={{ marginTop: -4 }}>
      <div>
        <span className="eyebrow">{field.name}</span>
        <h1 style={{ margin: "6px 0 4px" }}>
          {field.id === "other" ? "Name your career" : "Pick your specialisation"}
        </h1>
        <p className="lead" style={{ margin: 0 }}>
          {field.id === "other"
            ? "Type the career you want to learn."
            : "Which type of work do you want to learn? Each one builds its own path."}
        </p>
      </div>

      {field.id !== "other" && (
        <div>
          {field.specializations.map((spec) => (
            <button key={spec} className="option" onClick={() => pick(spec)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span>{spec}</span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      )}

      {field.id === "other" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) pick(custom.trim());
          }}
          className="stack"
        >
          <div className="input-wrap">
            <Icon name="book" size={20} />
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="For example: Pharmacist"
              maxLength={100}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={!custom.trim()}>
            Build my learning path
            <Icon name="forward" size={18} />
          </button>
        </form>
      )}
    </div>
  );
}
