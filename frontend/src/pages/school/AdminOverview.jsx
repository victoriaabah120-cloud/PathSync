import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import { getClassResults, getSchoolContext, listClasses } from "../../services/schoolApi.js";
import SchoolSetup from "./SchoolSetup.jsx";

const ROLE_LABEL = {
  school_admin: "School administrator",
  admin: "School administrator",
  teacher: "Subject teacher",
  form_teacher: "Form teacher",
  student: "Student",
};

const SUBSCRIPTION_LABEL = { active: "Active", expired: "Expired", pending: "Pending" };
const SUBSCRIPTION_TONE = {
  active: "bg-primary text-on-primary",
  expired: "bg-error text-on-error",
  pending: "bg-secondary text-on-secondary",
};

// Backend compilation states folded onto the four labels the dashboard shows.
const PIPELINE_LABEL = {
  draft: "Compiled",
  submitted: "Pending",
  returned: "Pending",
  approved: "Approved",
  published: "Published",
};
const PIPELINE_TONE = {
  "Not compiled": "bg-surface-container-high text-on-surface-variant",
  Pending: "bg-surface-container-highest text-on-surface-variant",
  Compiled: "bg-surface-container-high text-on-surface",
  Approved: "bg-secondary text-on-secondary",
  Published: "bg-primary text-on-primary",
};

const BAR_TONE = {
  ok: "[&::-webkit-progress-value]:bg-secondary [&::-moz-progress-bar]:bg-secondary",
  near: "[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500",
  full: "[&::-webkit-progress-value]:bg-error [&::-moz-progress-bar]:bg-error",
};

const CONTROLS = [
  { to: "/school/manage?tab=teachers", icon: "person_add", title: "Teachers & Invites", note: "Staff accounts and assignments" },
  { to: "/school/manage?tab=classes", icon: "groups", title: "Classes & Roster", note: "Arms, students and enrolment" },
  { to: "/school/compiler", icon: "tune", title: "Grading Rules", note: "Assessment split, scale and ranking" },
  { to: "/school/approvals", icon: "campaign", title: "Publish Results", note: "Approve and release results" },
];

function humanise(value) {
  if (!value) return "Member";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateOf(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Accepts the documented `usage` block and the flat `students` block the API
// returns, so the card renders whichever shape the deployment serves.
function readUsage(context) {
  const source = context.usage || context.students || {};
  const unlimited = Boolean(source.unlimited) || context.billing_mode === "testing";
  const used = Number(source.students ?? source.used ?? 0);
  const capacity = Number(source.capacity ?? context.subscription?.student_capacity ?? 0);
  const remaining = Number(source.remaining ?? Math.max(capacity - used, 0));
  const percent =
    source.percent !== undefined && source.percent !== null
      ? Math.round(Number(source.percent))
      : capacity
      ? Math.min(Math.round((used / capacity) * 100), 100)
      : 0;
  return {
    unlimited,
    used: Number.isFinite(used) ? used : 0,
    capacity: unlimited ? 0 : Number.isFinite(capacity) ? capacity : 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    percent: Number.isFinite(percent) ? percent : 0,
  };
}

function activityLine(entry) {
  return entry.title || entry.action || entry.label || entry.summary || entry.type || "Update";
}

function activityDetail(entry) {
  return entry.detail || entry.description || entry.message || "";
}

function activityTime(entry) {
  return dateOf(entry.created_at || entry.at || entry.timestamp || entry.date);
}

export default function AdminOverview() {
  const [context, setContext] = useState(null);
  const [classes, setClasses] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const school = await getSchoolContext();
      setContext(school);

      const classPayload = await listClasses();
      const list = Array.isArray(classPayload) ? classPayload : classPayload.classes || [];
      setClasses(list);

      const statuses = await Promise.all(
        list.map(async (klass) => {
          try {
            const results = await getClassResults(klass.id);
            return [klass.id, results?.compilation?.status || null];
          } catch {
            return [klass.id, null];
          }
        })
      );
      setPipeline(Object.fromEntries(statuses));
    } catch (loadError) {
      // A school with no academic session (or no term in it) is not broken, it is
      // new: ask for the two records the rest of the module depends on instead of
      // showing a dead-end error.
      if (/academic session|term for this session/i.test(loadError.message || "")) {
        setNeedsSetup(true);
        setError("");
      } else {
        setError(loadError.message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loader text="Loading your school..." />;

  if (needsSetup) {
    return (
      <SchoolSetup
        onDone={() => {
          setNeedsSetup(false);
          load();
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-space-sm py-space-md">
        <div className="flex items-start gap-space-sm rounded-2xl border border-error bg-surface-container-lowest p-space-md">
          <span className="material-symbols-outlined text-[20px] text-error">error</span>
          <p className="font-body-sm text-body-sm text-on-surface">{error}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg"
        >
          Try again
        </button>
      </div>
    );
  }

  const usage = readUsage(context || {});
  const full = usage.capacity > 0 && usage.used >= usage.capacity;
  const nearFull = !full && usage.capacity > 0 && usage.percent >= 80;
  const barTone = full ? BAR_TONE.full : nearFull ? BAR_TONE.near : BAR_TONE.ok;

  const subscription = context?.subscription || null;
  const subscriptionState = String(subscription?.status || context?.subscription_state || "none").toLowerCase();
  const subscriptionLabel = SUBSCRIPTION_LABEL[subscriptionState] || "None";
  const subscriptionTone = SUBSCRIPTION_TONE[subscriptionState] || "bg-surface-container-high text-on-surface-variant";
  const planName = subscription?.plan_name || context?.plan?.name || "";

  const activity = Array.isArray(context?.activity) ? context.activity.slice(0, 5) : [];
  const role = context?.role;

  return (
    <div className="flex flex-col gap-space-md pb-8 w-full max-w-3xl mx-auto">
      <header className="flex flex-col gap-1">
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
          School Result Compiler
        </p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
          {context?.school?.name || "Your school"}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {ROLE_LABEL[role] || humanise(role)}
          {context?.school?.school_type ? ` · ${context.school.school_type}` : ""}
        </p>
      </header>

      <section className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col gap-space-sm">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
              Student capacity
            </h2>
            <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface tabular-nums">
              {usage.used}
              <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">
                {" "}
                {usage.unlimited ? "students" : `/ ${usage.capacity || "—"}`}
              </span>
            </p>
          </div>
          {usage.unlimited ? (
            <span className="shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold bg-surface-container-high text-on-surface-variant">
              Testing
            </span>
          ) : (
            <span
              className={`shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold ${
                full ? "bg-error text-on-error" : nearFull ? "bg-amber-500 text-black" : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {usage.percent}%
            </span>
          )}
        </div>

        {!usage.unlimited && (
          <progress
            value={usage.capacity ? Math.min(usage.used, usage.capacity) : 0}
            max={usage.capacity || 1}
            aria-label="Student capacity used"
            aria-valuetext={`${usage.used} of ${usage.capacity} students`}
            className={`h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high appearance-none [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-container-high [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full ${barTone}`}
          />
        )}

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {usage.unlimited
            ? "Subscriptions are switched off while the result compiler is being tested, so student registration is not limited by a plan."
            : usage.capacity
            ? full
              ? "Every place on this plan is taken. New students are blocked until you upgrade."
              : `${usage.remaining} of ${usage.capacity} places remaining${planName ? ` on ${planName}` : ""}.`
            : "No plan is active yet, so student registration is blocked."}
        </p>

        {!usage.unlimited && (full || nearFull || usage.capacity === 0) && (
          <Link
            to="/school/subscription"
            className="h-11 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-xs"
          >
            <span className="material-symbols-outlined text-[18px]">upgrade</span>
            {usage.capacity === 0 ? "Choose a plan" : "Upgrade plan"}
          </Link>
        )}
      </section>

      <section className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-space-sm">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Subscription</h2>
          <span className={`shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold ${subscriptionTone}`}>
            {subscriptionLabel}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-space-sm">
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Plan</dt>
            <dd className="font-label-lg text-label-lg text-on-surface truncate">
              {usage.unlimited ? "Not required while testing" : planName || "No plan"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">
              {subscriptionState === "expired" ? "Expired on" : "Renews"}
            </dt>
            <dd className="font-label-lg text-label-lg text-on-surface">
              {dateOf(subscription?.current_period_end)}
            </dd>
          </div>
        </dl>
        <Link
          to="/school/subscription"
          className="h-11 rounded-xl border border-outline-variant font-label-lg text-label-lg text-on-surface flex items-center justify-center"
        >
          {subscription ? "Manage subscription" : "See plans"}
        </Link>
      </section>

      <section className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Administrative Controls</h2>
        <div className="grid grid-cols-2 gap-space-sm md:grid-cols-4">
          {CONTROLS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-1 hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[22px] text-secondary">{item.icon}</span>
              <span className="font-label-lg text-label-lg text-on-surface font-semibold">{item.title}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant leading-tight">{item.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Compilation Pipeline</h2>
        {classes.length === 0 ? (
          <p className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-md font-body-sm text-body-sm text-on-surface-variant">
            No classes yet.{" "}
            <Link to="/school/manage?tab=classes" className="text-primary font-semibold">
              Create a class
            </Link>{" "}
            to start compiling results.
          </p>
        ) : (
          <ul className="rounded-2xl bg-surface-container-lowest shadow-md overflow-hidden divide-y divide-outline-variant">
            {classes.map((klass) => {
              const raw = pipeline[klass.id] || null;
              const label = raw ? PIPELINE_LABEL[raw] || humanise(raw) : "Not compiled";
              const tone = PIPELINE_TONE[label] || "bg-surface-container-high text-on-surface-variant";
              const students = Number(klass.students);
              return (
                <li key={klass.id}>
                  <Link
                    to={`/school/compile/${klass.id}`}
                    className="flex items-center gap-space-sm px-space-md py-3 hover:bg-surface-container-low transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-label-lg text-label-lg text-on-surface font-semibold truncate">
                        {klass.name}
                      </span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">
                        {Number.isFinite(students) && students > 0 ? `${students} students` : "Roster"}
                      </span>
                    </span>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold ${tone}`}>
                      {label}
                    </span>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">chevron_right</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {activity.length > 0 && (
        <section className="flex flex-col gap-space-sm">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Academic Activity</h2>
          <ul className="rounded-2xl bg-surface-container-lowest shadow-md overflow-hidden divide-y divide-outline-variant">
            {activity.map((entry, index) => (
              <li key={entry.id || `${activityLine(entry)}-${index}`} className="flex items-start gap-space-sm px-space-md py-3">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                  {entry.icon || "history"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-label-lg text-label-lg text-on-surface">{activityLine(entry)}</p>
                  {activityDetail(entry) && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{activityDetail(entry)}</p>
                  )}
                </div>
                <span className="shrink-0 font-label-sm text-label-sm text-outline">{activityTime(entry)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
