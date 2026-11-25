import { useNavigate } from "react-router-dom";

export default function CareerIntent() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-full pb-margin-lg">
      <div className="flex flex-col gap-space-xs pt-space-md mb-space-lg">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-label-md text-secondary font-semibold uppercase tracking-wider">Step 1 of 2</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Onboarding</span>
        </div>
        <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
          <div className="h-full bg-secondary rounded-full w-1/2 transition-all duration-500 ease-out" />
        </div>
      </div>

      <div className="relative w-full rounded-2xl bg-surface-container-low p-space-md flex items-center gap-space-md mb-space-lg overflow-hidden shadow-sm">
        <div className="relative z-10 flex-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed mb-space-xs">
            <span className="material-symbols-outlined text-sm filled">auto_awesome</span>
            <span className="font-label-sm text-label-sm font-semibold">Personalized Guidance</span>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface leading-tight">
            Do you have a career in mind?
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
            Whether you know your exact goal or want to explore fresh opportunities across any industry, we will
            guide you step by step.
          </p>
        </div>
        <div className="relative w-20 h-20 rounded-2xl shrink-0 overflow-hidden shadow-sm bg-gradient-to-br from-secondary-container to-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-[36px] text-on-secondary filled">school</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-md">
        <button
          type="button"
          onClick={() => navigate("/categories")}
          className="group relative w-full text-left bg-surface-container-lowest p-space-lg rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] focus:outline-none"
        >
          <div className="flex items-start gap-space-md">
            <div className="w-14 h-14 rounded-2xl bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed shadow-sm group-hover:scale-105 group-hover:bg-secondary group-hover:text-on-secondary transition-all duration-200">
              <span className="material-symbols-outlined text-3xl filled">explore</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold group-hover:text-secondary transition-colors">
                  Yes, I know my career
                </h2>
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:bg-secondary group-hover:text-on-secondary transition-all">
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </div>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Pick your field, choose your specialization, and start your structured learning path right away.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-space-sm pt-space-xs">
                <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                  Structured Curricula
                </span>
                <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                  Accelerated Track
                </span>
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/assessment")}
          className="group relative w-full text-left bg-surface-container-lowest p-space-lg rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] focus:outline-none"
        >
          <div className="flex items-start gap-space-md">
            <div className="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center shrink-0 text-on-primary-fixed shadow-sm group-hover:scale-105 group-hover:bg-primary-container group-hover:text-primary-fixed transition-all duration-200">
              <span className="material-symbols-outlined text-3xl filled">psychology_alt</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold group-hover:text-secondary transition-colors">
                  Not yet, help me find one
                </h2>
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:bg-secondary group-hover:text-on-secondary transition-all">
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </div>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Answer a few quick questions about what you enjoy and get personalized career paths across
                healthcare, engineering, arts, and more.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-space-sm pt-space-xs">
                <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                  2-Min Quiz
                </span>
                <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                  Interest Matcher
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-space-lg flex flex-col items-center text-center gap-space-xs px-space-md">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined text-base">published_with_changes</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            You can change or explore new career paths anytime.
          </p>
        </div>
      </div>

      <div className="mt-space-md rounded-2xl bg-surface-container-high p-space-md flex items-center gap-space-md">
        <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-secondary shrink-0 shadow-sm">
          <span className="material-symbols-outlined text-xl">diversity_3</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-label-md text-label-md text-on-surface font-semibold">Over 140+ Career Fields</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
            From Data Science and Bio-Tech to Creative Arts
          </p>
        </div>
      </div>
    </div>
  );
}
