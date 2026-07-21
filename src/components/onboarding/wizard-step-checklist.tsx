"use client";

import { Button } from "@/components/ui/button";
import { CHECKLIST_ITEMS } from "@/lib/audit/checklist";


interface WizardStepChecklistProps {
  onNext: () => void;
  onBack: () => void;
}

export function WizardStepChecklist({ onNext, onBack }: WizardStepChecklistProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-black">Initial Audit Checklist</h2>
        <p className="text-sm text-[rgba(0,0,0,0.55)]">
          These 7 items are what state board inspectors ask for first. They will auto-fill from your credential data, but you can review them now.
        </p>
      </div>

      <div className="space-y-3">
        {CHECKLIST_ITEMS.map((item) => (
          <div key={item.id} className="rounded-lg border border-[rgba(0,0,0,0.12)] p-4 bg-white">
            <div className="flex items-start gap-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6E97A7] text-xs text-white font-medium">
                {item.id.replace("item", "")}
              </div>
              <div>
                <p className="text-sm font-medium text-black">{item.label}</p>
                {item.description && (
                  <p className="text-xs text-[rgba(0,0,0,0.55)] mt-0.5">{item.description}</p>
                )}
              </div>
            </div>
            {item.autoFill !== false && (
              <p className="text-xs text-[#2D5C3A] mt-2 bg-[#E8F2EB] rounded px-2 py-1 inline-block">
                Auto-fills from credential data
              </p>
            )}
            {item.autoFill === false && (
              <p className="text-xs text-[#7A4E1F] mt-2 bg-[#FBF0E0] rounded px-2 py-1 inline-block">
                Requires manual confirmation
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(0,0,0,0.12)]">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onNext}>
          Start Readiness Scan
        </Button>
      </div>
    </div>
  );
}
