import { Check } from "lucide-react";

const STEPS = [
  { step: 1, label: "Clinic" },
  { step: 2, label: "Staff" },
  { step: 3, label: "Credentials" },
  { step: 4, label: "Scan" },
  { step: 5, label: "Done" },
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
                  className="h-px w-8 sm:w-16"
                  style={{ backgroundColor: isCompleted ? "#9C6B5D" : "#D9B7A7" }}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isCompleted ? "#9C6B5D" : isCurrent ? "#FFF8F2" : "transparent",
                    border: isCurrent ? "2px solid #9C6B5D" : isCompleted ? "2px solid #9C6B5D" : "2px solid #D9B7A7",
                    color: isCompleted ? "#FFFFFF" : isCurrent ? "#9C6B5D" : "#8B7D78",
                  }}
                >
                  {isCompleted ? <Check className="size-4" /> : s.step}
                </div>
                <span
                  className="hidden text-xs sm:block"
                  style={{
                    color: isCurrent ? "#3D2A25" : "#8B7D78",
                    fontWeight: isCurrent ? 500 : 400,
                  }}
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
