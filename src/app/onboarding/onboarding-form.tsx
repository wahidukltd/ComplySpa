"use client";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export function OnboardingForm({ plan }: { plan?: string | null }) {
  return <OnboardingWizard plan={plan ?? null} />;
}
