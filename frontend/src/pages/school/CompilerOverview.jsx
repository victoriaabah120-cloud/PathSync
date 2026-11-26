import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import {
  EmptyState,
  ErrorNote,
  Notice,
  SectionCard,
  SectionTitle,
  dateOf,
  humanise,
  number,
} from "../../components/school/SchoolKit.jsx";
import {
  getConfig,
  getSchoolContext,
  listClasses,
  listSessions,
  listStudents,
  listSubjects,
  listTeachers,
  listTerms,
  saveConfig,
} from "../../services/schoolApi.js";

// Mirrors the backend's documented default scale, used only until the school saves
// its own rules (src_assessment_configs.grading_scale).
const DEFAULT_SCALE = [
  { min: 75, max: 100, grade: "A1", remark: "Excellent" },
  { min: 70, max: 74, grade: "B2", remark: "Very good" },
  { min: 65, max: 69, grade: "B3", remark: "Good" },
  { min: 60, max: 64, grade: "C4", remark: "Credit" },
  { min: 55, max: 59, grade: "C5", remark: "Credit" },
  { min: 50, max: 54, grade: "C6", remark: "Credit" },
  { min: 45, max: 49, grade: "D7", remark: "Pass" },
  { min: 40, max: 44, grade: "E8", remark: "Pass" },
  { min: 0, max: 39, grade: "F9", remark: "Fail" },
];

const RANK_POLICIES = [
  { value: "competition", label: "Competition (1, 2, 2, 4)" },
  { value: "dense", label: "Dense (1, 2, 2, 3)" },
  { value: "ordinal", label: "Ordinal (1, 2, 3, 4)" },
];

const INCOMPLETE_POLICIES = [
  { value: "block", label: "Block the compilation until every score is in" },
  { value: "exclude", label: "Compile and leave incomplete students out of the ranking" },
];

const SUBSCRIPTION_LABEL = { active: "Active", expired: "Expired", pending: "Pending", none: "No plan" };

function scaleFrom(config) {
  const source = Array.isArray(config?.grading_scale) && config.grading_scale.length ? config.grading_scale : DEFAULT_SCALE;
  return source.map((band) => ({
    min: String(band.min ?? 0),
    max: String(band.max ?? 0),
    grade: String(band.grade ?? ""),
    remark: String(band.remark ?? ""),
  }));
}

function formFrom(sessionId, termId, config) {
  return {
    session_id: sessionId || "",
    term_id: termId || "",
    ca1_max: String(config?.ca1_max ?? 10),
    ca2_max: String(config?.ca2_max ?? 10),
    ca3_max: String(config?.ca3_max ?? 10),
    exam_max: String(config?.exam_max ?? 70),
    pass_mark: String(config?.pass_mark ?? 40),
    rank_policy: config?.rank_policy || "competition",
    incomplete_policy: config?.incomplete_policy || "block",
    grading_scale: scaleFrom(config),
  };
}

const sum = (...values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

export default function CompilerOverview() {
  const [context, setContext] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [staffBlocked, setStaffBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [school, sessionList, termList, classList, subjectList, studentList, teacherList, configList] =
        await Promise.all([
          getSchoolContext(),
          listSessions(),
          listTerms(),
          listClasses(),
          listSubjects(),
          listStudents(),
          listTeachers().catch((error) => ({ __error: error })),
          getConfig(),
        ]);

      const loadedSessions = sessionList?.sessions || [];
      const loadedTerms = termList?.terms || [];
      const loadedConfigs = configList?.configs || [];

      setContext(school);
      setSessions(loadedSessions);
      setTerms(loadedTerms);
      setClasses(classList?.classes || []);
      setSubjects(subjectList?.subjects || []);
      setStudents(studentList?.students || []);
      setConfigs(loadedConfigs);
      if (teacherList && teacherList.__error) {
        setTeachers(null);
        setStaffBlocked(teacherList.__error.status === 403);
      } else {
        setTeachers(teacherList?.teachers || []);
      }

      const activeSession = loadedSessions.find((session) => session.is_current) || loadedSessions[0] || null;
      const activeTerm =
        loadedTerms.find((term) => term.session_id === activeSession?.id && term.is_current) ||
        loadedTerms.find((term) => term.session_id === activeSession?.id) ||
        null;
      const saved =
        loadedConfigs.find((config) => config.session_id === activeSession?.id && !config.term_id) ||
        loadedConfigs.find((config) => config.session_id === activeSession?.id) ||
        null;
      setForm(formFrom(activeSession?.id, saved?.term_id || activeTerm?.id || "", saved));
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const role = context?.role;
  const isAdmin = role === "school_admin" || role === "admin";

  const activeSession = useMemo(
    () => sessions.find((session) => session.is_current) || sessions[0] || null,
    [sessions]
  );
  const sessionTerms = useMemo(
    () => terms.filter((term) => !form?.session_id || term.session_id === form.session_id),
    [terms, form]
  );
  const usage = context?.students || context?.usage || {};
  const used = Number(usage.used ?? usage.students ?? 0);
  const capacity = Number(usage.capacity ?? context?.subscription?.student_capacity ?? 0);
  const subscriptionState = String(context?.subscription_state || context?.subscription?.status || "none").toLowerCase();
  const totalMax = form ? sum(form.ca1_max, form.ca2_max, form.ca3_max, form.exam_max) : 0;
  const teacherCount = teachers === null ? null : teachers.length;
  const activeTeachers = teachers === null ? 0 : teachers.filter((member) => member.status === "active").length;
  const pendingTeachers = teachers === null ? 0 : teachers.filter((member) => member.status !== "active").length;

  const structureLinks = [
    { id: "sessions", label: "Sessions", icon: "calendar_month", count: sessions.length, note: "Academic years" },
    { id: "terms", label: "Terms", icon: "event_note", count: terms.length, note: "Term calendar" },
    { id: "classes", label: "Classes", icon: "groups", count: classes.length, note: "Arms and rosters" },
    { id: "students", label: "Students", icon: "school", count: students.length, note: "Enrolled profiles" },
    { id: "subjects", label: "Subjects", icon: "menu_book", count: subjects.length, note: "Syllabus subjects" },
    { id: "teachers", label: "Teachers", icon: "badge", count: teacherCount, note: "Staff accounts" },
  ];

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveNotice("");
    setSaveError("");
  }

  function updateBand(index, key, value) {
    setForm((current) => ({
      ...current,
      grading_scale: current.grading_scale.map((band, position) =>
        position === index ? { ...band, [key]: value } : band
      ),
    }));
    setSaveNotice("");
    setSaveError("");
  }

  function addBand() {
    setForm((current) => ({
      ...current,
      grading_scale: [...current.grading_scale, { min: "0", max: "0", grade: "", remark: "" }],
    }));
    setSaveNotice("");
    setSaveError("");
  }

  function removeBand(index) {
    setForm((current) => ({
      ...current,
      grading_scale: current.grading_scale.filter((_, position) => position !== index),
    }));
    setSaveNotice("");
    setSaveError("");
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaveNotice("");
    const bands = form.grading_scale.map((band) => ({
      min: Number(band.min),
      max: Number(band.max),
      grade: band.grade.trim(),
      remark: band.remark.trim(),
    }));
    if (bands.some((band) => !band.grade)) {
      setSaveError("Every grading band needs a grade.");
      setSaving(false);
      return;
    }
    if (bands.some((band) => !Number.isFinite(band.min) || !Number.isFinite(band.max) || band.min > band.max)) {
      setSaveError("Every band needs a minimum no greater than its maximum.");
      setSaving(false);
      return;
    }
    try {
      const payload = {
        session_id: form.session_id,
        term_id: form.term_id || null,
        ca1_max: Number(form.ca1_max) || 0,
        ca2_max: Number(form.ca2_max) || 0,
        ca3_max: Number(form.ca3_max) || 0,
        exam_max: Number(form.exam_max) || 0,
        total_max: Math.round(totalMax * 10) / 10,
        pass_mark: Number(form.pass_mark) || 0,
        grading_scale: bands,
        rank_policy: form.rank_policy,
        incomplete_policy: form.incomplete_policy,
      };
      const response = await saveConfig(payload);
      const saved = response?.config;
      if (saved) {
        setConfigs((current) => [saved, ...current]);
        setForm(formFrom(saved.session_id, saved.term_id || "", saved));
        setSaveNotice(`Version ${saved.version} saved. New compilations use these rules.`);
      } else {
        setSaveNotice("Rules saved.");
      }
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader text="Loading the academic overview..." />;

  if (loadError) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <ErrorNote message={loadError} onRetry={load} />
        <Link
          to="/school"
          className="h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center"
        >
          Open the school setup
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      <SectionCard className="flex flex-col gap-space-sm">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-low text-secondary font-label-sm text-label-sm font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {[activeSession?.name, sessionTerms.find((term) => term.is_current)?.name].filter(Boolean).join(" · ") ||
                "No active session"}
            </span>
            <h1 className="mt-1 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface truncate">
              {context?.school?.name || "Your school"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {humanise(role) || "Staff"} · Academic overview
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
            {SUBSCRIPTION_LABEL[subscriptionState] || humanise(subscriptionState)}
          </span>
        </div>
      </SectionCard>

      <SectionCard className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-primary text-[18px]">pie_chart</span>
            <span className="font-label-md text-label-md text-on-surface font-semibold">Student capacity</span>
          </div>
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
            {capacity ? `${Math.max(capacity - used, 0)} seats left` : "No plan"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-space-sm">
          <p className="font-headline-md text-headline-md font-bold text-primary tabular-nums">
            {used}
            <span className="font-body-sm text-body-sm text-on-surface-variant font-normal"> / {capacity || "—"} enrolled</span>
          </p>
          <span className="font-label-sm text-label-sm font-semibold text-primary tabular-nums">
            {capacity ? `${Math.min(Math.round((used / capacity) * 100), 100)}%` : "—"}
          </span>
        </div>
        <progress
          value={capacity ? Math.min(used, capacity) : 0}
          max={capacity || 1}
          aria-label="Student capacity used"
          className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high appearance-none [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-container-high [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-secondary-container [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-secondary-container"
        />
        <div className="flex items-center justify-between gap-space-sm">
          <span className="flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm min-w-0">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span className="truncate">
              {context?.subscription?.current_period_end
                ? `Renews ${dateOf(context.subscription.current_period_end)}`
                : "No renewal date on record"}
            </span>
          </span>
          <Link to="/school/admin" className="font-label-sm text-label-sm text-secondary font-semibold shrink-0">
            Admin dashboard
          </Link>
        </div>
      </SectionCard>

      <section className="grid grid-cols-2 gap-space-sm">
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col justify-between gap-space-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Students</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[16px]">school</span>
            </span>
          </div>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">{students.length}</p>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Across {classes.length} {classes.length === 1 ? "class" : "classes"}
            </span>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col justify-between gap-space-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Staff</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[16px]">badge</span>
            </span>
          </div>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">
              {teacherCount === null ? "—" : teacherCount}
            </p>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {teacherCount === null
                ? "Administrators only"
                : `${activeTeachers} active${pendingTeachers ? ` • ${pendingTeachers} invited` : ""}`}
            </span>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col justify-between gap-space-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Classes</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[16px]">groups</span>
            </span>
          </div>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">{classes.length}</p>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {classes.reduce((total, klass) => total + (Number(klass.students) || 0), 0)} enrolments
            </span>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col justify-between gap-space-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Subjects</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
            </span>
          </div>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">{subjects.length}</p>
            <span className="font-body-sm text-body-sm text-on-surface-variant">On the syllabus</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-space-xs">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Academic structure</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm">
          {structureLinks.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-2xl shadow-md flex flex-col gap-space-xs min-h-[96px] justify-between transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              </span>
              <span>
                <span className="font-label-md text-label-md text-on-surface font-semibold block leading-tight">
                  {item.label}
                  {item.count !== null && (
                    <span className="ml-1 text-on-surface-variant font-normal tabular-nums">({item.count})</span>
                  )}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 block truncate">
                  {item.note}
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <SectionCard id="sessions" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle icon="calendar_month" title="Sessions" note={`${sessions.length} academic ${sessions.length === 1 ? "session" : "sessions"}`} />
        {sessions.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No academic session has been created yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-space-sm py-2">
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{session.name}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {dateOf(session.starts_on)} – {dateOf(session.ends_on)}
                  </p>
                </div>
                {session.is_current && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm font-bold">
                    Current
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="terms" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle icon="event_note" title="Terms" note={`${terms.length} ${terms.length === 1 ? "term" : "terms"} on record`} />
        {terms.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No term has been created yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {terms.map((term) => {
              const parent = sessions.find((session) => session.id === term.session_id);
              return (
                <li key={term.id} className="flex items-center justify-between gap-space-sm py-2">
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
                      {term.name} <span className="text-on-surface-variant font-normal">· {parent?.name || "Session"}</span>
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Position {term.position} · {dateOf(term.starts_on)} – {dateOf(term.ends_on)}
                    </p>
                  </div>
                  {term.is_current && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm font-bold">
                      Current
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="classes" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle icon="groups" title="Classes" note={`${classes.length} ${classes.length === 1 ? "class" : "classes"}`} />
        {classes.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No class has been created yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {classes.map((klass) => (
              <li key={klass.id} className="flex items-center justify-between gap-space-sm py-2">
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{klass.name}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{klass.level || "No level"}</p>
                </div>
                <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                  {Number(klass.students) || 0} students
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="students" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle
          icon="school"
          title="Students"
          note={
            students.length > 12
              ? `Showing 12 of ${students.length} enrolled students`
              : `${students.length} enrolled ${students.length === 1 ? "student" : "students"}`
          }
        />
        {students.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No student has been enrolled yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {students.slice(0, 12).map((student) => (
              <li key={student.id} className="flex items-center justify-between gap-space-sm py-2">
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
                    {student.name || `${student.first_name || ""} ${student.last_name || ""}`.trim()}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {student.admission_no || "No admission number"}
                  </p>
                </div>
                <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">
                  {student.class_name || "Unassigned"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="subjects" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle icon="menu_book" title="Subjects" note={`${subjects.length} on the syllabus`} />
        {subjects.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No subject has been created yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {subjects.map((subject) => (
              <li key={subject.id} className="flex items-center justify-between gap-space-sm py-2">
                <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
                  {subject.name}
                </span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant">
                  {subject.code || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="teachers" className="flex flex-col gap-space-sm scroll-mt-20">
        <SectionTitle
          icon="badge"
          title="Teachers"
          note={
            teachers === null
              ? "Staff accounts and their assignments"
              : `${teachers.length} staff ${teachers.length === 1 ? "account" : "accounts"}`
          }
        />
        {teachers === null ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {staffBlocked
              ? "Only a school administrator can see the staff list and their assignments."
              : "The staff list could not be loaded."}
          </p>
        ) : teachers.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No teacher has been invited yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant">
            {teachers.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-space-sm py-2">
                <div className="min-w-0">
                  <p className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
                    {member.invited_email || "Teacher"}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {(member.responsibilities || []).length} assigned{" "}
                    {(member.responsibilities || []).length === 1 ? "role" : "roles"}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${
                    member.status === "active"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {humanise(member.status) || "Invited"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard className="flex flex-col gap-space-sm">
        <SectionTitle
          icon="tune"
          title="Assessment configuration"
          note="The CA split, grading scale, tie policy and incomplete-result rule every compilation uses."
        />

        {!isAdmin && (
          <p className="rounded-xl bg-surface-container px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Only a school administrator can change these rules. You can read the current ones here.
          </p>
        )}

        {form && (
          <form onSubmit={handleSave} className="flex flex-col gap-space-sm">
            <div className="grid grid-cols-2 gap-space-sm">
              <label className="flex flex-col gap-1 min-w-0">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Session</span>
                <select
                  value={form.session_id}
                  onChange={(event) => {
                    const sessionId = event.target.value;
                    const nextTerm = terms.find((term) => term.session_id === sessionId && term.is_current);
                    const saved =
                      configs.find((config) => config.session_id === sessionId && !config.term_id) ||
                      configs.find((config) => config.session_id === sessionId) ||
                      null;
                    setForm(formFrom(sessionId, saved?.term_id || nextTerm?.id || "", saved));
                    setSaveNotice("");
                    setSaveError("");
                  }}
                  disabled={!isAdmin}
                  className="w-full rounded-xl bg-surface-container-low px-space-md py-2.5 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                >
                  {sessions.length === 0 && <option value="">No session</option>}
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 min-w-0">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Applies to</span>
                <select
                  value={form.term_id}
                  onChange={(event) => {
                    const termId = event.target.value;
                    const saved =
                      configs.find((config) => config.session_id === form.session_id && (config.term_id || "") === termId) ||
                      null;
                    setForm(formFrom(form.session_id, termId, saved || form));
                    setSaveNotice("");
                    setSaveError("");
                  }}
                  disabled={!isAdmin}
                  className="w-full rounded-xl bg-surface-container-low px-space-md py-2.5 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                >
                  <option value="">Whole session (default)</option>
                  {sessionTerms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm">
              {[
                { key: "ca1_max", label: "CA 1 max" },
                { key: "ca2_max", label: "CA 2 max" },
                { key: "ca3_max", label: "CA 3 max" },
                { key: "exam_max", label: "Exam max" },
                { key: "pass_mark", label: "Pass mark" },
              ].map((field) => (
                <label key={field.key} className="flex flex-col gap-1 min-w-0">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">{field.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    disabled={!isAdmin}
                    className="w-full rounded-xl bg-surface-container-low px-space-md py-2.5 font-body-md text-body-md text-on-surface tabular-nums border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1 min-w-0">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Total (computed)</span>
                <output className="w-full rounded-xl bg-surface-container px-space-md py-2.5 font-label-lg text-label-lg text-on-surface font-semibold tabular-nums">
                  {number(totalMax)}
                </output>
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Tie policy</span>
              <select
                value={form.rank_policy}
                onChange={(event) => updateField("rank_policy", event.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-xl bg-surface-container-low px-space-md py-2.5 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
              >
                {RANK_POLICIES.map((policy) => (
                  <option key={policy.value} value={policy.value}>
                    {policy.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Incomplete results</span>
              <select
                value={form.incomplete_policy}
                onChange={(event) => updateField("incomplete_policy", event.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-xl bg-surface-container-low px-space-md py-2.5 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
              >
                {INCOMPLETE_POLICIES.map((policy) => (
                  <option key={policy.value} value={policy.value}>
                    {policy.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between gap-space-sm">
                <span className="font-label-md text-label-md text-on-surface font-semibold">Grading scale</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={addBand}
                    className="h-8 px-space-sm rounded-lg border border-outline-variant font-label-sm text-label-sm text-on-surface flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add band
                  </button>
                )}
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                A score takes the band with the highest minimum that still contains it.
              </p>
              <ul className="flex flex-col gap-space-xs">
                {form.grading_scale.map((band, index) => (
                  <li key={index} className="rounded-xl bg-surface-container-low p-space-sm flex flex-col gap-space-xs">
                    <div className="grid grid-cols-3 gap-space-xs">
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Min</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          value={band.min}
                          onChange={(event) => updateBand(index, "min", event.target.value)}
                          disabled={!isAdmin}
                          className="w-full rounded-lg bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface tabular-nums border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                        />
                      </label>
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Max</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          value={band.max}
                          onChange={(event) => updateBand(index, "max", event.target.value)}
                          disabled={!isAdmin}
                          className="w-full rounded-lg bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface tabular-nums border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                        />
                      </label>
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Grade</span>
                        <input
                          value={band.grade}
                          onChange={(event) => updateBand(index, "grade", event.target.value)}
                          disabled={!isAdmin}
                          maxLength={6}
                          className="w-full rounded-lg bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                        />
                      </label>
                    </div>
                    <div className="flex items-end gap-space-xs">
                      <label className="flex flex-col gap-1 min-w-0 flex-1">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Remark</span>
                        <input
                          value={band.remark}
                          onChange={(event) => updateBand(index, "remark", event.target.value)}
                          disabled={!isAdmin}
                          maxLength={40}
                          className="w-full rounded-lg bg-surface-container-lowest px-2 py-2 font-body-sm text-body-sm text-on-surface border border-outline-variant/40 outline-none focus:border-secondary disabled:opacity-60"
                        />
                      </label>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => removeBand(index)}
                          aria-label={`Remove the ${band.grade || "grading"} band`}
                          className="w-9 h-9 shrink-0 rounded-lg bg-surface-container-lowest text-error flex items-center justify-center border border-outline-variant/40"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {saveError && <ErrorNote message={saveError} />}
            <Notice>{saveNotice}</Notice>

            {isAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold disabled:opacity-50"
              >
                {saving ? "Saving rules..." : "Save assessment rules"}
              </button>
            )}
          </form>
        )}
      </SectionCard>

      {classes.length === 0 && students.length === 0 && (
        <EmptyState icon="school" title="The school is empty">
          Add a session, term, class and students from the admin dashboard before results can be compiled.
        </EmptyState>
      )}
    </div>
  );
}
