import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FIELDS } from "../data/careers.js";
import Icon from "../components/Icon.jsx";

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
    <div className="stack" style={{ marginTop: -4 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Choose a career field</h1>
        <p className="lead" style={{ margin: 0 }}>Pick the area you want to learn in. You can search for a specific role.</p>
      </div>

      <div className="input-wrap">
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="Search, for example: nursing"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search careers"
        />
      </div>

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
