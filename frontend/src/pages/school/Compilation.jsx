import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import {
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Notice,
  SectionCard,
  SectionTitle,
  StatusChip,
  dateOf,
  number,
  ordinal,
  percentOf,
} from "../../components/school/SchoolKit.jsx";
import { compileClass, getClassResults, submitResults } from "../../services/schoolApi.js";

// A sheet in either of these states has been signed by its subject teacher.
const READY_SHEET_STATES = ["submitted", "approved"];

function shortLabel(name) {
  const text = String(name || "").trim();
  if (!text) return "Subject";
  if (text.length <= 12) return text;
  return `${text.slice(0, 11)}…`;
}

function studentName(result) {
  return result?.student?.name || "Student";
}

export default function Compilation() {
  const { classId } = useParams();
  const [payload, setPayload] = useState(null);
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const data = await getClassResults(classId);
      setPayload(data);
      setRemark((current) => current || data?.compilation?.form_teacher_remark || "");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    setRemark("");
    load();
  }, [classId]);

  const compilation = payload?.compilation || null;
  const status = String(compilation?.status || "").toLowerCase();
  const subjects = payload?.subjects || [];
  const results = payload?.results || [];
  const klass = payload?.class || {};
  const session = payload?.session || {};
  const term = payload?.term || {};

  const submitted = useMemo(
    () => subjects.filter((subject) => READY_SHEET_STATES.includes(String(subject.sheet_status))).length,
    [subjects]
  );
  const pending = subjects.length - submitted;

  const stats = useMemo(() => {
    const averages = results
      .map((row) => ({ value: Number(row.average), name: studentName(row) }))
      .filter((entry) => Number.isFinite(entry.value));
    if (averages.length === 0) {
      return { peak: null, floor: null, classAverage: compilation?.class_average ?? null };
    }
    const peak = averages.reduce((best, entry) => (entry.value > best.value ? entry : best), averages[0]);
    const floor = averages.reduce((lowest, entry) => (entry.value < lowest.value ? entry : lowest), averages[0]);
    return {
      peak,
      floor,
      classAverage: compilation?.class_average ?? null,
    };
  }, [results, compilation]);

  const subjectLedger = useMemo(() => {
    if (results.length === 0) return [];
    const first = results[0]?.subject_results || [];
    return first.map((row) => ({
      subject: row.subject,
      highest: row.class_highest,
      lowest: row.class_lowest,
      average: row.class_average,
    }));
  }, [results]);

  const totalMax = Number(compilation?.config_snapshot?.total_max) || 0;
  const canCompile = subjects.length > 0 && status !== "published";
  const canSignOff = Boolean(compilation) && (status === "draft" || status === "returned");
  const canRecompile = Boolean(compilation) && ["draft", "returned"].includes(status);

  async function handleCompile() {
    setBusy("compile");
    setActionError("");
    setNotice("");
    try {
      await compileClass(classId, {
        session_id: session.id,
        term_id: term.id,
        remark,
      });
      await load({ quiet: true });
      setNotice("Results compiled. Check the registry, then sign the class off.");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleSignOff() {
    setBusy("submit");
    setActionError("");
    setNotice("");
    try {
      await submitResults(classId, { session_id: session.id, term_id: term.id });
      setConfirmSubmit(false);
      await load({ quiet: true });
      setNotice("Submitted to the school administrator for approval.");
    } catch (error) {
      setConfirmSubmit(false);
      setActionError(error.message);
    } finally {
      setBusy("");
    }
  }

  function exportSheet() {
    const header = [
      "Student",
      "Admission no",
      ...subjects.map((subject) => subject.subject || subject.name || "Subject"),
      "Total",
      "Average",
      "Position",
      "Remark",
    ];
    const body = results.map((result) => [
      studentName(result),
      result.student?.admission_no || "",
      ...subjects.map((subject) => {
        const cell = (result.subject_results || []).find((row) => row.subject_id === subject.subject_id);
        return cell ? Number(cell.total ?? 0) : "";
      }),
      Number(result.total_score ?? 0),
      Number(result.average ?? 0),
      result.position ?? "",
      result.incomplete ? "Incomplete" : "",
    ]);
    const filename = `${klass.name || "class"}-${term.name || "term"}-results`.replace(/[^a-zA-Z0-9-]+/g, "-");
    downloadWorkbook(filename, [header, ...body], klass.name || "Class sheet");
  }

  if (loading) return <Loader text="Loading class results..." />;

  if (loadError) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <ErrorNote message={loadError} onRetry={() => load()} />
        <Link
          to="/school/teacher"
          className="h-11 rounded-xl border border-outline-variant font-label-lg text-label-lg text-on-surface flex items-center justify-center"
        >
          Back to the teacher dashboard
        </Link>
      </div>
    );
  }

  const classSize = compilation?.class_size ?? results.length;

  return (
    <div className="flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      {klass.level && (
        <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant overflow-x-auto whitespace-nowrap">
          <span>{klass.level}</span>
          <span className="text-outline">/</span>
          <span className="text-on-surface font-semibold">{klass.name || "Class"}</span>
          <span className="text-outline">/</span>
          <span>Compile review</span>
        </div>
      )}

      <SectionCard className="flex flex-col gap-space-sm">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[14px]">school</span>
              {[term.name, session.name].filter(Boolean).join(" · ") || "Current term"}
            </p>
            <h1 className="mt-1 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface truncate">
              {klass.name || "Class"} · {classSize} {classSize === 1 ? "student" : "students"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {compilation
                ? `Compiled ${dateOf(compilation.compiled_at)}${compilation.submitted_at ? ` · submitted ${dateOf(compilation.submitted_at)}` : ""}`
                : "Not compiled for this term yet."}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <StatusChip status={status || "draft"} />
            <span className="font-label-sm text-label-sm text-outline">
              {subjects.length ? `${submitted}/${subjects.length} sheets in` : "No subjects"}
            </span>
          </div>
        </div>
        {results.length > 0 && (
          <button
            type="button"
            onClick={exportSheet}
            className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-outline-variant font-label-md text-label-md text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export Excel
          </button>
        )}
        {compilation?.return_reason && (
          <p className="rounded-xl bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container">
            Returned: {compilation.return_reason}
          </p>
        )}
      </SectionCard>

      <section className="grid grid-cols-2 gap-space-sm">
        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-md flex flex-col justify-between gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-secondary text-[16px]">equalizer</span>
            Class average
          </span>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-primary tabular-nums">
              {number(stats.classAverage)}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {totalMax ? percentOf(stats.classAverage, totalMax) : "of the subject total"}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-md flex flex-col justify-between gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-secondary text-[16px]">verified</span>
            Submissions
          </span>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-primary tabular-nums">
              {submitted}/{subjects.length || 0}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {pending > 0 ? `${pending} still pending` : "All subjects in"}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-md flex flex-col justify-between gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-secondary text-[16px]">military_tech</span>
            Peak score
          </span>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">
              {stats.peak ? number(stats.peak.value) : "—"}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {stats.peak ? stats.peak.name : "Not compiled"}
            </p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-md flex flex-col justify-between gap-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-secondary text-[16px]">trending_down</span>
            Floor score
          </span>
          <div>
            <p className="font-headline-md text-headline-md font-bold text-on-surface tabular-nums">
              {stats.floor ? number(stats.floor.value) : "—"}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {stats.floor ? stats.floor.name : "Not compiled"}
            </p>
          </div>
        </div>
      </section>

      <SectionCard className="flex flex-col gap-space-sm">
        <SectionTitle
          icon="fact_check"
          title="Subject sign-off checklist"
          note={
            subjects.length
              ? `${submitted} of ${subjects.length} subject sheets submitted by their teachers.`
              : "No subjects are attached to this class yet."
          }
        />
        {subjects.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Add subjects to this class from the academic overview before compiling.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-space-xs">
            {subjects.map((subject) => {
              const ready = READY_SHEET_STATES.includes(String(subject.sheet_status));
              return (
                <li
                  key={subject.id}
                  className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low px-2 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        ready ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {ready ? "check_circle" : "schedule"}
                    </span>
                    <span className="font-label-md text-label-md text-on-surface truncate">
                      {subject.name || "Subject"}
                    </span>
                  </div>
                  <StatusChip kind="sheet" status={subject.sheet_status} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {actionError && <ErrorNote message={actionError} />}
      <Notice>{notice}</Notice>

      {subjects.length > 0 && (
        <SectionCard className="flex flex-col gap-space-sm">
          <SectionTitle
            icon="gavel"
            title="Form teacher remarks & certification"
            note="The remark is stored with the compilation and appears on every report card."
          />
          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              General class trajectory & cohort moderation note
            </span>
            <textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Comment on the class's term, discipline and readiness for release."
              className="w-full rounded-xl bg-surface-container-low px-space-md py-3 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary resize-none placeholder:text-outline"
            />
          </label>
          <div className="flex items-start gap-space-sm rounded-xl bg-surface-container p-space-sm">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">lock</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {status === "published"
                ? "Published results are locked. An administrator must reopen them before anything changes."
                : "Submitting locks this ledger with the administrator. Later corrections need an administrator to reopen it."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-space-xs pt-space-xs">
            {canRecompile && (
              <button
                type="button"
                onClick={handleCompile}
                disabled={busy !== "" || !canCompile}
                className="min-h-[44px] flex-1 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold disabled:opacity-50"
              >
                {busy === "compile" ? "Compiling..." : compilation ? "Recompile with this remark" : "Compile results"}
              </button>
            )}
            {canSignOff ? (
              <button
                type="button"
                onClick={() => {
                  setActionError("");
                  setConfirmSubmit(true);
                }}
                disabled={busy !== ""}
                className="min-h-[44px] flex-[1.5] rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold disabled:opacity-50"
              >
                {busy === "submit" ? "Submitting..." : "Submit to administrator"}
              </button>
            ) : !compilation && !canRecompile ? (
              <button
                type="button"
                onClick={handleCompile}
                disabled={busy !== "" || !canCompile}
                className="min-h-[44px] flex-[1.5] rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold disabled:opacity-50"
              >
                {busy === "compile" ? "Compiling..." : "Compile results"}
              </button>
            ) : (
              <p className="min-h-[44px] flex-[1.5] rounded-xl bg-surface-container-low px-space-md flex items-center font-body-sm text-body-sm text-on-surface-variant">
                {status === "submitted"
                  ? "With the administrator for approval."
                  : status === "approved"
                  ? "Approved. The administrator publishes it next."
                  : status === "published"
                  ? "Published to report cards."
                  : "Compile the class to continue."}
              </p>
            )}
          </div>
          {pending > 0 && (
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {pending} {pending === 1 ? "subject is" : "subjects are"} still pending. Compiling may be refused until
              every score is entered.
            </p>
          )}
        </SectionCard>
      )}

      <div className="flex items-center justify-between gap-space-sm pt-space-xs">
        <div className="flex items-center gap-space-xs">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Compilation registry</h2>
          <span className="bg-surface-container text-primary font-label-sm text-label-sm font-semibold px-2 py-0.5 rounded-full">
            {results.length} {results.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState icon="calculate" title="No compiled results yet">
          {subjects.length === 0
            ? "This class has no subjects, so there is nothing to compile."
            : "Compile the class to produce ranked totals, grades and positions."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {results.map((result) => {
            const subjectsForStudent = result.subject_results || [];
            return (
              <li key={result.student_id}>
                <SectionCard className="flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-container flex items-center justify-center font-label-lg text-label-lg font-bold text-primary">
                        {result.position || "—"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
                          {studentName(result)}
                        </p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                          ADM: {result.student?.admission_no || "—"} · Rank {ordinal(result.position)} / {classSize}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-headline-md text-headline-md font-bold text-primary tabular-nums">
                        {number(result.average)}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {percentOf(result.average, totalMax)}
                      </p>
                    </div>
                  </div>

                  {result.incomplete && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2 py-1.5 font-label-sm text-label-sm text-secondary">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      Some subject scores are missing, so this student is outside the ranking.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-1.5">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Total:{" "}
                      <strong className="text-on-surface font-semibold tabular-nums">{number(result.total_score)}</strong>
                      {totalMax ? ` / ${number(totalMax * subjectsForStudent.length)}` : ""}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Passed: <strong className="text-on-surface font-semibold">{result.subjects_passed ?? "—"}</strong>{" "}
                      of {result.subjects_offered ?? subjectsForStudent.length}
                    </span>
                    <Link
                      to={`/school/report/${result.student_id}?class=${classId}`}
                      className="font-label-sm text-label-sm text-secondary font-semibold hover:underline"
                    >
                      Report card
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-space-xs">
                    {subjectsForStudent.map((row) => (
                      <span
                        key={`${result.student_id}-${row.subject_id}`}
                        className="inline-flex items-center gap-1.5 bg-surface-container px-2 py-1 rounded"
                      >
                        <span className="font-label-sm text-label-sm text-on-surface">{shortLabel(row.subject)}</span>
                        <span className="font-label-sm text-label-sm font-bold text-primary tabular-nums">
                          {number(row.total)}
                        </span>
                        <span className="px-1 rounded bg-surface-container-lowest font-label-sm text-label-sm font-bold text-secondary">
                          {row.grade || "—"}
                        </span>
                      </span>
                    ))}
                  </div>
                </SectionCard>
              </li>
            );
          })}
        </ul>
      )}

      {subjectLedger.length > 0 && (
        <SectionCard className="flex flex-col gap-space-sm">
          <SectionTitle
            icon="analytics"
            title="Subject ledger"
            note="Highest, lowest and average for each subject, recorded at compilation."
          />
          <ul className="flex flex-col divide-y divide-outline-variant">
            {subjectLedger.map((row) => (
              <li key={row.subject} className="flex items-center justify-between gap-space-sm py-2">
                <span className="font-label-md text-label-md text-on-surface truncate">{row.subject}</span>
                <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                  avg {number(row.average)} · hi {number(row.highest)} · lo {number(row.lowest)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this class to the administrator?"
        description="Signing off locks the compiled ledger. The administrator can approve it, or return it for correction."
        confirmLabel="Sign off and submit"
        busy={busy === "submit"}
        error={actionError}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={handleSignOff}
      >
        <dl className="grid grid-cols-2 gap-space-sm rounded-xl bg-surface-container-low p-space-sm">
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Class</dt>
            <dd className="font-label-lg text-label-lg text-on-surface truncate">{klass.name || "Class"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Class average</dt>
            <dd className="font-label-lg text-label-lg text-on-surface tabular-nums">{number(stats.classAverage)}</dd>
          </div>
        </dl>
      </ConfirmDialog>
    </div>
  );
}
