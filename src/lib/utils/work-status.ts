import type { ReadinessResult } from "@/lib/staff/readiness";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";

export type WorkStatus = "work_ready" | "in_progress" | "blocked";

/** True when the staff member's checklist has outstanding items (required or
 * optional). Single source for the "Continue onboarding" CTA rule (staff list
 * and Overview cards) — a CTA must never appear for an employee whose
 * checklist is fully addressed (e.g. In Progress from a lapsed credential).
 * Pure (no server deps) so client components can import it. */
export function hasPendingOnboardingItems(state: OnboardingStaffState): boolean {
  return state.requiredPending > 0 || state.optionalPending > 0;
}

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
