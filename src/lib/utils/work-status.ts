import type { ReadinessResult } from "@/lib/staff/readiness";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";

export type WorkStatus = "work_ready" | "in_progress" | "blocked";

export const WORK_STATUS_META: Record<
  WorkStatus,
  { label: string; color: string; icon: "check" | "alert" | "warning" }
> = {
  work_ready: { label: "Work Ready", color: "text-[#4A8C5C]", icon: "check" },
  in_progress: { label: "In Progress", color: "text-[#C2853A]", icon: "alert" },
  blocked: { label: "Blocked", color: "text-destructive font-semibold", icon: "warning" },
};

export const WORK_STATUS_FILTER: { value: WorkStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "work_ready", label: "Work Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
];

/** Work readiness is decided by the Compliance Readiness Engine; blocked is
 * decided by pending required onboarding items (blocked wins — safe direction
 * if template drift ever leaves a pending item under a ready employee). */
export function deriveWorkStatus(
  readiness: ReadinessResult,
  onboarding: OnboardingStaffState,
): WorkStatus {
  if (onboarding.requiredPending > 0) return "blocked";
  if (readiness.status === "ready") return "work_ready";
  return "in_progress";
}
