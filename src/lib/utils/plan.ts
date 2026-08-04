import "server-only";

import { getEntitlements } from "./entitlements";

export type { Plan } from "./entitlements";

export interface PlanLimit {
  maxStaff: number;
  maxCredentials: number;
  maxUsers: number;
}

export function getPlanLimits(plan: string, trialPlan?: string | null): PlanLimit {
  const e = getEntitlements(plan, trialPlan);
  return { maxStaff: e.maxStaff, maxCredentials: e.maxCredentials, maxUsers: e.maxUsers };
}
