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

  it("Multi → Practice: staff drops to 15, creds to 300, users to 3", () => {
    const before = getPlanLimits("multi_location");
    const after = getPlanLimits("practice");
    expect(before.maxStaff).toBe(50);
    expect(after.maxStaff).toBe(15);
    expect(before.maxCredentials).toBe(1000);
    expect(after.maxCredentials).toBe(300);
    expect(before.maxUsers).toBe(10);
    expect(after.maxUsers).toBe(3);
  });

  it("Multi → Solo: limits drop to smallest paid tier", () => {
    const multi = getPlanLimits("multi_location");
    const solo = getPlanLimits("solo");
    expect(multi.maxStaff).toBeGreaterThan(solo.maxStaff);
    expect(multi.maxCredentials).toBeGreaterThan(solo.maxCredentials);
    expect(multi.maxUsers).toBeGreaterThan(solo.maxUsers);
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

  it("Multi → Practice: lose API access and white-label reports", () => {
    const multi = getEntitlements("multi_location");
    const practice = getEntitlements("practice");
    expect(multi.canAccessAPI).toBe(true);
    expect(practice.canAccessAPI).toBe(false);
    expect(multi.reportTier).toBe("white_label");
    expect(practice.reportTier).toBe("audit");
  });

  it("Multi → Solo: lose everything above basic", () => {
    const multi = getEntitlements("multi_location");
    const solo = getEntitlements("solo");
    expect(solo.canAccessAPI).toBe(false);
    expect(solo.canEmailReports).toBe(false);
    expect(solo.canManageUsers).toBe(false);
    expect(solo.canManageAlertRecipients).toBe(false);
    expect(solo.reportTier).toBe("basic");
  });
});

describe("Upgrade — resource restoration", () => {
  it("Solo → Practice: report tier basic→audit, email enabled, user mgmt", () => {
    const solo = getEntitlements("solo");
    const practice = getEntitlements("practice");
    expect(practice.reportTier).toBe("audit");
    expect(practice.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
    expect(practice.canManageAlertRecipients).toBe(true);
  });

  it("Practice → Multi: API access granted, reports become white-label", () => {
    const practice = getEntitlements("practice");
    const multi = getEntitlements("multi_location");
    expect(multi.canAccessAPI).toBe(true);
    expect(multi.reportTier).toBe("white_label");
    expect(multi.maxStaff).toBeGreaterThan(practice.maxStaff);
  });
});

describe("Reconciliation — RPC boundary values", () => {
  const allPlans = ["expired_trial", "inactive", "solo", "practice", "multi_location"] as const;

  for (const plan of allPlans) {
    it(`${plan}: limits are non-negative and consistent`, () => {
      const limits = getPlanLimits(plan);
      expect(limits.maxStaff).toBeGreaterThanOrEqual(0);
      expect(limits.maxCredentials).toBeGreaterThanOrEqual(0);
      expect(limits.maxUsers).toBeGreaterThanOrEqual(0);
      const e = getEntitlements(plan);
      expect(e.reportTier).toMatch(/^(none|basic|audit|white_label)$/);
    });
  }
});

describe("Report tier reconciliation", () => {
  it("downgrade from audit to basic: new reports are basic", () => {
    expect(getReportTier("practice")).toBe("audit");
    expect(getReportTier("solo")).toBe("basic");
  });

  it("downgrade from white_label to audit: new reports are audit", () => {
    expect(getReportTier("multi_location")).toBe("white_label");
    expect(getReportTier("practice")).toBe("audit");
  });

  it("downgrade from basic to expired_trial: no reports", () => {
    expect(getReportTier("solo")).toBe("basic");
    expect(getReportTier("expired_trial")).toBe("none");
  });
});

describe("Every plan has deterministic report tier", () => {
  const tiers: Record<string, string> = {
    trial: "none",
    expired_trial: "none",
    inactive: "none",
    solo: "basic",
    practice: "audit",
    multi_location: "white_label",
  };

  for (const [plan, expected] of Object.entries(tiers)) {
    it(`${plan} → ${expected}`, () => {
      expect(getReportTier(plan)).toBe(expected);
    });
  }
});
