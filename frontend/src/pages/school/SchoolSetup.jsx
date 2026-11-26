import { useEffect, useState } from "react";
import { createSession, createTerm, listSessions } from "../../services/schoolApi.js";

/**
 * First-run setup for a brand-new school.
 *
 * The academic endpoints refuse to work until the school has a current session and a
 * term in it, which is correct, but a freshly registered school used to meet that rule
 * as a dead-end "Create an academic session first." error on its own dashboard. This
 * panel asks for the two records the rest of the module needs and nothing else.
 *
 * Dates are deliberately not part of setup: a school registering mid-year cannot know
 * when its session or term ends, and the database keeps both date columns nullable for
 * exactly that case. Calendar dates remain available later in Manage for any school
 * that wants them.
 */
const TERM_CHOICES = [
  { name: "First Term", position: 1 },
  { name: "Second Term", position: 2 },
  { name: "Third Term", position: 3 },
];

function schoolYearLabel() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${start + 1}`;
}

const fieldClass =
  "w-full h-11 rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface ring-1 ring-outline-variant/60 focus:outline-none focus:ring-2 focus:ring-secondary";
const labelClass = "font-label-md text-label-md text-on-surface-variant";

export default function SchoolSetup({ onDone }) {
  const [existing, setExisting] = useState([]);
  const [checking, setChecking] = useState(true);
  const [sessionName, setSessionName] = useState(schoolYearLabel());
  const [termIndex, setTermIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listSessions()
      .then((payload) => {
        if (!alive) return;
        const rows = Array.isArray(payload) ? payload : payload.sessions || [];
        setExisting(rows);
      })
      .catch(() => {
        if (alive) setExisting([]);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hasSession = existing.length > 0;
  const currentSession = existing.find((row) => row.is_current) || existing[0] || null;
  const term = TERM_CHOICES[termIndex];
  const sessionReady = hasSession || sessionName.trim().length >= 4;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!sessionReady) {
      setError("Give the academic session a name of at least 4 characters, for example 2026/2027.");
      return;
    }
    setBusy(true);
    try {
      let sessionId = currentSession?.id;
      if (!hasSession) {
        const created = await createSession({
          name: sessionName.trim(),
          is_current: true,
        });
        sessionId = (created?.session || created)?.id;
        if (!sessionId) throw new Error("The session was not created. Please try again.");
      }
      await createTerm({
        session_id: sessionId,
        name: term.name,
        position: term.position,
        is_current: true,
      });
      onDone();
    } catch (setupError) {
      setError(setupError.message || "The academic setup could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="rounded-2xl bg-surface-container-low p-space-md ring-1 ring-outline-variant/40">
        <p className="font-body-sm text-body-sm text-on-surface-variant">Checking your school year...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md w-full max-w-3xl mx-auto pb-8">
      <section className="rounded-2xl bg-surface-container-low p-space-md ring-1 ring-outline-variant/40">
        <div className="flex items-start gap-space-sm">
          <span className="material-symbols-outlined text-[22px] text-secondary">event_available</span>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {hasSession ? "Choose the term you are teaching" : "Start your school year"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {hasSession
                ? `Your session ${currentSession?.name || ""} is in place. Pick the term you are teaching now, and the dashboard, classes, score entry and results all open up.`
                : "Sessions, terms, classes and results all hang off an academic session, so this is the one thing to set up before anything else. A name for the year and the term is all it takes, no dates needed."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-space-sm mt-space-md">
          {!hasSession && (
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="session-name">Academic session</label>
              <input
                id="session-name"
                className={fieldClass}
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="2026/2027"
                autoComplete="off"
              />
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                The academic year, for example 2026/2027.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="term-name">Term</label>
            <select
              id="term-name"
              className={fieldClass}
              value={termIndex}
              onChange={(event) => setTermIndex(Number(event.target.value))}
            >
              {TERM_CHOICES.map((choice, index) => (
                <option key={choice.name} value={index}>{choice.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="font-body-sm text-body-sm text-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !sessionReady}
            className="h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold disabled:opacity-60"
          >
            {busy ? "Saving..." : hasSession ? "Save term" : "Create session and term"}
          </button>
        </form>
      </section>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Term dates are optional and can be added later under <span className="text-secondary">Manage</span>, along with
        classes, subjects, students and staff.
      </p>
    </div>
  );
}
