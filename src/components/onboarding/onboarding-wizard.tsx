"use client";

import { useState, useEffect, useRef } from "react";
import { WizardProgress } from "./wizard-progress";
import { WizardStepClinic } from "./wizard-step-clinic";
import { WizardStepStaff } from "./wizard-step-staff";
import { WizardStepCredentials } from "./wizard-step-credentials";
import { WizardStepScan } from "./wizard-step-scan";
import { WizardStepDone } from "./wizard-step-done";

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const clinicId = useRef<string | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [credentialCount, setCredentialCount] = useState(0);

  useEffect(() => {
    if (currentStep >= 1 && currentStep <= 4) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [currentStep]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <WizardProgress currentStep={currentStep} />

      {currentStep === 1 && (
        <WizardStepClinic
          onNext={(id) => {
            clinicId.current = id;
            setCurrentStep(2);
          }}
        />
      )}

      {currentStep === 2 && (
        <WizardStepStaff
          onBack={() => setCurrentStep(1)}
          onNext={(s) => {
            setStaff(s);
            setCurrentStep(3);
          }}
        />
      )}

      {currentStep === 3 && (
        <WizardStepCredentials
          staffMembers={staff}
          onBack={() => setCurrentStep(2)}
          onNext={(count) => {
            setCredentialCount(count);
            setCurrentStep(4);
          }}
        />
      )}

      {currentStep === 4 && (
        <WizardStepScan
          onNext={() => setCurrentStep(5)}
        />
      )}

      {currentStep === 5 && (
        <WizardStepDone
          staffCount={staff.length}
          credentialCount={credentialCount}
        />
      )}
    </div>
  );
}
