import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import { getSheet, saveScores, submitSheet } from "../../services/schoolApi.js";

// Column order here is also the DOM order of the inputs, so Tab walks down a
// column instead of across a row.
const FIELDS = [
  { key: "ca1", label: "First CA", short: "CA 1", maxKey: "ca1_max" },
  { key: "ca2", label: "Second CA", short: "CA 2", maxKey: "ca2_max" },
  { key: "ca3", label: "Third CA", short: "CA 3", maxKey: "ca3_max" },
  { key: "exam", label: "Exam", short: "Exam", maxKey: "exam_max" },
];

const STATUS_LABEL = { draft: "Draft", submitted: "Submitted", returned: "Returned" };
const STATUS_TONE = {
  draft: "bg-surface-container-high text-on-surface-variant",
  submitted: "bg-primary text-on-primary",
  returned: "bg-secondary text-on-secondary",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "missing", label: "Missing" },
  { key: "entered", label: "Entered" },
];

const toText = (value) => (value === null || value === undefined ? "" : String(value));
const filled = (text) => text !== "" && text !== null && text !== undefined;

function toNumber(text) {
  if (!filled(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function isOutOfRange(text, max) {
  if (!filled(text)) return false;
  const value = Number(text);
  return !Number.isFinite(value) || value < 0 || value > max;
}

function rowTotal(entry) {
  let total = 0;
  let any = false;
  FIELDS.forEach((field) => {
    const value = toNumber(entry[field.key]);
    if (value === null) return;
    total += value;
    any = true;
  });
  return any ? total : null;
}

function showTotal(total) {
  if (total === null) return "—";
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

function dateOf(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The API may return the saved row on the student or in a separate `scores`
// list; both shapes are accepted so the grid never loses a saved value.
function buildRows(payload) {
  const saved = new Map();
  (payload.scores || []).forEach((row) => {
    if (row && row.student_id) saved.set(row.student_id, row);
  });
  return (payload.students || []).map((student) => {
    const id = student.id || student.student_id;
    const source = saved.get(id) || student;
    const entry = {};
    FIELDS.forEach((field) => {
      entry[field.key] = toText(source[field.key]);
    });
    return {
      id,
      name: student.name || "",
      admission_no: student.admission_no || "",
      entry,
    };
  });
}

function isComplete(entry) {
  return FIELDS.every((field) => filled(entry[field.key]));
}

export default function ScoreEntry() {
  const { sheetId } = useParams();
  const [sheetData, setSheetData] = useState(null);
  const [students, setStudents] = useState([]);
  const [values, setValues] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const payload = await getSheet(sheetId);
      const rows = buildRows(payload);
      const next = {};
      rows.forEach((row) => {
        next[row.id] = { ...row.entry };
      });
      setSheetData(payload);
      setStudents(rows);
      setValues(next);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const config = sheetData?.config || {};
  const sheet = sheetData?.sheet || {};
  const status = String(sheet.status || "draft").toLowerCase();
  const canEdit = sheetData ? sheetData.can_edit ?? !(sheetData.locked ?? false) : false;

  const maxima = useMemo(() => {
    const map = {};
    FIELDS.forEach((field) => {
      const max = Number(config[field.maxKey]);
      map[field.key] = Number.isFinite(max) ? max : 0;
    });
    return map;
  }, [config]);

  const totalMax = Number(config.total_max) || 0;

  const entered = students.filter((student) => isComplete(values[student.id] || {})).length;
  const visible = students.filter((student) => {
    const complete = isComplete(values[student.id] || {});
    if (filter === "missing") return !complete;
    if (filter === "entered") return complete;
    return true;
  });

  const rowsWithValues = students.filter((student) =>
    FIELDS.some((field) => filled((values[student.id] || {})[field.key]))
  );

  const allEntered = students.length > 0 && entered === students.length;

  function updateValue(studentId, key, text) {
    setValues((previous) => ({
      ...previous,
      [studentId]: { ...(previous[studentId] || {}), [key]: text },
    }));
    setInlineError("");
    setNotice("");
  }

  async function handleSave() {
    setSaving(true);
    setInlineError("");
    setNotice("");
    const rows = rowsWithValues.map((student) => {
      const entry = values[student.id] || {};
      return {
        student_id: student.id,
        ca1: toNumber(entry.ca1),
        ca2: toNumber(entry.ca2),
        ca3: toNumber(entry.ca3),
        exam: toNumber(entry.exam),
      };
    });
    try {
      await saveScores(sheetId, rows);
      setNotice("Draft saved.");
    } catch (error) {
      if (error.status === 409) {
        await load({ quiet: true });
        setInlineError(error.message);
      } else {
        setInlineError(error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setInlineError("");
    setNotice("");
    try {
      await submitSheet(sheetId);
      setConfirmOpen(false);
      await load({ quiet: true });
    } catch (error) {
      setConfirmOpen(false);
      if (error.status === 409) {
        await load({ quiet: true });
        setInlineError(error.message);
      } else {
        setInlineError(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loader text="Loading score sheet..." />;

  if (loadError) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <div className="flex items-start gap-space-sm rounded-2xl border border-error bg-surface-container-lowest p-space-md">
          <span className="material-symbols-outlined text-[20px] text-error">error</span>
          <p className="font-body-sm text-body-sm text-on-surface">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg"
        >
          Try again
        </button>
      </div>
    );
  }

  const lockedDate = dateOf(sheet.submitted_at);

  return (
    <div className="flex flex-col gap-space-md pb-8">
      <header className="flex items-center gap-space-sm">
        <Link
          to="/school/teacher"
          aria-label="Back to teacher dashboard"
          className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            School Result Compiler
          </p>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface truncate">
            Score Entry
          </h1>
        </div>
        <span
          className={`shrink-0 px-3 py-1 rounded-full font-label-sm text-label-sm font-bold ${
            STATUS_TONE[status] || "bg-surface-container-high text-on-surface-variant"
          }`}
        >
          {STATUS_LABEL[status] || status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </header>

      <section className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex items-center justify-between gap-space-md">
        <div className="min-w-0">
          <p className="font-headline-sm text-headline-sm font-semibold text-on-surface truncate">
            {sheet.class_name || "Class"} · {sheet.subject_name || "Subject"}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
            {[sheet.term_name, sheet.session_name].filter(Boolean).join(" · ") || "Current term"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-headline-sm text-headline-sm font-bold text-on-surface tabular-nums">
            {entered} of {students.length} entered
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {FIELDS.map((field) => `${field.short} ${maxima[field.key] || 0}`).join(" · ")}
          </p>
        </div>
      </section>

      {!canEdit && (
        <div className="flex items-start gap-space-sm rounded-2xl border border-outline-variant bg-surface-container-low p-space-md">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">lock</span>
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg font-semibold text-on-surface">
              {STATUS_LABEL[status] || "Submitted"} scores are locked
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {lockedDate
                ? `Submitted on ${lockedDate}. Ask your form teacher for a correction if a score is wrong.`
                : "Ask your form teacher for a correction if a score is wrong."}
            </p>
          </div>
        </div>
      )}

      {inlineError && (
        <div
          role="alert"
          className="flex items-start gap-space-sm rounded-2xl border border-error bg-surface-container-lowest p-space-md"
        >
          <span className="material-symbols-outlined text-[20px] text-error">error</span>
          <p className="font-body-sm text-body-sm text-on-surface">{inlineError}</p>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="flex items-center gap-space-xs rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">check_circle</span>
          {notice}
        </p>
      )}

      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex gap-space-xs" role="group" aria-label="Filter students">
          {FILTERS.map((option) => {
            const active = filter === option.key;
            const count =
              option.key === "missing"
                ? students.length - entered
                : option.key === "entered"
                ? entered
                : students.length;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={active}
                className={`h-9 px-space-md rounded-full font-label-sm text-label-sm transition-colors ${
                  active
                    ? "bg-primary text-on-primary font-bold"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>
        <p className="font-label-sm text-label-sm text-outline">Tab moves down a column</p>
      </div>

      <div className="w-full max-w-5xl mx-auto">
        {students.length === 0 ? (
          <p className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-md font-body-sm text-body-sm text-on-surface-variant">
            No students are enrolled in this class yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-md font-body-sm text-body-sm text-on-surface-variant">
            No students match this filter.
          </p>
        ) : (
          <div className="bg-surface-container-lowest rounded-2xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <div
                role="group"
                aria-label="Score grid"
                className="flex gap-space-xs p-space-sm min-w-[600px] md:min-w-0"
              >
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="h-12 flex items-end pb-space-xs">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                      Student
                    </span>
                  </div>
                  {visible.map((student) => (
                    <div key={student.id} className="h-14 flex flex-col justify-center min-w-0 pr-space-xs">
                      <span className="font-label-lg text-label-lg text-on-surface truncate">{student.name}</span>
                      <span className="font-label-sm text-label-sm text-outline truncate">
                        {student.admission_no || "—"}
                      </span>
                    </div>
                  ))}
                </div>

                {FIELDS.map((field) => (
                  <div key={field.key} className="w-16 shrink-0 flex flex-col">
                    <div className="h-12 flex flex-col items-center justify-end pb-space-xs">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{field.short}</span>
                      <span className="font-label-sm text-label-sm text-outline">max {maxima[field.key] || 0}</span>
                    </div>
                    {visible.map((student) => {
                      const entry = values[student.id] || {};
                      const value = entry[field.key] ?? "";
                      const outOfRange = isOutOfRange(value, maxima[field.key]);
                      if (!canEdit) {
                        return (
                          <div key={student.id} className="h-14 flex items-center justify-center">
                            <span className="font-label-lg text-label-lg text-on-surface tabular-nums">
                              {filled(value) ? value : "—"}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={student.id} className="h-14 flex items-center px-0.5">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min="0"
                            max={maxima[field.key] || undefined}
                            value={value}
                            onChange={(event) => updateValue(student.id, field.key, event.target.value)}
                            aria-label={`${student.name}, ${field.label}`}
                            aria-invalid={outOfRange || undefined}
                            className={`h-11 w-full rounded-xl border bg-surface-container-lowest text-center font-label-lg text-label-lg text-on-surface tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 ${
                              outOfRange ? "border-error ring-2 ring-error" : "border-outline-variant"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div className="w-20 shrink-0 flex flex-col">
                  <div className="h-12 flex flex-col items-center justify-end pb-space-xs text-center">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Total</span>
                    <span className="font-label-sm text-label-sm text-outline leading-tight">
                      (calculated on save)
                    </span>
                  </div>
                  {visible.map((student) => {
                    const total = rowTotal(values[student.id] || {});
                    const overTotal = totalMax > 0 && total !== null && total > totalMax;
                    return (
                      <div key={student.id} className="h-14 flex items-center justify-center">
                        <span
                          aria-label={`${student.name}, Total (calculated on save)`}
                          className={`font-label-lg text-label-lg tabular-nums ${
                            overTotal ? "text-error font-bold" : "text-on-surface"
                          }`}
                        >
                          {showTotal(total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="sticky bottom-0 z-30 mt-space-sm rounded-2xl border border-outline-variant bg-surface-container-lowest/95 backdrop-blur px-space-sm pt-space-sm pb-space-sm pb-safe flex gap-space-sm shadow-md md:static md:border-0 md:bg-transparent md:shadow-none md:justify-end md:px-0 md:pb-0 md:pt-space-md">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || submitting || rowsWithValues.length === 0}
            className="flex-1 md:flex-none md:px-space-lg h-12 rounded-xl border border-outline-variant bg-surface-container-lowest font-label-lg text-label-lg text-on-surface disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || saving || !allEntered}
            className="flex-1 md:flex-none md:px-space-lg h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting..." : "Submit scores"}
          </button>
        </div>
      )}

      {!canEdit && null}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-gutter pb-safe sm:pb-0"
          onClick={() => setConfirmOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-scores-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col gap-space-sm mb-space-md sm:mb-0"
          >
            <h2 id="submit-scores-title" className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Submit these scores?
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {sheet.class_name || "This class"} · {sheet.subject_name || "this subject"} will be sent to the form
              teacher for compilation. Submitted scores are locked and cannot be edited unless the form teacher
              returns the sheet for correction.
            </p>
            <div className="flex gap-space-sm pt-space-xs">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmOpen(false)}
                className="flex-1 h-11 rounded-xl border border-outline-variant font-label-lg text-label-lg text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
