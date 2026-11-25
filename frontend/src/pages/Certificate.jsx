import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabase.js";
import Loader from "../components/Loader.jsx";

export default function Certificate() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    supabase.from("certificates").select("*").eq("id", id).single().then(({ data, error: loadError }) => {
      if (loadError || !data) setError("We could not find this certificate.");
      else setCertificate(data);
    });
  }, [id]);

  // Opened from the Download button on the certificates list.
  useEffect(() => {
    if (!certificate || params.get("print") !== "1") return undefined;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [certificate, params]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function share() {
    const url = `${window.location.origin}/certificate/${id}`;
    const text = `${certificate.holder_name} completed the ${certificate.course_title} course on PathSync.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PathSync certificate", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("Link copied to your clipboard");
    } catch (err) {
      if (err?.name !== "AbortError") setToast("Could not share on this device");
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-space-sm">
        <div className="bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-3 py-2" role="alert">
          {error}
        </div>
        <Link
          to="/certificates"
          className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center"
        >
          Back to certificates
        </Link>
      </div>
    );
  }
  if (!certificate) return <Loader />;

  const date = new Date(certificate.issued_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col w-full pb-10">
      <div className="flex items-center justify-between py-space-sm mb-space-xs no-print">
        <Link to="/certificates" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors py-1">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span className="font-label-md text-label-md">Back</span>
        </Link>
        <button
          type="button"
          onClick={share}
          className="flex items-center gap-1 text-secondary transition-colors py-1 px-space-xs rounded-lg active:scale-95 duration-150"
        >
          <span className="material-symbols-outlined text-[18px]">share</span>
          <span className="font-label-md text-label-md">Share Certificate</span>
        </button>
      </div>

      <div className="text-center mb-space-lg">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-secondary-fixed text-secondary mb-space-xs shadow-sm">
          <span className="material-symbols-outlined text-[26px] filled">verified</span>
        </div>
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">Course Completed!</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-xs mx-auto leading-relaxed">
          You completed every lesson in {certificate.specialization} and passed the final assessment.
        </p>
      </div>

      <div className="relative w-full rounded-2xl bg-surface-container-lowest shadow-xl p-space-lg mb-space-xl overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 pointer-events-none opacity-5 text-secondary flex items-center justify-center">
          <svg className="w-full h-full fill-current" viewBox="0 0 200 200" aria-hidden="true">
            <path
              d="M100 0 L123 35 L165 24 L169 68 L200 90 L181 127 L196 169 L153 179 L142 221 L100 205 L58 221 L47 179 L4 169 L19 127 L0 90 L31 68 L35 24 L77 35 Z"
              fillRule="evenodd"
            />
          </svg>
        </div>

        <div className="relative w-full rounded-xl bg-surface-container-low/40 p-space-md flex flex-col items-center text-center">
          <div className="flex items-center justify-between w-full pb-space-sm mb-space-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
              <span className="font-label-sm text-label-sm tracking-wider uppercase font-bold text-on-surface">PathSync</span>
            </div>
            <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-fixed text-secondary font-semibold">
              Verified Certificate
            </span>
          </div>

          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">
            PathSync Certificate of Completion
          </p>
          <span className="font-body-sm text-body-sm text-on-surface-variant italic mb-space-xs">This certifies that</span>
          <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold tracking-tight mb-space-xs text-secondary-container">
            {certificate.holder_name}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[280px] mb-space-sm leading-snug">
            has successfully completed the full course
          </p>

          <div className="w-full rounded-xl bg-surface-container-lowest p-space-sm shadow-sm mb-space-sm">
            <h4 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-0.5">{certificate.course_title}</h4>
            <p className="font-label-md text-label-md text-on-surface-variant">
              {certificate.specialization} • Final assessment {certificate.score}%
              {certificate.lessons_completed ? ` • ${certificate.lessons_completed} lessons` : ""}
            </p>
          </div>

          <div className="w-full pt-space-xs flex items-end justify-between text-left gap-2">
            <div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Date Issued</p>
              <p className="font-label-md text-label-md font-semibold text-on-surface">{date}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-11 h-11 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow-md">
                <span className="material-symbols-outlined text-[20px] filled">workspace_premium</span>
              </div>
              <span className="font-label-sm text-[10px] tracking-tight text-on-surface-variant mt-0.5">PATHSYNC SEAL</span>
            </div>
            <div className="text-right">
              <p className="font-label-sm text-label-sm text-on-surface-variant">Certificate ID</p>
              <p className="font-label-md text-label-md font-semibold font-mono text-on-surface break-all">
                {certificate.certificate_code}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant text-center mb-space-md">
        A PathSync certificate shows you completed every lesson in this course and passed its final assessment.
        Anyone can confirm it with the certificate ID. It is not an accredited qualification.
      </p>

      <div className="flex flex-col gap-space-sm w-full mb-space-lg no-print">
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full h-12 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-lg text-label-lg flex items-center justify-center gap-space-xs transition-all active:scale-[0.98] shadow-md"
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          <span>Download PDF</span>
        </button>
        <button
          type="button"
          onClick={share}
          className="w-full h-12 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-xs transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">share</span>
          <span>Share Achievement</span>
        </button>
        <Link
          to={`/verify/${certificate.certificate_code}`}
          className="w-full h-12 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-xs transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">verified</span>
          <span>Verify this certificate</span>
        </Link>
      </div>

      <div className="w-full text-center">
        <Link
          to="/learn"
          className="inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-secondary transition-colors py-2 px-space-sm rounded-lg"
        >
          <span className="material-symbols-outlined text-[16px]">map</span>
          <span>Return to Learning Path</span>
        </Link>
      </div>

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-inverse-surface text-inverse-on-surface px-space-md py-space-sm rounded-xl shadow-xl flex items-center gap-space-xs transition-all duration-300 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-3"
        }`}
        role="status"
      >
        <span className="material-symbols-outlined text-[20px] text-secondary-fixed">check_circle</span>
        <span className="font-body-sm text-body-sm font-medium">{toast || "Ready"}</span>
      </div>
    </div>
  );
}
