import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { verifyCertificate } from "../services/api.js";
import ThemeToggle from "../components/ThemeToggle.jsx";
import Loader from "../components/Loader.jsx";

const dateOf = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : "";

/**
 * Public certificate check. Anyone holding a certificate ID can confirm that
 * PathSync issued it, without needing an account.
 */
export default function VerifyCertificate() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState("loading");
  const [record, setRecord] = useState(null);
  const [reason, setReason] = useState("");
  const [input, setInput] = useState(code);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setInput(code);
    verifyCertificate(code)
      .then((data) => {
        if (!alive) return;
        if (data.valid) {
          setRecord(data);
          setState("valid");
        } else {
          setReason(data.reason || "That certificate could not be verified.");
          setState("invalid");
        }
      })
      .catch((err) => {
        if (!alive) return;
        setReason(err.message);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <ThemeToggle floating />
      <div className="w-full max-w-md mx-auto flex flex-col min-h-screen pt-safe pb-safe px-gutter">
        <main className="flex-1 flex flex-col justify-center py-10">
          <div className="flex flex-col items-center text-center space-y-1 mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary-fixed text-secondary">
              <span className="material-symbols-outlined text-[26px] filled">verified</span>
            </div>
            <span className="font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight">PathSync</span>
            <p className="font-body-md text-body-md text-on-surface-variant">Certificate verification</p>
          </div>

          {state === "loading" && <Loader text="Checking that certificate..." />}

          {state === "valid" && record && (
            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-space-md">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] filled text-secondary">check_circle</span>
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface">This certificate is genuine</span>
              </div>
              <div className="rounded-xl bg-surface-container-low p-space-sm">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Awarded to</p>
                <p className="font-headline-sm text-headline-sm font-bold text-on-surface">{record.holder_name}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">for completing the full course</p>
                <p className="font-label-lg text-label-lg font-semibold text-on-surface">{record.course_title}</p>
                {record.specialization && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{record.specialization}</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-space-sm">
                <div>
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">Date issued</dt>
                  <dd className="font-label-md text-label-md font-semibold text-on-surface">{dateOf(record.issued_at)}</dd>
                </div>
                <div>
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">Final assessment</dt>
                  <dd className="font-label-md text-label-md font-semibold text-on-surface">
                    {record.score != null ? `${record.score}%` : "Passed"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">Certificate ID</dt>
                  <dd className="font-label-md text-label-md font-semibold font-mono text-on-surface break-all">
                    {record.certificate_code}
                  </dd>
                </div>
              </dl>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                PathSync issued this certificate after every lesson in the course was completed and the final
                assessment was passed. It is not an accredited qualification.
              </p>
            </div>
          )}

          {(state === "invalid" || state === "error") && (
            <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-error">error</span>
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface">Not verified</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant" role="alert">
                {reason}
              </p>
            </div>
          )}

          <form
            className="mt-space-lg w-full"
            onSubmit={(event) => {
              event.preventDefault();
              const cleaned = input.trim().toUpperCase();
              if (cleaned) navigate(`/verify/${encodeURIComponent(cleaned)}`);
            }}
          >
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="cert-code">
              Check another certificate
            </label>
            <div className="flex gap-2 mt-1.5">
              <input
                id="cert-code"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="PS-XXXXXXXXXX"
                className="flex-1 h-12 px-4 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low transition-colors font-mono"
              />
              <button
                type="submit"
                className="h-12 px-5 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold"
              >
                Check
              </button>
            </div>
          </form>

          <p className="text-center mt-space-md">
            <Link to="/login" className="font-label-md text-label-md text-secondary font-semibold">
              Back to PathSync
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
