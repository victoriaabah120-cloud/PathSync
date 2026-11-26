import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/Loader.jsx";
import {
  SectionCard,
  SectionTitle,
  ErrorNote,
  EmptyState,
  Notice,
  dateOf,
  humanise,
} from "../../components/school/SchoolKit.jsx";
import {
  createClass,
  createSession,
  createStudent,
  createSubject,
  createTerm,
  inviteTeacher,
  listClasses,
  listSessions,
  listStudents,
  listSubjects,
  listTeachers,
  listTerms,
  updateStudent,
} from "../../services/schoolApi.js";

const TABS = [
  { id: "classes", label: "Classes", icon: "groups" },
  { id: "students", label: "Students", icon: "school" },
  { id: "subjects", label: "Subjects", icon: "menu_book" },
  { id: "teachers", label: "Teachers", icon: "badge" },
  { id: "sessions", label: "Sessions", icon: "calendar_month" },
];

/** Endpoints answer {classes: [...]}, {students: [...]} and so on; accept either. */
function listOf(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload[key])) return payload[key];
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block font-label-sm text-label-sm text-on-surface-variant/70">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 font-body-md text-body-md text-on-surface outline-none focus:border-secondary";

function tabFromUrl() {
  const wanted = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((item) => item.id === wanted) ? wanted : "classes";
}

export default function Manage() {
  const [tab, setTab] = useState(tabFromUrl);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [terms, setTerms] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [cls, stu, sub, tea, ses, trm] = await Promise.all([
        listClasses().catch(() => null),
        listStudents().catch(() => null),
        listSubjects().catch(() => null),
        listTeachers().catch(() => null),
        listSessions().catch(() => null),
        listTerms().catch(() => null),
      ]);
      setClasses(listOf(cls, "classes"));
      setStudents(listOf(stu, "students"));
      setSubjects(listOf(sub, "subjects"));
      setTeachers(listOf(tea, "teachers"));
      setSessions(listOf(ses, "sessions"));
      setTerms(listOf(trm, "terms"));
    } catch (error) {
      setLoadError(error.message || "The school records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key, action, success) {
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
      return true;
    } catch (error) {
      setActionError(error.message || "That change could not be saved.");
      return false;
    } finally {
      setBusy("");
    }
  }

  if (loading) return <Loader text="Loading school records..." />;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4">
      {loadError && <ErrorNote message={loadError} onRetry={load} />}
      {notice && <Notice>{notice}</Notice>}
      {actionError && <ErrorNote message={actionError} onRetry={() => setActionError("")} retryLabel="Dismiss" />}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-label-md text-label-md transition ${
              tab === item.id
                ? "border-secondary bg-secondary text-on-secondary"
                : "border-white/15 text-on-surface-variant"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "classes" && (
        <ClassesTab
          classes={classes}
          busy={busy}
          onCreate={(body) => run("class", () => createClass(body), "Class added.")}
        />
      )}
      {tab === "students" && (
        <StudentsTab
          students={students}
          classes={classes}
          busy={busy}
          onCreate={(body) => run("student", () => createStudent(body), "Student enrolled.")}
          onStatus={(id, status) => run(`status-${id}`, () => updateStudent(id, { status }), "Student updated.")}
        />
      )}
      {tab === "subjects" && (
        <SubjectsTab
          subjects={subjects}
          busy={busy}
          onCreate={(body) => run("subject", () => createSubject(body), "Subject added.")}
        />
      )}
      {tab === "teachers" && (
        <TeachersTab
          teachers={teachers}
          busy={busy}
          onInvite={(email, name) => run("invite", () => inviteTeacher(email, name), "Invitation sent.")}
        />
      )}
      {tab === "sessions" && (
        <SessionsTab
          sessions={sessions}
          terms={terms}
          busy={busy}
          onCreateSession={(body) => run("session", () => createSession(body), "Session added.")}
          onCreateTerm={(body) => run("term", () => createTerm(body), "Term added.")}
        />
      )}
    </div>
  );
}

function ClassesTab({ classes, busy, onCreate }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");

  return (
    <>
      <SectionCard>
        <SectionTitle icon="groups" title="Classes" note={`${classes.length} on record`} />
        {classes.length === 0 ? (
          <EmptyState icon="groups" title="No classes yet">
            Add the first class, then enrol students into it.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {classes.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md text-on-surface">{item.name}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {[item.level, item.student_count ? `${item.student_count} students` : ""]
                      .filter(Boolean)
                      .join(" · ") || "No level set"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="add" title="Add a class" />
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const ok = await onCreate({ name: name.trim(), level: level.trim() });
            if (ok) {
              setName("");
              setLevel("");
            }
          }}
        >
          <Field label="Class name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="JSS 1A" />
          </Field>
          <Field label="Level" hint="Optional, for example Junior Secondary.">
            <input className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Junior Secondary" />
          </Field>
          <button
            type="submit"
            disabled={busy === "class" || !name.trim()}
            className="w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            {busy === "class" ? "Adding..." : "Add class"}
          </button>
        </form>
      </SectionCard>
    </>
  );
}

function StudentsTab({ students, classes, busy, onCreate, onStatus }) {
  const [form, setForm] = useState({ admission_no: "", first_name: "", last_name: "", gender: "" });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <SectionCard>
        <SectionTitle
          icon="school"
          title="Students"
          note={`${students.length} on the roster · ${students.filter((item) => (item.status || "active") === "active").length} active`}
        />
        {students.length === 0 ? (
          <EmptyState icon="person_add" title="No students yet">
            Enrol the first student with an admission number.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {students.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md text-on-surface">
                    {item.name || [item.first_name, item.last_name].filter(Boolean).join(" ")}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    ADM {item.admission_no || "—"} · {humanise(item.status || "active")}
                    {item.class_name ? ` · ${item.class_name}` : ""}
                  </p>
                </div>
                <select
                  value={item.status || "active"}
                  onChange={(event) => onStatus(item.id, event.target.value)}
                  disabled={busy === `status-${item.id}`}
                  className="shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1.5 font-label-sm text-label-sm text-on-surface"
                  aria-label={`Status for ${item.name || item.admission_no}`}
                >
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="person_add" title="Enrol a student" note={classes.length ? "" : "Add a class first"} />
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!form.admission_no.trim() || !form.first_name.trim() || !form.last_name.trim()) return;
            const ok = await onCreate({
              admission_no: form.admission_no.trim(),
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              gender: form.gender,
            });
            if (ok) setForm({ admission_no: "", first_name: "", last_name: "", gender: "" });
          }}
        >
          <Field label="Admission number">
            <input
              className={inputClass}
              value={form.admission_no}
              onChange={(e) => update("admission_no", e.target.value)}
              placeholder="ADM-001"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input className={inputClass} value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </Field>
            <Field label="Last name">
              <input className={inputClass} value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </Field>
          </div>
          <Field label="Gender" hint="Optional.">
            <select className={inputClass} value={form.gender} onChange={(e) => update("gender", e.target.value)}>
              <option value="">Not stated</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={busy === "student" || !form.admission_no.trim() || !form.first_name.trim() || !form.last_name.trim()}
            className="w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            {busy === "student" ? "Enrolling..." : "Enrol student"}
          </button>
        </form>
        <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
          Enrolment is checked against your plan's capacity on the server.
        </p>
      </SectionCard>
    </>
  );
}

function SubjectsTab({ subjects, busy, onCreate }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <>
      <SectionCard>
        <SectionTitle icon="menu_book" title="Subjects" note={`${subjects.length} on record`} />
        {subjects.length === 0 ? (
          <EmptyState icon="menu_book" title="No subjects yet">
            Add Mathematics, English and the rest of the curriculum.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {subjects.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <p className="truncate font-body-md text-body-md text-on-surface">{item.name}</p>
                <p className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">{item.code || "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="add" title="Add a subject" />
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const ok = await onCreate({ name: name.trim(), code: code.trim() });
            if (ok) {
              setName("");
              setCode("");
            }
          }}
        >
          <Field label="Subject name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
          </Field>
          <Field label="Code" hint="Optional, for example MTH.">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="MTH" />
          </Field>
          <button
            type="submit"
            disabled={busy === "subject" || !name.trim()}
            className="w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            {busy === "subject" ? "Adding..." : "Add subject"}
          </button>
        </form>
      </SectionCard>
    </>
  );
}

function TeachersTab({ teachers, busy, onInvite }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  return (
    <>
      <SectionCard>
        <SectionTitle icon="badge" title="Teachers" note={`${teachers.length} on record`} />
        {teachers.length === 0 ? (
          <EmptyState icon="badge" title="No teachers yet">
            Invite a teacher by email. One account can hold subject and form-teacher duties.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {teachers.map((item) => (
              <li key={item.id || item.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md text-on-surface">
                    {item.name || item.full_name || item.email}
                  </p>
                  <p className="truncate font-label-sm text-label-sm text-on-surface-variant">{item.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                  {humanise(item.status || item.role || "invited")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="mail" title="Invite a teacher" />
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!email.trim()) return;
            const ok = await onInvite(email.trim(), fullName.trim());
            if (ok) {
              setEmail("");
              setFullName("");
            }
          }}
        >
          <Field label="Email address">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.com"
            />
          </Field>
          <Field label="Full name" hint="Optional. Helps the invitation read well.">
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <button
            type="submit"
            disabled={busy === "invite" || !email.trim()}
            className="w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            {busy === "invite" ? "Inviting..." : "Send invitation"}
          </button>
        </form>
      </SectionCard>
    </>
  );
}

function SessionsTab({ sessions, terms, busy, onCreateSession, onCreateTerm }) {
  const [sessionName, setSessionName] = useState("");
  const [term, setTerm] = useState({ session_id: "", name: "", position: "1" });

  const currentSession = sessions.find((item) => item.is_current) || sessions[0] || null;

  return (
    <>
      <SectionCard>
        <SectionTitle icon="calendar_month" title="Sessions" note={`${sessions.length} on record`} />
        {sessions.length === 0 ? (
          <EmptyState icon="calendar_month" title="No sessions yet">
            A session is an academic year, for example 2025/2026.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {sessions.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md text-on-surface">{item.name}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {[item.starts_on ? dateOf(item.starts_on) : "", item.ends_on ? dateOf(item.ends_on) : ""]
                      .filter(Boolean)
                      .join(" to ") || "No dates set"}
                  </p>
                </div>
                {item.is_current && (
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 font-label-sm text-label-sm text-emerald-300">
                    current
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (sessionName.trim().length < 4) return;
            const ok = await onCreateSession({ name: sessionName.trim(), is_current: sessions.length === 0 });
            if (ok) setSessionName("");
          }}
        >
          <input
            className={inputClass}
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="2026/2027"
            aria-label="New session name"
          />
          <button
            type="submit"
            disabled={busy === "session" || sessionName.trim().length < 4}
            className="shrink-0 rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="event" title="Terms" note={`${terms.length} on record`} />
        {terms.length === 0 ? (
          <EmptyState icon="event" title="No terms yet">
            Add the first term to the current session.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {terms.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <p className="truncate font-body-md text-body-md text-on-surface">{item.name}</p>
                <p className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">
                  {item.session_name || item.session?.name || `Term ${item.position || ""}`}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const sessionId = term.session_id || currentSession?.id;
            if (!sessionId || term.name.trim().length < 2) return;
            const ok = await onCreateTerm({
              session_id: sessionId,
              name: term.name.trim(),
              position: Number(term.position) || 1,
              is_current: terms.length === 0,
            });
            if (ok) setTerm({ session_id: sessionId, name: "", position: "1" });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <select
              className={inputClass}
              value={term.session_id || currentSession?.id || ""}
              onChange={(e) => setTerm((current) => ({ ...current, session_id: e.target.value }))}
              aria-label="Session for the new term"
            >
              {sessions.length === 0 && <option value="">No session</option>}
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={term.position}
              onChange={(e) => setTerm((current) => ({ ...current, position: e.target.value }))}
              aria-label="Term position"
            >
              <option value="1">First term</option>
              <option value="2">Second term</option>
              <option value="3">Third term</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={term.name}
              onChange={(e) => setTerm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Term 1"
              aria-label="New term name"
            />
            <button
              type="submit"
              disabled={busy === "term" || term.name.trim().length < 2 || sessions.length === 0}
              className="shrink-0 rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      </SectionCard>
    </>
  );
}
