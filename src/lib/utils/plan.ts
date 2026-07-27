import "server-only";

import { getEntitlements } from "./entitlements";

export type { Plan } from "./entitlements";

export interface PlanLimit {
  maxStaff: number;
  maxCredentials: number;
  maxUsers: number;
}

export function getPlanLimits(plan: string): PlanLimit {
  const e = getEntitlements(plan);
  return { maxStaff: e.maxStaff, maxCredentials: e.maxCredentials, maxUsers: e.maxUsers };
}
