import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import {
  EmptyState,
  ErrorNote,
  SectionCard,
  SectionTitle,
  StatusChip,
  humanise,
} from "../../components/school/SchoolKit.jsx";
import { getResponsibilities, getSchoolContext } from "../../services/schoolApi.js";

const ROLE_LABEL = {
  school_admin: "School administrator",
  admin: "School administrator",
  teacher: "Subject teacher",
  form_teacher: "Form teacher",
  student: "Student",
};

// Subject and form-teacher roles come from the same endpoint, but they are
// different jobs: one opens a score sheet, the other compiles a whole class.
const TABS = [
  { key: "subject", label: "My subjects", icon: "edit_square" },
  { key: "form", label: "Form classes", icon: "calculate" },
];

export default function TeacherDashboard() {
  const [context, setContext] = useState(null);
  const [responsibilities, setResponsibilities] = useState(null);
  const [tab, setTab] = useState("subject");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [school, roles] = await Promise.all([getSchoolContext(), getResponsibilities()]);
      setContext(school);
      setResponsibilities(roles);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loader text="Loading your responsibilities..." />;

  if (error) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <ErrorNote message={error} onRetry={load} />
        <Link
          to="/school"
          className="h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center"
        >
          Open the school setup
        </Link>
      </div>
    );
  }

  const session = responsibilities?.session;
  const term = responsibilities?.term;
  const subjectRoles = responsibilities?.subject_roles || [];
  const formRoles = responsibilities?.form_roles || [];
  const role = context?.role;
  const isAdmin = role === "school_admin" || role === "admin";
  const active = tab === "form" ? formRoles : subjectRoles;
  const termLabel = [session?.name, term?.name].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      <header className="flex flex-col gap-1">
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
          {context?.school?.name || "School Result Compiler"}
        </p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">Teacher dashboard</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {ROLE_LABEL[role] || humanise(role) || "Staff"}
          {termLabel ? ` · ${termLabel}` : ""}
        </p>
      </header>

      {termLabel && (
        <div className="flex flex-wrap items-center gap-space-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            {termLabel}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
            {subjectRoles.length} subject {subjectRoles.length === 1 ? "role" : "roles"}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
            {formRoles.length} form {formRoles.length === 1 ? "class" : "classes"}
          </span>
        </div>
      )}

      <div className="flex gap-space-xs p-1 rounded-xl bg-surface-container" role="tablist" aria-label="Responsibilities">
        {TABS.map((option) => {
          const count = option.key === "form" ? formRoles.length : subjectRoles.length;
          const selected = tab === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(option.key)}
              className={`flex-1 min-w-0 h-10 rounded-lg font-label-md text-label-md flex items-center justify-center gap-1 transition-colors ${
                selected ? "bg-secondary text-on-secondary font-bold" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{option.icon}</span>
              <span className="truncate">
                {option.label} ({count})
              </span>
            </button>
          );
        })}
      </div>

      {tab === "subject" ? (
        <SectionCard className="flex flex-col gap-space-sm">
          <SectionTitle
            icon="edit_square"
            title="Assigned score sheets"
            note={
              subjectRoles.length
                ? "Open a sheet to enter Continuous Assessment and exam scores."
                : "No subject has been assigned to you for this term yet."
            }
          />
          {subjectRoles.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              An administrator assigns subjects from the teacher list. Once a subject is yours, its score sheet appears
              here.
            </p>
          ) : (
            <ul className="flex flex-col gap-space-sm">
              {subjectRoles.map((role_) => {
                const title = [role_.class_name, role_.subject_name].filter(Boolean).join(" · ");
                const meta = `${role_.students || 0} ${role_.students === 1 ? "student" : "students"}${
                  termLabel ? ` · ${termLabel}` : ""
                }`;
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-headline-sm text-headline-sm font-semibold text-on-surface truncate">
                        {role_.subject_name || "Subject"}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {role_.class_name || "Class"} · {meta}
                      </p>
                    </div>
                    <StatusChip kind="sheet" status={role_.sheet_status} />
                    {role_.sheet_id && (
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                        chevron_right
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={role_.assignment_id || `${role_.class_id}-${role_.subject_id}`}>
                    {role_.sheet_id ? (
                      <Link
                        to={`/school/sheet/${role_.sheet_id}`}
                        className="flex items-center gap-space-sm rounded-xl bg-surface-container-low p-space-md hover:bg-surface-container transition-colors"
                        aria-label={`Open the ${title} score sheet`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-space-sm rounded-xl bg-surface-container-low p-space-md">
                        {body}
                      </div>
                    )}
                    {!role_.sheet_id && (
                      <p className="mt-1 px-1 font-label-sm text-label-sm text-outline">
                        No score sheet exists for this class and subject yet.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      ) : (
        <SectionCard className="flex flex-col gap-space-sm">
          <SectionTitle
            icon="calculate"
            title="Classes you compile"
            note={
              formRoles.length
                ? "As form teacher you reconcile every subject, then sign the class off."
                : "You are not a form teacher of any class this session."
            }
          />
          {formRoles.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              A form-teacher assignment is what unlocks class compilation and the sign-off.
            </p>
          ) : (
            <ul className="flex flex-col gap-space-sm">
              {formRoles.map((role_) => (
                <li key={role_.assignment_id || role_.class_id}>
                  <Link
                    to={`/school/compile/${role_.class_id}`}
                    className="flex items-center gap-space-sm rounded-xl bg-surface-container-low p-space-md hover:bg-surface-container transition-colors"
                  >
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[20px]">groups</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-headline-sm text-headline-sm font-semibold text-on-surface truncate">
                        {role_.class_name || "Class"}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {role_.students || 0} {role_.students === 1 ? "student" : "students"}
                        {termLabel ? ` · ${termLabel}` : ""}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">chevron_right</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {subjectRoles.length === 0 && formRoles.length === 0 && (
        <EmptyState
          icon="assignment_ind"
          title="Nothing assigned yet"
          action={
            <Link
              to="/school/compiler"
              className="h-10 px-space-md rounded-xl border border-outline-variant font-label-sm text-label-sm text-on-surface flex items-center"
            >
              Open the academic overview
            </Link>
          }
        >
          Ask your school administrator to assign you a subject or a form class for this session.
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-space-sm">
        <Link
          to="/school/compiler"
          className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-1 hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[22px] text-secondary">dashboard</span>
          <span className="font-label-lg text-label-lg text-on-surface font-semibold">Academic overview</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">
            Sessions, classes, subjects and grading rules
          </span>
        </Link>
        <Link
          to={isAdmin ? "/school/admin" : "/school/compiler"}
          className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-1 hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[22px] text-secondary">
            {isAdmin ? "admin_panel_settings" : "tune"}
          </span>
          <span className="font-label-lg text-label-lg text-on-surface font-semibold">
            {isAdmin ? "Admin dashboard" : "Assessment rules"}
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">
            {isAdmin ? "Capacity, subscription and the approval pipeline" : "CA split, scale and tie policy"}
          </span>
        </Link>
      </div>
    </div>
  );
}
