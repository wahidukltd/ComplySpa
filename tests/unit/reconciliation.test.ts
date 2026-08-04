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

  it("Trial of Practice → trial of Solo: limits follow the evaluated plan", () => {
    const before = getPlanLimits("trial", "practice");
    const after = getPlanLimits("trial", "solo");
    expect(before.maxStaff).toBe(15);
    expect(after.maxStaff).toBe(5);
    expect(before.maxCredentials).toBe(300);
    expect(after.maxCredentials).toBe(50);
    expect(before.maxUsers).toBe(3);
    expect(after.maxUsers).toBe(1);
  });
});

describe("Downgrade — feature tier changes", () => {
  it("Practice → Solo: audit → basic; email-to-self stays (report is the differentiator)", () => {
    const practice = getEntitlements("practice");
    const solo = getEntitlements("solo");
    expect(practice.reportTier).toBe("audit");
    expect(solo.reportTier).toBe("basic");
    expect(practice.canEmailReports).toBe(true);
    expect(solo.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
    expect(practice.canManageAlertRecipients).toBe(true);
    expect(solo.canManageAlertRecipients).toBe(false);
  });

  it("Solo: basic tier only — no user mgmt, no alert recipients", () => {
    const solo = getEntitlements("solo");
    expect(solo.canManageUsers).toBe(false);
    expect(solo.canManageAlertRecipients).toBe(false);
    expect(solo.reportTier).toBe("basic");
  });
});

describe("Upgrade — resource restoration", () => {
  it("Solo → Practice: report tier basic→audit, user mgmt restored", () => {
    const practice = getEntitlements("practice");
    expect(practice.reportTier).toBe("audit");
    expect(practice.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
    expect(practice.canManageAlertRecipients).toBe(true);
    expect(practice.maxStaff).toBeGreaterThan(getEntitlements("solo").maxStaff);
  });
});

describe("Reconciliation — RPC boundary values", () => {
  const allStates: [string, string | null][] = [
    ["expired_trial", null],
    ["inactive", null],
    ["solo", null],
    ["practice", null],
    ["trial", "solo"],
    ["trial", "practice"],
  ];

  for (const [plan, trialPlan] of allStates) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: limits are non-negative and consistent`, () => {
      const limits = getPlanLimits(plan, trialPlan);
      expect(limits.maxStaff).toBeGreaterThanOrEqual(0);
      expect(limits.maxCredentials).toBeGreaterThanOrEqual(0);
      expect(limits.maxUsers).toBeGreaterThanOrEqual(0);
      const e = getEntitlements(plan, trialPlan);
      expect(e.reportTier).toMatch(/^(none|basic|audit)$/);
    });
  }
});

describe("Report tier reconciliation", () => {
  it("downgrade from audit to basic: new reports are basic", () => {
    expect(getReportTier("practice")).toBe("audit");
    expect(getReportTier("solo")).toBe("basic");
    expect(getReportTier("trial", "practice")).toBe("audit");
    expect(getReportTier("trial", "solo")).toBe("basic");
  });

  it("downgrade from basic to expired_trial: no reports", () => {
    expect(getReportTier("solo")).toBe("basic");
    expect(getReportTier("expired_trial")).toBe("none");
  });
});

describe("Every state has deterministic report tier", () => {
  const tiers: [string, string | null | undefined, string][] = [
    ["trial", "solo", "basic"],
    ["trial", "practice", "audit"],
    ["expired_trial", undefined, "none"],
    ["inactive", undefined, "none"],
    ["solo", undefined, "basic"],
    ["practice", undefined, "audit"],
  ];

  for (const [plan, trialPlan, expected] of tiers) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""} → ${expected}`, () => {
      expect(getReportTier(plan, trialPlan)).toBe(expected);
    });
  }
});
