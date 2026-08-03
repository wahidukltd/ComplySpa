import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";

describe("Downgrade reconciliation — resource limits", () => {
  it("Practice → Solo: staff drops to 5, creds to 50, users to 1", () => {
    const before = getPlanLimits("practice");
    const after = getPlanLimits("solo");
    expect(before.maxStaff).toBe(15);
    expect(after.maxStaff).toBe(5);
    expect(before.maxCredentials).toBe(300);
    expect(after.maxCredentials).toBe(50);
    expect(before.maxUsers).toBe(3);
    expect(after.maxUsers).toBe(1);
  });
});

describe("Downgrade — feature tier changes", () => {
  it("Practice → Solo: audit → basic, lose email, user mgmt, alert recipients", () => {
    const practice = getEntitlements("practice");
    const solo = getEntitlements("solo");
    expect(practice.reportTier).toBe("audit");
    expect(solo.reportTier).toBe("basic");
    expect(practice.canEmailReports).toBe(true);
    expect(solo.canEmailReports).toBe(false);
    expect(practice.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
    expect(practice.canManageAlertRecipients).toBe(true);
    expect(solo.canManageAlertRecipients).toBe(false);
  });

  it("Solo: no email, no user mgmt, no alert recipients — basic tier only", () => {
    const solo = getEntitlements("solo");
    expect(solo.canEmailReports).toBe(false);
    expect(solo.canManageUsers).toBe(false);
    expect(solo.canManageAlertRecipients).toBe(false);
    expect(solo.reportTier).toBe("basic");
  });
});

describe("Upgrade — resource restoration", () => {
  it("Solo → Practice: report tier basic→audit, email enabled, user mgmt", () => {
    const practice = getEntitlements("practice");
    expect(practice.reportTier).toBe("audit");
    expect(practice.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
    expect(practice.canManageAlertRecipients).toBe(true);
    expect(practice.maxStaff).toBeGreaterThan(getEntitlements("solo").maxStaff);
  });
});

describe("Reconciliation — RPC boundary values", () => {
  const allPlans = ["expired_trial", "inactive", "solo", "practice"] as const;

  for (const plan of allPlans) {
    it(`${plan}: limits are non-negative and consistent`, () => {
      const limits = getPlanLimits(plan);
      expect(limits.maxStaff).toBeGreaterThanOrEqual(0);
      expect(limits.maxCredentials).toBeGreaterThanOrEqual(0);
      expect(limits.maxUsers).toBeGreaterThanOrEqual(0);
      const e = getEntitlements(plan);
      expect(e.reportTier).toMatch(/^(none|basic|audit)$/);
    });
  }
});

describe("Report tier reconciliation", () => {
  it("downgrade from audit to basic: new reports are basic", () => {
    expect(getReportTier("practice")).toBe("audit");
    expect(getReportTier("solo")).toBe("basic");
  });

  it("downgrade from basic to expired_trial: no reports", () => {
    expect(getReportTier("solo")).toBe("basic");
    expect(getReportTier("expired_trial")).toBe("none");
  });
});

describe("Every plan has deterministic report tier", () => {
  const tiers: Record<string, string> = {
    trial: "audit",
    expired_trial: "none",
    inactive: "none",
    solo: "basic",
    practice: "audit",
  };

  for (const [plan, expected] of Object.entries(tiers)) {
    it(`${plan} → ${expected}`, () => {
      expect(getReportTier(plan)).toBe(expected);
    });
  }
});

