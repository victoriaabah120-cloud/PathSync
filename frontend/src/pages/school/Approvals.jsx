import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import {
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Notice,
  SectionCard,
  StatusChip,
  dateOf,
  number,
} from "../../components/school/SchoolKit.jsx";
import {
  approveCompilation,
  getClassResults,
  getSchoolContext,
  listClasses,
  publishCompilation,
  reopenCompilation,
  returnCompilation,
} from "../../services/schoolApi.js";

// Only these transitions exist in the backend, so only these buttons are offered.
const ACTIONS = {
  approve: {
    label: "Approve",
    icon: "check_circle",
    title: "Approve these results?",
    description: "Approval confirms the compiled ledger is correct. The class can then be published.",
    confirmLabel: "Approve results",
    tone: "primary",
  },
  publish: {
    label: "Publish",
    icon: "campaign",
    title: "Publish these results?",
    description: "Publishing releases the report cards to students and guardians. It is recorded in the audit trail.",
    confirmLabel: "Publish results",
    tone: "primary",
  },
  return: {
    label: "Return",
    icon: "undo",
    title: "Return for correction?",
    description: "The form teacher gets the class back and can correct it before resubmitting.",
    confirmLabel: "Return results",
    tone: "danger",
    needsReason: true,
  },
  reopen: {
    label: "Reopen",
    icon: "lock_open",
    title: "Reopen these results?",
    description: "Reopening withdraws the results from report cards. The form teacher signs off again, then you approve and publish.",
    confirmLabel: "Reopen results",
    tone: "danger",
    needsReason: true,
  },
};

const PRIORITY = { submitted: 0, approved: 1, returned: 2, draft: 3, published: 4 };

export default function Approvals() {
  const { classId } = useParams();
  const [context, setContext] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [itemErrors, setItemErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(null); // { action, entry }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const school = await getSchoolContext();
      setContext(school);
      const role = school?.role;
      if (role !== "school_admin" && role !== "admin") {
        setEntries([]);
        return;
      }
      const payload = await listClasses();
      const classes = Array.isArray(payload) ? payload : payload.classes || [];
      const scoped = classId ? classes.filter((klass) => klass.id === classId) : classes;
      const loaded = await Promise.all(
        scoped.map(async (klass) => {
          try {
            const results = await getClassResults(klass.id);
            return {
              klass,
              compilation: results?.compilation || null,
              results: results?.results || [],
              session: results?.session || null,
              term: results?.term || null,
              error: "",
            };
          } catch (error) {
            return { klass, compilation: null, results: [], error: error.message };
          }
        })
      );
      loaded.sort((a, b) => {
        const left = PRIORITY[String(a.compilation?.status || "")] ?? 5;
        const right = PRIORITY[String(b.compilation?.status || "")] ?? 5;
        return left - right || String(a.klass.name || "").localeCompare(String(b.klass.name || ""));
      });
      setEntries(loaded);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [classId]);

  const isAdmin = context?.role === "school_admin" || context?.role === "admin";

  const counts = useMemo(() => {
    const tally = { submitted: 0, approved: 0, published: 0, returned: 0, draft: 0, none: 0 };
    entries.forEach((entry) => {
      const key = String(entry.compilation?.status || "none");
      tally[key] = (tally[key] || 0) + 1;
    });
    return tally;
  }, [entries]);

  function openDialog(action, entry) {
    setDialog({ action, entry });
    setReason("");
    setDialogError("");
    setNotice("");
    setItemErrors((previous) => ({ ...previous, [entry.klass.id]: "" }));
  }

  async function runAction() {
    if (!dialog) return;
    const { action, entry } = dialog;
    const compilationId = entry.compilation?.id;
    if (!compilationId) return;
    setBusy(true);
    setDialogError("");
    try {
      if (action === "approve") await approveCompilation(compilationId);
      if (action === "publish") await publishCompilation(compilationId);
      if (action === "return") await returnCompilation(compilationId, reason);
      if (action === "reopen") await reopenCompilation(compilationId, reason);
      setDialog(null);
      await load();
      setNotice(
        action === "approve"
          ? `${entry.klass.name}: results approved.`
          : action === "publish"
          ? `${entry.klass.name}: results published to report cards.`
          : action === "return"
          ? `${entry.klass.name}: returned to the form teacher.`
          : `${entry.klass.name}: results reopened.`
      );
    } catch (error) {
      setDialogError(error.message);
      setItemErrors((previous) => ({ ...previous, [entry.klass.id]: error.message }));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loader text="Loading compilations..." />;

  if (loadError) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <ErrorNote message={loadError} onRetry={load} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <EmptyState
          icon="lock"
          title="Administrator approval"
          action={
            <Link
              to="/school/teacher"
              className="h-10 px-space-md rounded-xl bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center"
            >
              Back to my dashboard
            </Link>
          }
        >
          Only a school administrator can approve, publish, return or reopen compiled results.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      <header className="flex flex-col gap-1">
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
          {context?.school?.name || "School Result Compiler"}
        </p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
          Approval & publishing
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {classId
            ? "Review the compilation a form teacher submitted for this class."
            : "Approve what form teachers submitted, then publish it to report cards."}
        </p>
      </header>

      <div className="flex flex-wrap gap-space-xs">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm font-bold">
          {counts.submitted || 0} to approve
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
          {counts.approved || 0} approved
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
          {counts.published || 0} published
        </span>
        {counts.returned > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm">
            {counts.returned} returned
          </span>
        )}
      </div>

      {classId && (
        <Link to="/school/approvals" className="font-label-sm text-label-sm text-secondary font-semibold w-fit">
          View every class
        </Link>
      )}

      <Notice>{notice}</Notice>

      {entries.length === 0 ? (
        <EmptyState
          icon="done_all"
          title="No classes to review"
          action={
            <Link
              to="/school/admin"
              className="h-10 px-space-md rounded-xl border border-outline-variant font-label-sm text-label-sm text-on-surface flex items-center"
            >
              Open the admin dashboard
            </Link>
          }
        >
          {classId
            ? "That class is not in this school, or it has not been compiled for the current term."
            : "Create a class and assign a form teacher before results can be compiled."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {entries.map((entry) => {
            const { klass, compilation } = entry;
            const status = String(compilation?.status || "").toLowerCase();
            const classAverage = compilation?.class_average;
            const inlineError = itemErrors[klass.id];
            return (
              <li key={klass.id}>
                <SectionCard className="flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="min-w-0">
                      <p className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
                        {klass.name || "Class"}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {compilation?.class_size ?? entry.results.length} students
                        {entry.term?.name || entry.session?.name
                          ? ` · ${[entry.term?.name, entry.session?.name].filter(Boolean).join(" · ")}`
                          : ""}
                      </p>
                    </div>
                    <StatusChip status={status || "draft"} className="shrink-0" />
                  </div>

                  {entry.error ? (
                    <p className="rounded-xl bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container break-words">
                      {entry.error}
                    </p>
                  ) : compilation ? (
                    <dl className="grid grid-cols-3 gap-space-xs">
                      <div className="min-w-0 rounded-lg bg-surface-container-low p-space-sm">
                        <dt className="font-label-sm text-label-sm text-on-surface-variant">Average</dt>
                        <dd className="font-label-lg text-label-lg text-on-surface font-semibold tabular-nums">
                          {number(classAverage)}
                        </dd>
                      </div>
                      <div className="min-w-0 rounded-lg bg-surface-container-low p-space-sm">
                        <dt className="font-label-sm text-label-sm text-on-surface-variant">
                          {status === "published" ? "Published" : status === "approved" ? "Approved" : "Submitted"}
                        </dt>
                        <dd className="font-label-sm text-label-sm text-on-surface font-semibold">
                          {dateOf(
                            status === "published"
                              ? compilation.published_at
                              : status === "approved"
                              ? compilation.approved_at
                              : compilation.submitted_at
                          )}
                        </dd>
                      </div>
                      <div className="min-w-0 rounded-lg bg-surface-container-low p-space-sm">
                        <dt className="font-label-sm text-label-sm text-on-surface-variant">Ranked</dt>
                        <dd className="font-label-lg text-label-lg text-on-surface font-semibold tabular-nums">
                          {entry.results.length}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Not compiled for this term yet.
                    </p>
                  )}

                  {compilation?.return_reason && (
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Return reason: <span className="text-on-surface">{compilation.return_reason}</span>
                    </p>
                  )}

                  {compilation?.form_teacher_remark && (
                    <p className="rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface-variant italic line-clamp-2">
                      “{compilation.form_teacher_remark}”
                    </p>
                  )}

                  {inlineError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container break-words"
                    >
                      {inlineError}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-space-xs">
                    {compilation && status === "submitted" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDialog("approve", entry)}
                          className="min-h-[40px] px-space-md rounded-xl bg-primary text-on-primary font-label-md text-label-md font-bold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[18px]">check_circle</span>
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openDialog("return", entry)}
                          className="min-h-[40px] px-space-md rounded-xl bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[18px]">undo</span>
                          Return
                        </button>
                      </>
                    )}
                    {compilation && status === "approved" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDialog("publish", entry)}
                          className="min-h-[40px] px-space-md rounded-xl bg-primary text-on-primary font-label-md text-label-md font-bold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[18px]">campaign</span>
                          Publish
                        </button>
                        <button
                          type="button"
                          onClick={() => openDialog("reopen", entry)}
                          className="min-h-[40px] px-space-md rounded-xl bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[18px]">lock_open</span>
                          Reopen
                        </button>
                      </>
                    )}
                    {compilation && status === "published" && (
                      <button
                        type="button"
                        onClick={() => openDialog("reopen", entry)}
                        className="min-h-[40px] px-space-md rounded-xl bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock_open</span>
                        Reopen
                      </button>
                    )}
                    <Link
                      to={`/school/compile/${klass.id}`}
                      className="min-h-[40px] px-space-md rounded-xl border border-outline-variant font-label-md text-label-md text-on-surface flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">calculate</span>
                      Open compilation
                    </Link>
                  </div>
                </SectionCard>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog ? ACTIONS[dialog.action].title : ""}
        description={dialog ? ACTIONS[dialog.action].description : ""}
        confirmLabel={dialog ? ACTIONS[dialog.action].confirmLabel : "Confirm"}
        tone={dialog ? ACTIONS[dialog.action].tone : "primary"}
        busy={busy}
        error={dialogError}
        onCancel={() => {
          if (!busy) setDialog(null);
        }}
        onConfirm={runAction}
      >
        {dialog && ACTIONS[dialog.action].needsReason && (
          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Reason (recorded in the audit trail)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={400}
              className="w-full rounded-xl bg-surface-container-low px-space-md py-3 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary resize-none"
            />
          </label>
        )}
        {dialog && (
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {dialog.entry.klass.name} · {dialog.entry.results.length} ranked students
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
