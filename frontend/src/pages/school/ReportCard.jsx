import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import {
  EmptyState,
  ErrorNote,
  SectionCard,
  StatusChip,
  dateOf,
  initials,
  number,
  ordinal,
  percentOf,
} from "../../components/school/SchoolKit.jsx";
import {
  getClassResults,
  getMyReport,
  getResponsibilities,
  getSchoolContext,
  getStudentProfile,
  listClasses,
} from "../../services/schoolApi.js";

// report_payload (students) and the class-results rows (staff) carry the same
// facts under different keys. This maps the staff shape onto the documented
// report payload so one renderer serves both.
function reportFromClassResults(school, payload, row) {
  const compilation = payload?.compilation || {};
  const klass = payload?.class || {};
  return {
    school: {
      id: school?.id,
      name: school?.name,
      address: school?.address,
      city: school?.city,
      state: school?.state,
      phone: school?.phone,
      email: school?.email,
    },
    student: {
      id: row.student_id,
      name: row.student?.name || "Student",
      admission_no: row.student?.admission_no,
      gender: row.student?.gender,
    },
    class: klass.name,
    session: payload?.session?.name,
    term: payload?.term?.name,
    status: compilation.status,
    published_at: compilation.published_at,
    config: compilation.config_snapshot,
    subjects: row.subject_results || [],
    total_score: row.total_score,
    average: row.average,
    subjects_offered: row.subjects_offered,
    subjects_passed: row.subjects_passed,
    subjects_failed: row.subjects_failed,
    position: row.position,
    class_size: compilation.class_size,
    class_average: compilation.class_average,
    incomplete: row.incomplete,
    form_teacher_remark: compilation.form_teacher_remark,
    principal_remark: row.principal_remark,
    attendance: { present: row.attendance_present, total: row.attendance_total },
  };
}

export default function ReportCard() {
  const { studentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const classParam = searchParams.get("class") || "";
  const compilationParam = searchParams.get("compilation") || "";

  const [context, setContext] = useState(null);
  const [report, setReport] = useState(null);
  const [terms, setTerms] = useState([]);
  const [selectedCompilation, setSelectedCompilation] = useState("");
  const [classOptions, setClassOptions] = useState([]);
  const [needsClass, setNeedsClass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isStudent = context?.role === "student";

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");
      setNeedsClass(false);
      try {
        const school = await getSchoolContext();
        if (!alive) return;
        setContext(school);

        if (school.role === "student") {
          const profile = await getStudentProfile();
          if (!alive) return;
          const me = profile?.student || {};
          if (studentId !== "me" && studentId !== me.id) {
            setReport(null);
            setError("This report card belongs to another student.");
            return;
          }
          const published = (profile?.results || []).filter((entry) => entry.compilation_id);
          setTerms(published);
          if (published.length === 0) {
            setReport(null);
            return;
          }
          const chosen = published.some((entry) => entry.compilation_id === compilationParam)
            ? compilationParam
            : published[0].compilation_id;
          const data = await getMyReport(chosen);
          if (!alive) return;
          setSelectedCompilation(chosen);
          setReport({ ...data, class_average: data?.class_average ?? null });
          return;
        }

        // Staff: the report is read from the class compilation they are allowed to open.
        if (!classParam) {
          let options = [];
          if (school.role === "school_admin" || school.role === "admin") {
            const payload = await listClasses();
            options = (payload?.classes || []).map((klass) => ({
              id: klass.id,
              name: klass.name,
              students: klass.students,
            }));
          } else {
            const roles = await getResponsibilities();
            options = (roles?.form_roles || []).map((role) => ({
              id: role.class_id,
              name: role.class_name,
              students: role.students,
            }));
          }
          if (!alive) return;
          setClassOptions(options);
          setNeedsClass(true);
          setReport(null);
          return;
        }

        const payload = await getClassResults(classParam);
        if (!alive) return;
        if (!payload?.compilation) {
          setReport(null);
          setError("This class has no compiled results for the current term yet.");
          return;
        }
        const row = (payload.results || []).find((entry) => entry.student_id === studentId);
        if (!row) {
          setReport(null);
          setError("That student is not in this class's compiled results.");
          return;
        }
        setReport(reportFromClassResults(school.school, payload, row));
      } catch (loadError) {
        if (alive) {
          setReport(null);
          setError(loadError.message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [studentId, classParam, compilationParam]);

  const view = useMemo(() => {
    if (!report) return null;
    const config = report.config || {};
    const subjects = report.subjects || [];
    const totalMax = Number(config.total_max) || 0;
    const attendanceTotal = Number(report.attendance?.total) || 0;
    const attendancePresent = Number(report.attendance?.present) || 0;
    const classAverage = report.class_average === null || report.class_average === undefined ? null : Number(report.class_average);
    const average = report.average === null || report.average === undefined ? null : Number(report.average);
    return {
      config,
      subjects,
      totalMax,
      ca1Max: Number(config.ca1_max) || 0,
      ca2Max: Number(config.ca2_max) || 0,
      ca3Max: Number(config.ca3_max) || 0,
      examMax: Number(config.exam_max) || 0,
      attendanceTotal,
      attendancePresent,
      attendanceRate: attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : null,
      classAverage,
      average,
      delta: average !== null && classAverage !== null ? average - classAverage : null,
      published: String(report.status || "") === "published",
    };
  }, [report]);

  function chooseCompilation(compilationId) {
    setSelectedCompilation(compilationId);
    const next = new URLSearchParams(searchParams);
    next.set("compilation", compilationId);
    setSearchParams(next, { replace: true });
  }

  if (loading) return <Loader text="Loading the report card..." />;

  if (error) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <ErrorNote message={error} />
        <Link
          to={isStudent ? "/home" : classParam ? `/school/compile/${classParam}` : "/school/teacher"}
          className="h-11 rounded-xl border border-outline-variant font-label-lg text-label-lg text-on-surface flex items-center justify-center"
        >
          {isStudent ? "Back to the main menu" : classParam ? "Back to the compilation" : "Back to the dashboard"}
        </Link>
      </div>
    );
  }

  if (needsClass) {
    return (
      <div className="flex flex-col gap-space-md pb-8">
        <header className="flex flex-col gap-1">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            {context?.school?.name || "School Result Compiler"}
          </p>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">Report cards</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Pick the class this student belongs to. The report card is read from that class&apos;s compilation.
          </p>
        </header>
        {classOptions.length === 0 ? (
          <EmptyState icon="groups" title="No classes available">
            {context?.role === "teacher"
              ? "You are not a form teacher of any class, so no compiled results are open to you."
              : "This school has no classes yet."}
          </EmptyState>
        ) : (
          <ul className="rounded-2xl bg-surface-container-lowest shadow-md overflow-hidden divide-y divide-outline-variant">
            {classOptions.map((option) => (
              <li key={option.id}>
                <Link
                  to={`/school/report/${studentId}?class=${option.id}`}
                  className="flex items-center gap-space-sm px-space-md py-3 hover:bg-surface-container-low transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-label-lg text-label-lg text-on-surface font-semibold truncate">
                      {option.name || "Class"}
                    </span>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant">
                      {option.students ? `${option.students} students` : "Roster"}
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">chevron_right</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <EmptyState
          icon="assignment"
          title="No published results yet"
          action={
            <Link
              to="/home"
              className="h-10 px-space-md rounded-xl border border-outline-variant font-label-sm text-label-sm text-on-surface flex items-center"
            >
              Back to the main menu
            </Link>
          }
        >
          {isStudent
            ? "Your school has not published a report card for this account. Check again after the term is released."
            : "There is no report card to show for this selection."}
        </EmptyState>
      </div>
    );
  }

  const student = report.student || {};
  const school = report.school || {};

  return (
    <div className="ps-print-sheet flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      <div className="w-full rounded-2xl bg-surface-container px-space-md py-space-sm flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm min-w-0">
          <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
          <span className="truncate">
            Official record · {view.published ? "Certified terminal gazette" : "Internal preview"}
          </span>
        </div>
        <StatusChip status={report.status} className="shrink-0" />
      </div>

      <SectionCard className="ps-print-break flex flex-col gap-space-md">
        <div className="flex items-start gap-space-md">
          <div className="w-14 h-14 shrink-0 rounded-lg bg-surface-container-low flex items-center justify-center font-headline-sm text-headline-sm font-bold text-primary">
            {initials(school.name)}
          </div>
          <div className="min-w-0">
            <div className="inline-flex flex-wrap items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                Accredited institution
              </span>
              {(school.city || school.state) && (
                <>
                  <span className="text-outline-variant font-body-sm">•</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {[school.city, school.state].filter(Boolean).join(", ")}
                  </span>
                </>
              )}
            </div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface leading-tight">
              {school.name || "Your school"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Continuous Assessment &amp; Terminal Examination Report Sheet
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface font-semibold">
            <span className="material-symbols-outlined text-primary text-[16px]">calendar_today</span>
            {[report.term, report.session].filter(Boolean).join(" · ") || "Current term"}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant">
            {view.published ? "Final gazette" : "Preview only"}
          </span>
        </div>
      </SectionCard>

      <SectionCard className="ps-print-break flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center font-headline-sm text-headline-sm font-bold">
              {initials(student.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
                  {student.name || "Student"}
                </h2>
                <span className="material-symbols-outlined text-secondary text-[18px]">workspace_premium</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                {[
                  student.admission_no ? `ADM: ${student.admission_no}` : null,
                  student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : null,
                  report.class ? `Class: ${report.class}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Position</span>
            <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container font-headline-sm text-headline-sm font-bold leading-tight">
              {ordinal(report.position)}
              {report.class_size ? (
                <span className="font-body-sm text-body-sm font-normal"> / {report.class_size}</span>
              ) : null}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-space-xs">
          <div className="flex flex-col rounded-lg bg-surface-container-low p-space-sm min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Student avg</span>
            <span className="font-headline-sm text-headline-sm text-primary font-bold mt-1 tabular-nums">
              {number(view.average)}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {view.delta !== null
                ? `${view.delta >= 0 ? "+" : ""}${number(view.delta)} vs class`
                : `Total ${number(report.total_score)}`}
            </span>
          </div>
          <div className="flex flex-col rounded-lg bg-surface-container-low p-space-sm min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Class avg</span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1 tabular-nums">
              {view.classAverage !== null ? number(view.classAverage) : "—"}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {report.class_size ? `${report.class_size} in class` : "Term average"}
            </span>
          </div>
          <div className="flex flex-col rounded-lg bg-surface-container-low p-space-sm min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {view.attendanceRate !== null ? "Attendance" : "Passed"}
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1 tabular-nums">
              {view.attendanceRate !== null
                ? `${view.attendanceRate.toFixed(1)}%`
                : `${report.subjects_passed ?? "—"}/${report.subjects_offered ?? view.subjects.length}`}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {view.attendanceRate !== null
                ? `${view.attendancePresent} of ${view.attendanceTotal} days`
                : "Subjects passed"}
            </span>
          </div>
        </div>

        {view.published && report.published_at && (
          <div className="flex items-center justify-between rounded-lg bg-surface-container px-space-md py-space-sm">
            <span className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface">
              <span className="material-symbols-outlined text-secondary text-[16px]">event_upcoming</span>
              Published on
            </span>
            <span className="font-label-sm text-label-sm font-bold text-primary">{dateOf(report.published_at)}</span>
          </div>
        )}

        {report.incomplete && (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2 py-1.5 font-label-sm text-label-sm text-secondary">
            <span className="material-symbols-outlined text-[16px]">info</span>
            Some subject scores were missing when this result was compiled.
          </p>
        )}
      </SectionCard>

      <div className="flex flex-col gap-space-xs ps-print-break">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[18px]">analytics</span>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Academic performance</h2>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {view.subjects.length} {view.subjects.length === 1 ? "course" : "courses"}
          </span>
        </div>

        <div className="w-full overflow-hidden rounded-2xl bg-surface-container-lowest shadow-md">
          <div className="px-space-md py-2.5 bg-surface-container-low flex items-center justify-between gap-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">
              Continuous assessment &amp; exam
            </span>
            <span className="font-label-sm text-label-sm text-secondary flex items-center gap-0.5 shrink-0">
              <span className="material-symbols-outlined text-[14px]">swipe</span>
              Swipe table
            </span>
          </div>
          {view.subjects.length === 0 ? (
            <p className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface-variant">
              No subject results were recorded for this term.
            </p>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="bg-surface-container-low/60 text-on-surface-variant font-label-sm text-label-sm">
                    <th scope="col" className="py-2.5 pl-4 pr-3 font-semibold">Subject</th>
                    <th scope="col" className="py-2.5 px-2 text-right font-semibold">
                      CA1
                      {view.ca1Max > 0 && <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">{number(view.ca1Max)}</span>}
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right font-semibold">
                      CA2
                      {view.ca2Max > 0 && <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">{number(view.ca2Max)}</span>}
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right font-semibold">
                      CA3
                      {view.ca3Max > 0 && <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">{number(view.ca3Max)}</span>}
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-right font-semibold">
                      Exam
                      {view.examMax > 0 && <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">{number(view.examMax)}</span>}
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right font-bold text-on-surface">
                      Total
                      {view.totalMax > 0 && <span className="block font-label-sm text-label-sm text-primary font-semibold">{number(view.totalMax)}</span>}
                    </th>
                    <th scope="col" className="py-2.5 px-2 text-center font-semibold">Grade</th>
                    <th scope="col" className="py-2.5 px-2 text-center font-semibold">Rank</th>
                    <th scope="col" className="py-2.5 pr-4 pl-2 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="text-body-sm font-body-sm text-on-surface">
                  {view.subjects.map((row) => (
                    <tr key={row.subject_id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-3 pl-4 pr-3 font-label-sm text-label-sm text-on-surface font-semibold">
                        {row.subject || "Subject"}
                      </td>
                      <td className="py-3 px-2 text-right font-label-sm text-label-sm text-on-surface-variant tabular-nums">{number(row.ca1)}</td>
                      <td className="py-3 px-2 text-right font-label-sm text-label-sm text-on-surface-variant tabular-nums">{number(row.ca2)}</td>
                      <td className="py-3 px-2 text-right font-label-sm text-label-sm text-on-surface-variant tabular-nums">{number(row.ca3)}</td>
                      <td className="py-3 px-2 text-right font-label-sm text-label-sm text-on-surface-variant tabular-nums">{number(row.exam)}</td>
                      <td className="py-3 px-3 text-right font-headline-sm text-headline-sm font-bold text-primary tabular-nums">
                        {number(row.total)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-bold">
                          {row.grade || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-label-sm text-label-sm font-semibold text-secondary">
                        {ordinal(row.position)}
                      </td>
                      <td className="py-3 pr-4 pl-2 font-body-sm text-body-sm text-on-surface-variant">
                        {row.remark || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-space-md py-space-sm bg-surface-container flex flex-wrap items-center justify-between gap-space-sm text-on-surface">
            <div className="flex items-center gap-space-sm">
              <span className="font-label-sm text-label-sm font-bold">Aggregate</span>
              <span className="font-label-sm text-label-sm font-semibold text-primary tabular-nums">
                {number(report.total_score)}
                {view.totalMax > 0 ? ` / ${number(view.totalMax * view.subjects.length)}` : ""}
              </span>
            </div>
            <span className="font-label-sm text-label-sm font-semibold text-secondary">
              {report.subjects_passed ?? "—"} passed · {report.subjects_failed ?? "—"} failed
            </span>
          </div>
        </div>
      </div>

      <SectionCard className="ps-print-break flex flex-col gap-space-lg">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[18px]">draw</span>
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Institutional endorsements</h2>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
              Form teacher&apos;s assessment
            </span>
            <span className="font-label-sm text-label-sm text-secondary font-semibold">
              {view.published ? "Verified" : "Draft"}
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface italic">
            {report.form_teacher_remark
              ? `“${report.form_teacher_remark}”`
              : "No form teacher remark was recorded for this term."}
          </p>
          <div className="pt-space-xs flex items-center justify-between gap-space-sm">
            <div className="flex flex-col min-w-0">
              <span className="font-label-sm text-label-sm text-on-surface font-semibold">Form teacher</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                Class tutor • {report.class || "Class"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-primary font-label-sm text-label-sm shrink-0">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>{view.published ? "Digitally signed" : "Awaiting release"}</span>
            </div>
          </div>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">
              Principal&apos;s endorsement
            </span>
            {view.published && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-bold">
                <span className="material-symbols-outlined text-[14px]">shield</span>
                Official seal
              </span>
            )}
          </div>
          <p className="font-body-md text-body-md text-on-surface italic">
            {report.principal_remark
              ? `“${report.principal_remark}”`
              : "No principal remark was recorded for this term."}
          </p>
          <div className="pt-space-xs flex items-center justify-between gap-space-sm">
            <div className="flex flex-col min-w-0">
              <span className="font-label-sm text-label-sm text-on-surface font-semibold">Principal</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                {school.name || "The school"}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded bg-surface-container-highest text-primary font-label-sm text-label-sm font-bold uppercase shrink-0">
              {view.published ? "Sealed" : "Unsealed"}
            </span>
          </div>
        </div>
      </SectionCard>

      {isStudent && terms.length > 1 && (
        <div className="ps-print-hide flex flex-col gap-space-xs">
          <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">Other terms</h2>
          <div className="flex flex-wrap gap-space-xs">
            {terms.map((entry) => {
              const selected = entry.compilation_id === (selectedCompilation || compilationParam);
              const label = [entry.term, entry.session].filter(Boolean).join(" · ") || "Term";
              return (
                <button
                  key={entry.compilation_id}
                  type="button"
                  onClick={() => chooseCompilation(entry.compilation_id)}
                  aria-pressed={selected}
                  className={`h-9 px-space-md rounded-full font-label-sm text-label-sm ${
                    selected
                      ? "bg-primary text-on-primary font-bold"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="ps-print-hide flex flex-col gap-space-sm pt-space-xs">
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-sm shadow-md"
        >
          <span className="material-symbols-outlined text-[20px]">print</span>
          Print / Save as PDF
        </button>
        {!isStudent && classParam && (
          <Link
            to={`/school/compile/${classParam}`}
            className="w-full h-10 rounded-xl border border-outline-variant font-label-sm text-label-sm text-on-surface font-semibold flex items-center justify-center gap-space-xs"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">arrow_back</span>
            Back to the compilation
          </Link>
        )}
      </div>
    </div>
  );
}
