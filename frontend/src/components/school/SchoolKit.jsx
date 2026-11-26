// Shared pieces for the School Result Compiler screens. The markup mirrors the
// existing school pages (AdminOverview, ScoreEntry) so the module keeps one look.
import { useEffect } from "react";

export function humanise(value) {
  if (!value) return "";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

// The backend's real compilation states: draft, submitted, returned, approved, published.
const COMPILATION_LABEL = {
  draft: "Draft",
  submitted: "Submitted",
  returned: "Returned",
  approved: "Approved",
  published: "Published",
};
const COMPILATION_TONE = {
  draft: "bg-surface-container-high text-on-surface-variant",
  submitted: "bg-secondary text-on-secondary",
  returned: "bg-error-container text-on-error-container",
  approved: "bg-primary text-on-primary",
  published: "bg-tertiary-container text-on-tertiary",
};

// The backend's real score-sheet states: draft, submitted, returned, approved.
const SHEET_LABEL = {
  not_started: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  returned: "Returned",
  approved: "Approved",
};
const SHEET_TONE = {
  not_started: "bg-surface-container-high text-on-surface-variant",
  draft: "bg-surface-container-high text-on-surface",
  submitted: "bg-primary text-on-primary",
  returned: "bg-error-container text-on-error-container",
  approved: "bg-tertiary-container text-on-tertiary",
};

export function StatusChip({ kind = "compilation", status, className = "" }) {
  const key = String(status || "").toLowerCase();
  const labels = kind === "sheet" ? SHEET_LABEL : COMPILATION_LABEL;
  const tones = kind === "sheet" ? SHEET_TONE : COMPILATION_TONE;
  const label = labels[key] || humanise(key) || "Unknown";
  const tone = tones[key] || "bg-surface-container-high text-on-surface-variant";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold ${tone} ${className}`}
    >
      {label}
    </span>
  );
}

export function SectionCard({ as: Tag = "section", className = "", children, ...rest }) {
  return (
    <Tag className={`bg-surface-container-lowest rounded-2xl p-space-md shadow-md ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ icon, title, note, action }) {
  return (
    <div className="flex items-start justify-between gap-space-sm">
      <div className="flex items-start gap-space-sm min-w-0">
        {icon && (
          <span className="w-8 h-8 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{title}</h2>
          {note && <p className="font-body-sm text-body-sm text-on-surface-variant">{note}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry, retryLabel = "Try again" }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-space-sm rounded-2xl border border-error bg-surface-container-lowest p-space-md"
    >
      <span className="material-symbols-outlined text-[20px] text-error">error</span>
      <div className="min-w-0 flex-1">
        <p className="font-body-sm text-body-sm text-on-surface break-words">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-space-sm h-9 px-space-md rounded-xl border border-outline-variant font-label-sm text-label-sm text-on-surface"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-space-xs rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm text-on-surface"
    >
      <span className="material-symbols-outlined text-[18px] text-secondary">check_circle</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function EmptyState({ icon = "info", title, children, action }) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-space-lg shadow-md flex flex-col items-start gap-space-sm">
      <span className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      {title && <p className="font-label-lg text-label-lg font-semibold text-on-surface">{title}</p>}
      {children && <p className="font-body-sm text-body-sm text-on-surface-variant">{children}</p>}
      {action}
    </div>
  );
}

/**
 * Confirmation sheet used before every approval state change. It stays open while
 * the request runs so the backend's message can be shown inside it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  busy = false,
  error = "",
  onCancel,
  onConfirm,
  children,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmTone =
    tone === "danger"
      ? "bg-error text-on-error"
      : "bg-primary text-on-primary";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-gutter pb-safe sm:pb-0"
      onClick={() => {
        if (!busy) onCancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-space-lg shadow-xl flex flex-col gap-space-sm"
      >
        <h2 id="school-confirm-title" className="font-headline-sm text-headline-sm font-bold text-on-surface">
          {title}
        </h2>
        {description && <p className="font-body-sm text-body-sm text-on-surface-variant">{description}</p>}
        {children}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container break-words"
          >
            {error}
          </p>
        )}
        <div className="flex gap-space-sm pt-space-xs">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-11 rounded-xl border border-outline-variant font-label-lg text-label-lg text-on-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 h-11 rounded-xl font-label-lg text-label-lg font-bold disabled:opacity-50 ${confirmTone}`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- formatting ----------

export function number(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(digits);
}

export function percentOf(value, maximum, digits = 1) {
  const parsed = Number(value);
  const max = Number(maximum);
  if (!Number.isFinite(parsed) || !Number.isFinite(max) || max <= 0) return "—";
  return `${((parsed / max) * 100).toFixed(digits)}%`;
}

export function ordinal(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "—";
  const whole = Math.trunc(parsed);
  const tens = whole % 100;
  if (tens >= 11 && tens <= 13) return `${whole}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[whole % 10] || "th";
  return `${whole}${suffix}`;
}

// Session and term dates are optional, so a missing range is described in words
// rather than printed as a pair of dashes.
export function dateRange(startsOn, endsOn) {
  if (!startsOn && !endsOn) return "Dates not set";
  if (startsOn && endsOn) return `${dateOf(startsOn)} – ${dateOf(endsOn)}`;
  return startsOn ? `From ${dateOf(startsOn)}` : `Until ${dateOf(endsOn)}`;
}

export function dateOf(iso, withTime = false) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
