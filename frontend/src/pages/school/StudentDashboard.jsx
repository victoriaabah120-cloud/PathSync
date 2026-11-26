import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import { SectionCard, SectionTitle, ErrorNote, EmptyState, Notice, dateOf, number, ordinal } from "../../components/school/SchoolKit.jsx";
import { getMyResults, getStudentProfile } from "../../services/schoolApi.js";

export default function StudentDashboard() {
  const [profile, setProfile] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, marks] = await Promise.all([getStudentProfile(), getMyResults().catch(() => ({ results: [] }))]);
      setProfile(me || null);
      setResults(markList(me, marks));
    } catch (err) {
      setError(err.message || "Your results could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loader text="Loading your results..." />;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4">
        <ErrorNote message={error} onRetry={load} />
      </div>
    );
  }

  const student = profile?.student || null;
  const klass = profile?.class || null;
  const session = profile?.session || null;
  const published = results.filter((row) => row.compilation_id);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4">
      <SectionCard>
        <p className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Student</p>
        <h1 className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">
          {student?.name || "Your profile"}
        </h1>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          {[klass?.name, student?.admission_no ? `ADM ${student.admission_no}` : "", session?.name]
            .filter(Boolean)
            .join(" · ") || "Your class and session appear here once the school enrols you."}
        </p>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          icon="school"
          title="Published results"
          note={published.length === 0 ? "Nothing published yet" : `${published.length} term${published.length === 1 ? "" : "s"}`}
        />
        {published.length === 0 ? (
          <EmptyState icon="hourglass_empty" title="No results published yet">
            Your school publishes results at the end of a term. When yours is ready it appears here and you can open
            the report card.
          </EmptyState>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {published.map((row) => (
              <li
                key={row.compilation_id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                      {row.term || "Term"}
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {[row.session, row.published_at ? `published ${dateOf(row.published_at)}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-headline-sm text-headline-sm font-bold text-on-surface tabular-nums">
                      {row.average === undefined || row.average === null ? "—" : `${number(row.average)}%`}
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {row.position ? `${ordinal(row.position)} of ${row.class_size || "—"}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {row.subjects_offered ? `${row.subjects_offered} subjects` : ""}
                  </p>
                  <Link
                    to={`/school/report/${student?.id || ""}${klass?.id ? `?class=${klass.id}` : ""}`}
                    className="rounded-xl bg-secondary px-3.5 py-2 font-label-md text-label-md text-on-secondary"
                  >
                    Open report card
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Notice>
        You can only see your own published results. Other students, other classes and other schools are not visible
        to your account.
      </Notice>
    </div>
  );
}

/** The student profile and the marks endpoint report the same terms; merge them. */
function markList(profile, marks) {
  const detail = new Map();
  (marks?.results || []).forEach((row) => {
    if (row?.compilation_id) detail.set(row.compilation_id, row);
  });
  const base = profile?.results || [];
  const merged = base.map((row) => ({ ...row, ...(detail.get(row.compilation_id) || {}) }));
  (marks?.results || []).forEach((row) => {
    if (row?.compilation_id && !merged.some((item) => item.compilation_id === row.compilation_id)) {
      merged.push(row);
    }
  });
  return merged;
}
