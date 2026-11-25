import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { findField } from "../data/careers.js";

// The backend asks the AI for exactly 6 lessons per path.
const LESSONS_PER_PATH = 6;

function specIcon(name = "") {
  const n = name.toLowerCase();
  if (n.includes("civil") || n.includes("structural")) return "foundation";
  if (n.includes("electric") || n.includes("electronic")) return "bolt";
  if (n.includes("mechanic")) return "precision_manufacturing";
  if (n.includes("chemical") || n.includes("lab")) return "science";
  if (n.includes("petroleum")) return "oil_barrel";
  if (n.includes("agric")) return "agriculture";
  if (n.includes("nurs") || n.includes("physio") || n.includes("health")) return "health_and_safety";
  if (n.includes("medic") || n.includes("pharm")) return "medical_services";
  if (n.includes("law") || n.includes("legal") || n.includes("paralegal")) return "gavel";
  if (n.includes("art") || n.includes("design") || n.includes("media")) return "palette";
  if (n.includes("data") || n.includes("software") || n.includes("comput")) return "memory";
  if (n.includes("teach") || n.includes("educat")) return "school";
  if (n.includes("business") || n.includes("finance") || n.includes("account")) return "trending_up";
  return "route";
}

export default function Specializations() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const field = findField(fieldId);
  const [custom, setCustom] = useState("");
  const [selected, setSelected] = useState(field?.specializations?.[0] || "");

  if (!field) return <Navigate to="/categories" replace />;

  function start(spec) {
    const params = new URLSearchParams({ field: field.name, spec });
    navigate(`/setup?${params.toString()}`);
  }

  const isOther = field.id === "other";

  return (
    <div className="flex flex-col w-full pb-28">
      <div className="pt-4 pb-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed mb-3 shadow-sm">
          <span className="material-symbols-outlined text-[15px] filled">auto_awesome</span>
          <span className="font-label-md text-label-md font-semibold tracking-wide">Path Finder</span>
        </div>
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight mb-2">
          {isOther ? "Choose Your Own Path" : `Choose Your ${field.name} Path`}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
          {isOther
            ? "Type the career you want to learn and we will build a curated, step-by-step roadmap for it."
            : `Select a branch of ${field.name.toLowerCase()} to start your curated, step-by-step roadmap.`}
        </p>
      </div>

      {!isOther && (
        <div className="mt-4 flex items-center justify-between px-1 mb-2">
          <span className="font-label-md text-label-md text-on-surface-variant font-medium">
            {field.specializations.length} Specializations Available
          </span>
        </div>
      )}

      <div aria-label={`${field.name} Specializations`} className="flex flex-col gap-3.5 mt-1" role="radiogroup">
        {field.specializations.map((spec, index) => {
          const isSelected = selected === spec;
          return (
            <div
              key={spec}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => setSelected(spec)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelected(spec);
              }}
              className={`path-card relative rounded-2xl p-4 bg-surface-container-lowest transition-all duration-200 cursor-pointer overflow-hidden ${
                isSelected ? "shadow-md ring-2 ring-secondary" : "shadow-sm hover:shadow-md"
              }`}
            >
              {isSelected && (
                <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-secondary/5 rounded-full pointer-events-none" />
              )}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      isSelected ? "bg-secondary-fixed text-secondary" : "bg-surface-container text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[26px]">{specIcon(spec)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">{spec}</h3>
                      {index === 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
                          Popular for beginners
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-on-surface-variant font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[14px]">menu_book</span>
                      <span>{LESSONS_PER_PATH} lessons</span>
                      <span className="w-1 h-1 rounded-full bg-outline-variant" />
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span>Est. {LESSONS_PER_PATH} weeks</span>
                    </div>
                  </div>
                </div>
                <div
                  className={`select-indicator w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                    isSelected ? "bg-secondary text-on-secondary shadow-sm" : "bg-surface-container-high text-transparent"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                </div>
              </div>

              <p className="font-body-md text-body-md text-on-surface-variant mt-2 mb-3">{field.blurb}</p>

              <div className="rounded-xl overflow-hidden h-24 w-full relative bg-gradient-to-br from-secondary-container via-secondary to-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[40px] text-white/85">{specIcon(spec)}</span>
                <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent flex items-end p-2.5">
                  <span className="font-label-sm text-label-sm text-on-secondary font-medium backdrop-blur-md bg-primary-container/40 px-2 py-0.5 rounded-md">
                    {spec}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isOther && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) start(custom.trim());
          }}
        >
          <div className="relative w-full shadow-sm rounded-xl bg-surface-container-lowest">
            <div className="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-secondary">
              <span className="material-symbols-outlined text-[22px]">edit</span>
            </div>
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="For example: Pharmacist"
              maxLength={100}
              className="w-full h-12 pl-11 pr-4 bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline rounded-xl focus:outline-none focus:bg-surface-container-low transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!custom.trim()}
            className="w-full h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 shadow-md hover:bg-secondary-container disabled:opacity-50 transition-all active:scale-[0.99]"
          >
            <span>Build my learning path</span>
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        </form>
      )}

      {!isOther && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe bg-surface-container-lowest/90 backdrop-blur-xl shadow-lg">
          <div className="max-w-md mx-auto px-gutter py-3">
            <button
              type="button"
              onClick={() => start(selected)}
              className="w-full h-12 bg-secondary text-on-secondary rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md hover:bg-secondary-container active:scale-[0.99] transition-all"
            >
              <span className="truncate">Continue with {selected}</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
