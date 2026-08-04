export type Plan = "trial" | "expired_trial" | "inactive" | "solo" | "practice";
export type ReportTier = "none" | "basic" | "audit";

export interface Entitlements {
  maxStaff: number;
  maxCredentials: number;
  maxUsers: number;
  reportTier: ReportTier;
  canEmailReports: boolean;
  canManageUsers: boolean;
  canManageAlertRecipients: boolean;
  blocked: boolean;
  blockedReason?: string;
}

// Trial is a subscription state, not a capability source. The selected plan
// (clinics.trial_plan) carries the capabilities while plan='trial'; solo and
// practice resolve directly. canEmailReports is DERIVED here (email to self is
// available on every active plan — the report itself is the differentiator),
// never stored or set per-row.
const ENTITLEMENTS: Record<"expired_trial" | "inactive" | "solo" | "practice", Omit<Entitlements, "canEmailReports">> = {
  expired_trial: {
    maxStaff: 0,
    maxCredentials: 0,
    maxUsers: 0,
    reportTier: "none",
    canManageUsers: false,
    canManageAlertRecipients: false,
    blocked: true,
    blockedReason: "Your trial has expired. Choose a plan to continue.",
  },
  inactive: {
    maxStaff: 0,
    maxCredentials: 0,
    maxUsers: 0,
    reportTier: "none",
    canManageUsers: false,
    canManageAlertRecipients: false,
    blocked: true,
    blockedReason: "Your account is inactive. Reactivate to continue.",
  },
  solo: {
    maxStaff: 5,
    maxCredentials: 50,
    maxUsers: 1,
    reportTier: "basic",
    canManageUsers: false,
    canManageAlertRecipients: false,
    blocked: false,
  },
  practice: {
    maxStaff: 15,
    maxCredentials: 300,
    maxUsers: 3,
    reportTier: "audit",
    canManageUsers: true,
    canManageAlertRecipients: true,
    blocked: false,
  },
};

export function getEntitlements(plan: string, trialPlan?: string | null): Entitlements {
  let base: Omit<Entitlements, "canEmailReports">;

  if (plan === "trial") {
    // Trial inherits the capabilities of the plan being evaluated. The NULL
    // case is defense-in-depth only (column NOT NULL + signup gates plan
    // selection) — a trial with no selected plan is treated as blocked.
    if (trialPlan === "solo" || trialPlan === "practice") {
      base = ENTITLEMENTS[trialPlan];
    } else {
      base = { ...ENTITLEMENTS.inactive, blockedReason: "No plan selected" };
    }
  } else {
    base = ENTITLEMENTS[plan as keyof typeof ENTITLEMENTS] ?? { ...ENTITLEMENTS.inactive, blockedReason: "Unknown plan" };
  }

  return { ...base, canEmailReports: base.reportTier !== "none" };
}

export function getReportTier(plan: string, trialPlan?: string | null): ReportTier {
  return getEntitlements(plan, trialPlan).reportTier;
}
