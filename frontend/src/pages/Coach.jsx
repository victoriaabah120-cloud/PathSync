import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { coachChat } from "../services/api.js";

const SUGGESTIONS = [
  { text: "Explain my current lesson in simpler words", icon: "menu_book" },
  { text: "Give me a practice exercise", icon: "quiz" },
  { text: "What should I learn next?", icon: "explore" },
];

function clock(date) {
  return new Date(date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

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
    const history = [...messages, { role: "user", content, at: new Date().toISOString() }];
    setMessages(history);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const { reply } = await coachChat(
        profile.career_field,
        profile.specialization,
        currentLesson,
        history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
      );
      setMessages([...history, { role: "assistant", content: reply, at: new Date().toISOString() }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const firstName = (profile.full_name || user.email.split("@")[0]).split(" ")[0];

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      <div className="w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-on-secondary text-[24px] filled">auto_awesome</span>
            </div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-secondary-container ring-2 ring-surface-container-lowest flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-on-secondary animate-pulse" />
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-space-xs">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">PathSync AI Coach</h2>
              <span className="px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">Active</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
              Friendly, personalized tutoring for your career questions
            </p>
          </div>
        </div>
        <Link
          to="/learn"
          aria-label="Learning focus"
          className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">school</span>
        </Link>
      </div>

      {currentLesson && (
        <div className="w-full bg-secondary-fixed/50 rounded-xl px-space-md py-2.5 flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs min-w-0">
            <span className="material-symbols-outlined text-secondary text-[18px]">menu_book</span>
            <span className="font-label-sm text-label-sm text-on-secondary-fixed font-semibold truncate">{currentLesson}</span>
          </div>
          <span className="font-label-sm text-label-sm text-secondary font-bold flex-shrink-0">In Progress</span>
        </div>
      )}

      <div className="flex flex-col space-y-3.5">
        {messages.length === 0 && (
          <div className="flex items-start gap-space-sm max-w-[90%]">
            <div className="w-7 h-7 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-on-secondary shadow-sm mt-1">
              <span className="material-symbols-outlined text-[15px] filled">auto_awesome</span>
            </div>
            <div className="flex flex-col space-y-1">
              <div className="bg-surface-container-lowest p-space-md rounded-2xl rounded-tl-sm shadow-sm text-on-surface">
                <p className="font-body-md text-body-md leading-relaxed">
                  Hello {firstName}! I can help with{" "}
                  <span className="font-semibold text-secondary">{profile.specialization}</span>
                  {currentLesson ? <> while you work through {currentLesson}</> : null}. What would you like to understand better?
                </p>
              </div>
              <span className="font-label-sm text-label-sm text-outline px-1">PathSync Coach</span>
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div className="flex items-start gap-space-sm max-w-[92%]" key={i}>
              <div className="w-7 h-7 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-on-secondary shadow-sm mt-1">
                <span className="material-symbols-outlined text-[15px] filled">auto_awesome</span>
              </div>
              <div className="flex flex-col space-y-1 min-w-0">
                <div className="bg-surface-container-lowest p-space-md rounded-2xl rounded-tl-sm shadow-sm text-on-surface">
                  <p className="font-body-md text-body-md leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <span className="font-label-sm text-label-sm text-outline px-1">
                  {clock(m.at)} · PathSync Coach
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-end gap-space-sm max-w-[90%] self-end" key={i}>
              <div className="flex flex-col items-end space-y-1 min-w-0">
                <div className="bg-secondary p-space-md rounded-2xl rounded-tr-sm shadow-sm text-on-secondary">
                  <p className="font-body-md text-body-md leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <div className="flex items-center gap-1 px-1">
                  <span className="font-label-sm text-label-sm text-outline">{clock(m.at)}</span>
                  <span className="material-symbols-outlined text-secondary text-[14px]">done_all</span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-on-primary shadow-sm mt-1">
                <span className="material-symbols-outlined text-[15px]">person</span>
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-start gap-space-sm max-w-[90%]">
            <div className="w-7 h-7 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-on-secondary shadow-sm mt-1">
              <span className="material-symbols-outlined text-[15px] filled">auto_awesome</span>
            </div>
            <div className="bg-surface-container-lowest p-space-md rounded-2xl rounded-tl-sm shadow-sm text-on-surface-variant">
              <p className="font-body-md text-body-md leading-relaxed">Thinking...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2" role="alert">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length === 0 && (
        <div className="flex flex-col gap-space-sm pt-1">
          <p className="font-label-md text-label-md text-on-surface-variant px-1 font-semibold">Suggested questions</p>
          {SUGGESTIONS.map((item) => (
            <button
              key={item.text}
              type="button"
              onClick={() => send(item.text)}
              className="w-full text-left bg-surface-container-lowest hover:bg-surface-container-low transition-colors p-space-sm rounded-xl shadow-sm flex items-center justify-between group"
            >
              <div className="flex items-center gap-space-sm min-w-0">
                <span className="material-symbols-outlined text-secondary text-[18px] flex-shrink-0 group-hover:scale-110 transition-transform">
                  {item.icon}
                </span>
                <span className="font-label-md text-label-md text-on-surface truncate">{item.text}</span>
              </div>
              <span className="material-symbols-outlined text-outline text-[16px]">arrow_outward</span>
            </button>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-20 pt-2 pb-1 bg-gradient-to-t from-surface via-surface to-transparent mt-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="bg-surface-container-lowest rounded-2xl p-1.5 shadow-lg flex items-center gap-space-xs"
        >
          <input
            className="flex-1 bg-transparent border-0 outline-none px-2 text-on-surface placeholder:text-outline font-body-md text-body-md min-w-0 focus:outline-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your AI Coach anything..."
            maxLength={1000}
            aria-label="Message"
          />
          <button
            type="submit"
            aria-label="Send query"
            disabled={busy || !input.trim()}
            className="w-10 h-10 rounded-xl bg-secondary hover:bg-secondary-container disabled:opacity-50 active:scale-95 text-on-secondary flex items-center justify-center shadow-md transition-all flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px] filled">send</span>
          </button>
        </form>
        <div className="flex items-center justify-center gap-1 mt-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
          <span className="font-label-sm text-label-sm text-outline">PathSync AI Coach · Press enter to ask</span>
        </div>
      </div>
    </div>
  );
}
