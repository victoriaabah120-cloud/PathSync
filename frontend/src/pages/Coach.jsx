import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { coachChat } from "../services/api.js";
import Icon from "../components/Icon.jsx";

const SUGGESTIONS = [
  { text: "Explain my current lesson in simpler words", icon: "book" },
  { text: "Give me a practice exercise", icon: "quiz" },
  { text: "What should I learn next?", icon: "explore" },
];

export default function Coach() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currentLesson, setCurrentLesson] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    supabase.from("user_lessons").select("title").eq("user_id", user.id).eq("status", "current").maybeSingle()
      .then(({ data }) => setCurrentLesson(data?.title || ""));
  }, [user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const { reply } = await coachChat(profile.career_field, profile.specialization, currentLesson, history.slice(-12));
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: -4, display: "flex", flexDirection: "column", minHeight: "calc(100vh - 190px)" }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="avatar" style={{ background: "var(--violet)", color: "#fff" }}>
            <Icon name="sparkle" size={18} filled />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem" }}>AI Coach</h1>
            <p className="muted small" style={{ margin: 0 }}>{profile.specialization}</p>
          </div>
        </div>
        <span className="chip ok" style={{ margin: 0 }}>Online</span>
      </div>

      {messages.length === 0 && (
        <div className="stack" style={{ marginBottom: 14 }}>
          <p className="lead" style={{ margin: 0 }}>
            Ask anything about {profile.specialization}. The coach is an AI, so double-check important facts.
          </p>
          {SUGGESTIONS.map((item) => (
            <button
              key={item.text}
              className="card card-link"
              onClick={() => send(item.text)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, textAlign: "left", font: "inherit" }}
            >
              <div className="tile-icon" style={{ margin: 0, width: 32, height: 32, flex: "none" }}>
                <Icon name={item.icon} size={17} />
              </div>
              <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600 }}>{item.text}</span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      )}

      <div className="chat" style={{ flex: 1 }}>
        {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        {busy && <div className="bubble assistant muted">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="chat-dock">
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach..." maxLength={1000} aria-label="Message" />
          <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Send message">
            <Icon name="send" size={18} filled />
          </button>
        </form>
      </div>
    </div>
  );
}
