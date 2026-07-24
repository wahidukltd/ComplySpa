export type Plan = "trial" | "expired_trial" | "inactive" | "solo" | "practice" | "multi_location";
export type ReportTier = "none" | "basic" | "audit" | "white_label";

export interface Entitlements {
  maxStaff: number;
  maxCredentials: number;
  maxUsers: number;
  reportTier: ReportTier;
  canEmailReports: boolean;
  canAccessAPI: boolean;
  canManageUsers: boolean;
  canManageAlertRecipients: boolean;
  hasInspectionReadiness: boolean;
  blocked: boolean;
  blockedReason?: string;
}

const ENTITLEMENTS: Record<Plan, Entitlements> = {
  trial: {
    maxStaff: 1000,
    maxCredentials: 10000,
    maxUsers: 100,
    reportTier: "none",
    canEmailReports: false,
    canAccessAPI: false,
    canManageUsers: true,
    canManageAlertRecipients: true,
    hasInspectionReadiness: true,
    blocked: false,
  },
  expired_trial: {
    maxStaff: 0,
    maxCredentials: 0,
    maxUsers: 0,
    reportTier: "none",
    canEmailReports: false,
    canAccessAPI: false,
    canManageUsers: false,
    canManageAlertRecipients: false,
    hasInspectionReadiness: false,
    blocked: true,
    blockedReason: "Your trial has expired. Choose a plan to continue.",
  },
  inactive: {
    maxStaff: 0,
    maxCredentials: 0,
    maxUsers: 0,
    reportTier: "none",
    canEmailReports: false,
    canAccessAPI: false,
    canManageUsers: false,
    canManageAlertRecipients: false,
    hasInspectionReadiness: false,
    blocked: true,
    blockedReason: "Your account is inactive. Reactivate to continue.",
  },
  solo: {
    maxStaff: 5,
    maxCredentials: 50,
    maxUsers: 1,
    reportTier: "basic",
    canEmailReports: false,
    canAccessAPI: false,
    canManageUsers: false,
    canManageAlertRecipients: false,
    hasInspectionReadiness: false,
    blocked: false,
  },
  practice: {
    maxStaff: 15,
    maxCredentials: 300,
    maxUsers: 3,
    reportTier: "audit",
    canEmailReports: true,
    canAccessAPI: false,
    canManageUsers: true,
    canManageAlertRecipients: true,
    hasInspectionReadiness: true,
    blocked: false,
  },
  multi_location: {
    maxStaff: 50,
    maxCredentials: 1000,
    maxUsers: 10,
    reportTier: "white_label",
    canEmailReports: true,
    canAccessAPI: true,
    canManageUsers: true,
    canManageAlertRecipients: true,
    hasInspectionReadiness: true,
    blocked: false,
  },
};

export function getEntitlements(plan: string): Entitlements {
  return ENTITLEMENTS[plan as Plan] ?? { ...ENTITLEMENTS.inactive, blockedReason: "Unknown plan" };
}

export function getReportTier(plan: string): ReportTier {
  return getEntitlements(plan).reportTier;
}
