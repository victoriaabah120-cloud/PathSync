import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";

export default function CareerIntent() {
  const navigate = useNavigate();
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <div>
        <span className="eyebrow">Let us begin</span>
        <h1 style={{ margin: "6px 0 6px" }}>Do you have a career in mind?</h1>
        <p className="lead" style={{ margin: 0 }}>Either answer is fine. We will build your learning path from here.</p>
      </div>

      <button className="tile" onClick={() => navigate("/categories")} style={{ padding: 18 }}>
        <div className="tile-icon"><Icon name="school" size={20} filled /></div>
        <strong>Yes, I know my career</strong>
        <span>Choose your field and the type of work you want to learn.</span>
      </button>

      <button className="tile" onClick={() => navigate("/assessment")} style={{ padding: 18 }}>
        <div className="tile-icon"><Icon name="insights" size={20} filled /></div>
        <strong>Not yet, help me find one</strong>
        <span>Answer a few short questions and get career suggestions.</span>
      </button>

      <div className="card-tint" style={{ borderRadius: 16, padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon name="sparkle" size={18} filled />
        <p className="small" style={{ margin: 0, color: "var(--violet-dark)" }}>
          You can change your career later from your profile. Certificates you earn are always kept.
        </p>
      </div>
    </div>
  );
}
