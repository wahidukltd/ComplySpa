import { Loader2 } from "lucide-react";

export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading onboarding">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading onboarding...</span>
    </div>
  );
}
