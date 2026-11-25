import { useNavigate } from "react-router-dom";

export default function CareerIntent() {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <div className="wordmark">PathSync<span>.</span></div>
      <h1>Do you have a career in mind?</h1>
      <p className="muted">Either answer is fine. We will build your learning path from here.</p>

      <button className="tile" onClick={() => navigate("/categories")}>
        <strong>Yes, I know my career</strong>
        <span>Choose your field and the type of work you want to learn.</span>
      </button>
      <button className="tile" onClick={() => navigate("/assessment")}>
        <strong>Not yet, help me find one</strong>
        <span>Answer a few short questions and get career suggestions.</span>
      </button>
    </div>
  );
}