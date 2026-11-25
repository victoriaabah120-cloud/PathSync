import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { coachChat } from "../services/api.js";

const SUGGESTIONS = [
  "Explain my current lesson in simpler words",
  "Give me a practice exercise",
  "What should I learn next?",
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
    <div>
      <h1>AI Coach</h1>
      <p className="muted">Ask anything about {profile.specialization}. The coach is an AI, so double-check important facts.</p>

      {messages.length === 0 && (
        <div className="stack">
          {SUGGESTIONS.map((text) => (
            <button key={text} className="option" onClick={() => send(text)}>{text}</button>
          ))}
        </div>
      )}

      <div className="chat">
        {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        {busy && <div className="bubble assistant muted">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach..." maxLength={1000} aria-label="Message" />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}