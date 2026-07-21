import "server-only";

export const PLAN_LIMITS = {
  trial:          { maxStaff: 1000, maxCredentials: 10000, maxUsers: 100 },
  expired_trial:  { maxStaff: 0,    maxCredentials: 0,     maxUsers: 0 },
  inactive:       { maxStaff: 0,    maxCredentials: 0,     maxUsers: 0 },
  solo:           { maxStaff: 5,    maxCredentials: 50,    maxUsers: 1 },
  practice:       { maxStaff: 15,   maxCredentials: 300,   maxUsers: 3 },
  multi_location: { maxStaff: 50,   maxCredentials: 1000,  maxUsers: 10 },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;
export type PlanLimit = (typeof PLAN_LIMITS)[Plan];

export function getPlanLimits(plan: string): PlanLimit {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.inactive;
}
