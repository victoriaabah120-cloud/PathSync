import { useEffect, useState } from "react";
import { createSession, createTerm, listSessions } from "../../services/schoolApi.js";

/**
 * First-run setup for a brand-new school.
 *
 * The academic endpoints refuse to work until the school has a current session and
 * a term in it, which is correct, but a freshly registered school used to meet that
 * rule as a dead-end "Create an academic session first." error on its own dashboard.
 * This panel asks for exactly the two records the rest of the module needs and then
 * hands control back to the dashboard, so registration leads straight into a usable
 * school instead of a locked screen.
 *
 * Nothing is invented: the school year and term are real rows the administrator can
 * edit later from Manage, and the form is prefilled only with editable suggestions.
 */
function schoolYearLabel() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${start + 1}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function suggestions() {
  const now = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    sessionName: `${startYear}/${startYear + 1}`,
    sessionStart: `${startYear}-09-01`,
    sessionEnd: `${startYear + 1}-07-31`,
    termName: "First Term",
    termStart: `${startYear}-09-01`,
    termEnd: `${startYear}-12-15`,
  };
}

const fieldClass =
  "w-full h-11 rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface ring-1 ring-outline-variant/60 focus:outline-none focus:ring-2 focus:ring-secondary";
const labelClass = "font-label-md text-label-md text-on-surface-variant";

export default function SchoolSetup({ onDone }) {
  const defaults = suggestions();
  const [existing, setExisting] = useState([]);
  const [checking, setChecking] = useState(true);
  const [sessionName, setSessionName] = useState(defaults.sessionName);
  const [sessionStart, setSessionStart] = useState(defaults.sessionStart);
  const [sessionEnd, setSessionEnd] = useState(defaults.sessionEnd);
  const [termName, setTermName] = useState(defaults.termName);
  const [termStart, setTermStart] = useState(defaults.termStart);
  const [termEnd, setTermEnd] = useState(defaults.termEnd);
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

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (new Date(termEnd) < new Date(termStart)) {
      setError("The term end date must be on or after its start date.");
      return;
    }
    setBusy(true);
    try {
      let sessionId = currentSession?.id;
      if (!hasSession) {
        if (new Date(sessionEnd) < new Date(sessionStart)) {
          setError("The session end date must be on or after its start date.");
          setBusy(false);
          return;
        }
        const created = await createSession({
          name: sessionName.trim() || defaults.sessionName,
          starts_on: sessionStart,
          ends_on: sessionEnd,
          is_current: true,
        });
        sessionId = (created?.session || created)?.id;
        if (!sessionId) throw new Error("The session was not created. Please try again.");
      }
      await createTerm({
        session_id: sessionId,
        name: termName.trim() || "First Term",
        position: 1,
        starts_on: termStart,
        ends_on: termEnd,
        is_current: true,
      });
      onDone();
    } catch (setupError) {
      setError(setupError.message || "The school year could not be created. Please try again.");
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
              {hasSession ? "Add a term to your academic session" : "Start your school year"}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              {hasSession
                ? `Your session ${currentSession?.name || ""} is in place. Add the term you are teaching now, and the dashboard, classes, score entry and results all open up.`
                : "Sessions, terms, classes and results all hang off an academic session, so this is the one thing to create before anything else. You can change the dates later in Manage."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-space-sm mt-space-md">
          {!hasSession && (
            <div className="flex flex-col gap-space-sm">
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="session-name">Academic session</label>
                <input
                  id="session-name"
                  className={fieldClass}
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  placeholder="2026/2027"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className={labelClass} htmlFor="session-start">Session starts</label>
                  <input
                    id="session-start"
                    type="date"
                    className={fieldClass}
                    value={sessionStart}
                    onChange={(event) => setSessionStart(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass} htmlFor="session-end">Session ends</label>
                  <input
                    id="session-end"
                    type="date"
                    className={fieldClass}
                    value={sessionEnd}
                    onChange={(event) => setSessionEnd(event.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-space-sm pt-space-xs border-t border-outline-variant/40 mt-space-xs">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="term-name">Term</label>
              <input
                id="term-name"
                className={fieldClass}
                value={termName}
                onChange={(event) => setTermName(event.target.value)}
                placeholder="First Term"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="term-start">Term starts</label>
                <input
                  id="term-start"
                  type="date"
                  className={fieldClass}
                  value={termStart}
                  onChange={(event) => setTermStart(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="term-end">Term ends</label>
                <input
                  id="term-end"
                  type="date"
                  className={fieldClass}
                  value={termEnd}
                  onChange={(event) => setTermEnd(event.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="font-body-sm text-body-sm text-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold disabled:opacity-60"
          >
            {busy ? "Saving..." : hasSession ? "Save term" : "Create session and term"}
          </button>
        </form>
      </section>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Already set up? Open <span className="text-secondary">Manage</span> to add classes, subjects, students and staff.
      </p>
    </div>
  );
}
