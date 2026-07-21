import { Check } from "lucide-react";

const STEPS = [
  { step: 1, label: "Clinic" },
  { step: 2, label: "Staff" },
  { step: 3, label: "Credentials" },
  { step: 4, label: "Checklist" },
  { step: 5, label: "Scan" },
  { step: 6, label: "Done" },
];

export function WizardProgress({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => {
          const isCompleted = currentStep > s.step;
          const isCurrent = currentStep === s.step;

          return (
            <li key={s.step} className="flex items-center">
              {i > 0 && (
                <div
                  className={`h-px w-8 sm:w-16 ${isCompleted ? "bg-[#6E97A7]" : "bg-[rgba(0,0,0,0.12)]"}`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isCompleted
                      ? "bg-[#6E97A7] text-white border-2 border-[#6E97A7]"
                      : isCurrent
                        ? "bg-[#FFF8F2] text-[#6E97A7] border-2 border-[#6E97A7]"
                        : "bg-transparent text-[rgba(0,0,0,0.55)] border-2 border-[rgba(0,0,0,0.12)]"
                  }`}
                >
                  {isCompleted ? <Check className="size-4" /> : s.step}
                </div>
                <span
                  className={`hidden text-xs sm:block ${isCurrent ? "text-black font-medium" : "text-[rgba(0,0,0,0.55)]"}`}
                >
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
