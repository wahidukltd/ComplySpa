import * as Sentry from "@sentry/nextjs";

export const PLAN_LIMITS: Record<string, { maxStaff: number; maxCredentials: number; maxUsers: number }> = {
  trial: { maxStaff: 5, maxCredentials: 50, maxUsers: 1 },
  solo: { maxStaff: 5, maxCredentials: 50, maxUsers: 1 },
  practice: { maxStaff: 15, maxCredentials: 300, maxUsers: 3 },
  multi_location: { maxStaff: 50, maxCredentials: 1000, maxUsers: 10 },
  expired_trial: { maxStaff: 0, maxCredentials: 0, maxUsers: 0 },
  inactive: { maxStaff: 0, maxCredentials: 0, maxUsers: 0 },
};

export function getPlanLimits(plan: string) {
  const limits = PLAN_LIMITS[plan];
  if (!limits) {
    Sentry.captureMessage(`Unknown plan: ${plan}`);
    return { maxStaff: 0, maxCredentials: 0, maxUsers: 0 };
  }
  return limits;
}
