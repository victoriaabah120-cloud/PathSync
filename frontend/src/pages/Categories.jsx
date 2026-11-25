import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FIELDS } from "../data/careers.js";

export default function Categories() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!text) return [];
    return FIELDS.flatMap((field) =>
      field.specializations
        .filter((spec) => spec.toLowerCase().includes(text) || field.name.toLowerCase().includes(text))
        .map((spec) => ({ field: field.name, spec }))
    );
  }, [text]);

  function pick(field, spec) {
    const params = new URLSearchParams({ field, spec });
    navigate(`/setup?${params.toString()}`);
  }

  return (
    <div className="stack">
      <Link to="/intent" className="back">Back</Link>
      <h1>Choose a career field</h1>
      <input
        type="text"
        placeholder="Search, for example: nursing"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search careers"
      />

      {text ? (
        <div>
          {matches.map((match) => (
            <button key={`${match.field}-${match.spec}`} className="option" onClick={() => pick(match.field, match.spec)}>
              <strong>{match.spec}</strong> <span className="muted">in {match.field}</span>
            </button>
          ))}
          <button className="option" onClick={() => pick("Other", query.trim())}>
            Use "<strong>{query.trim()}</strong>" as my career
          </button>
        </div>
      ) : (
        <div className="grid-2">
          {FIELDS.map((field) => (
            <button key={field.id} className="tile" onClick={() => navigate(`/specializations/${field.id}`)}>
              <strong>{field.name}</strong>
              <span>{field.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}