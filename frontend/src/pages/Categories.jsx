import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FIELDS } from "../data/careers.js";

function fieldIcon(name = "") {
  const n = name.toLowerCase();
  if (n.includes("engineer")) return "precision_manufacturing";
  if (n.includes("health") || n.includes("medical") || n.includes("nurs")) return "medical_services";
  if (n.includes("law") || n.includes("legal")) return "gavel";
  if (n.includes("art") || n.includes("design") || n.includes("media") || n.includes("creative")) return "palette";
  if (n.includes("business") || n.includes("finance") || n.includes("account")) return "trending_up";
  if (n.includes("educat") || n.includes("teach")) return "school";
  if (n.includes("agri")) return "agriculture";
  if (n.includes("tech") || n.includes("data") || n.includes("comput") || n.includes("science")) return "memory";
  return "explore";
}

function fieldCategory(id = "", name = "") {
  const key = `${id} ${name}`.toLowerCase();
  if (/engineer|tech|data|comput|science|agri|manufactur/.test(key)) return "technical";
  if (/health|nurs|medic|law|legal|educat|teach|business|finance|account|public/.test(key)) return "services";
  if (/art|design|media|creative|music|fashion|film/.test(key)) return "creative";
  return "services";
}

const FILTERS = [
  { id: "all", label: "All Fields" },
  { id: "technical", label: "Technical" },
  { id: "services", label: "Services" },
  { id: "creative", label: "Creative" },
];

export default function Categories() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(FIELDS[0]?.id || "");
  const text = query.trim().toLowerCase();

  const cards = useMemo(
    () =>
      FIELDS.filter((field) => filter === "all" || fieldCategory(field.id, field.name) === filter).filter(
        (field) =>
          !text ||
          field.name.toLowerCase().includes(text) ||
          field.specializations.some((spec) => spec.toLowerCase().includes(text)),
      ),
    [filter, text],
  );

  const specMatches = useMemo(() => {
    if (!text) return [];
    return FIELDS.flatMap((field) =>
      field.specializations
        .filter((spec) => spec.toLowerCase().includes(text) || field.name.toLowerCase().includes(text))
        .map((spec) => ({ field: field.name, spec })),
    );
  }, [text]);

  const selected = FIELDS.find((field) => field.id === selectedId) || cards[0] || null;

  function openField(field) {
    setSelectedId(field.id);
    navigate(`/specializations/${field.id}`);
  }

  function pick(field, spec) {
    const params = new URLSearchParams({ field, spec });
    navigate(`/setup?${params.toString()}`);
  }

  return (
    <div className="flex flex-col w-full pb-safe">
      <section className="flex flex-col gap-space-md pt-space-md">
        <div className="relative w-full shadow-sm rounded-xl bg-surface-container-lowest">
          <label className="sr-only" htmlFor="career-search">Search careers</label>
          <div className="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-secondary">
            <span className="material-symbols-outlined text-[22px]">search</span>
          </div>
          <input
            id="career-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search careers (e.g. Civil Engineer, Nurse, Lawyer)..."
            className="w-full h-12 pl-11 pr-10 bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline rounded-xl focus:outline-none focus:bg-surface-container-low transition-colors"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear input"
              onClick={() => setQuery("")}
              className="absolute inset-y-0 right-0 pr-space-md flex items-center text-outline hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        <div aria-label="Career Categories" className="flex items-center gap-space-sm overflow-x-auto no-scrollbar py-0.5" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`px-space-md py-1.5 rounded-full font-label-md text-label-md whitespace-nowrap shadow-sm transition-all flex items-center gap-1 active:scale-95 ${
                filter === item.id
                  ? "bg-secondary text-on-secondary"
                  : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span>{item.label}</span>
              {filter === item.id && <span className="w-1.5 h-1.5 rounded-full bg-on-secondary" />}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-space-lg flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
            Explore Career Fields
          </h2>
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
            {cards.length} {cards.length === 1 ? "Field" : "Fields"}
          </span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Select any field to view specialized roles and beginner-friendly learning paths.
        </p>
      </section>

      <section className="mt-space-md relative overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm p-space-md flex items-center justify-between">
        <div className="flex flex-col gap-0.5 z-10 max-w-[65%]">
          <div className="flex items-center gap-1.5 text-secondary">
            <span className="material-symbols-outlined text-[16px] filled">auto_awesome</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">Curated Mentorship</span>
          </div>
          <p className="font-label-lg text-label-lg font-bold text-on-surface">Not sure where to begin?</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Tap any category to unlock roadmap road-tests &amp; salary estimates.
          </p>
        </div>
        <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm flex-shrink-0 relative bg-gradient-to-br from-secondary-container to-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-[28px] text-white filled">route</span>
        </div>
      </section>

      {specMatches.length > 0 && (
        <section className="mt-space-lg flex flex-col gap-space-sm">
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Matching roles</h3>
          {specMatches.slice(0, 8).map((match) => (
            <button
              key={`${match.field}-${match.spec}`}
              type="button"
              onClick={() => pick(match.field, match.spec)}
              className="group w-full text-left p-space-md rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-space-md"
            >
              <div className="min-w-0">
                <h3 className="font-label-lg text-label-lg text-on-surface font-bold group-hover:text-secondary transition-colors truncate">
                  {match.spec}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{match.field}</p>
              </div>
              <span className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:bg-secondary group-hover:text-on-secondary transition-all shrink-0">
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick("Other", query.trim())}
            className="w-full text-left p-space-md rounded-2xl bg-secondary-fixed/40 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-space-md"
          >
            <div className="min-w-0">
              <h3 className="font-label-lg text-label-lg text-on-surface font-bold truncate">Use "{query.trim()}" as my career</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Build a custom learning path</p>
            </div>
            <span className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">add</span>
            </span>
          </button>
        </section>
      )}

      <section className="mt-space-lg grid grid-cols-2 gap-space-md">
        {cards.map((field) => {
          const isSelected = selected?.id === field.id;
          return (
            <article
              key={field.id}
              onClick={() => openField(field)}
              data-title={field.name}
              className={`career-card group relative flex flex-col justify-between p-space-md rounded-2xl cursor-pointer transition-all duration-200 ${
                isSelected
                  ? "bg-gradient-to-b from-surface-container-lowest to-surface-container-low shadow-md shadow-[0_0_0_2px_#712ae2]"
                  : "bg-surface-container-lowest shadow-sm hover:shadow-md active:scale-[0.98]"
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm transition-colors ${
                    isSelected
                      ? "bg-secondary text-on-secondary"
                      : "bg-secondary-fixed text-on-secondary-fixed group-hover:bg-secondary group-hover:text-on-secondary"
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">{fieldIcon(field.name)}</span>
                </div>
                {isSelected ? (
                  <span className="w-5 h-5 rounded-full bg-secondary text-on-secondary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  </span>
                ) : (
                  <span className="text-outline font-label-sm text-label-sm">Popular</span>
                )}
              </div>
              <div className="mt-space-lg flex flex-col">
                <h3 className="font-label-lg text-label-lg text-on-surface font-bold group-hover:text-secondary transition-colors">
                  {field.name}
                </h3>
                <p className="font-body-sm text-body-sm text-secondary font-medium mt-0.5">
                  {field.specializations.length} paths available
                </p>
              </div>
              <div className="mt-space-sm pt-space-xs flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[14px]">stairs</span>
                <span className="truncate">{field.specializations.slice(0, 3).join(", ")}</span>
              </div>
            </article>
          );
        })}
      </section>

      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-space-xl text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-secondary mb-space-sm">
            <span className="material-symbols-outlined text-[32px]">travel_explore</span>
          </div>
          <p className="font-headline-sm text-headline-sm text-on-surface font-bold">No career matches</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-xs">
            We couldn't find anything matching your search. Try checking a broader category or exploring all fields.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-space-md px-space-md py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-label-md shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      )}

      {selected && (
        <div className="sticky bottom-4 mt-space-xl z-30 px-space-xs">
          <div className="w-full bg-surface-container-lowest/90 backdrop-blur-xl p-space-sm rounded-2xl shadow-xl flex items-center justify-between gap-space-md">
            <div className="flex items-center gap-2 pl-space-sm min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse shrink-0" />
              <span className="font-label-md text-label-md font-semibold text-on-surface truncate">{selected.name}</span>
            </div>
            <button
              type="button"
              onClick={() => openField(selected)}
              className="h-12 px-space-lg rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>View Paths</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
