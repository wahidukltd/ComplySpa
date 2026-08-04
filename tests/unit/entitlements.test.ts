import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";
import { PlanLimitError } from "@/lib/utils/errors";

describe("Selected-plan entitlements (trial is a state, not a capability source)", () => {
  it("trial of Solo ≡ Solo: 5/50/1, basic reports, email to self, no user mgmt", () => {
    const e = getEntitlements("trial", "solo");
    expect(e.maxStaff).toBe(5);
    expect(e.maxCredentials).toBe(50);
    expect(e.maxUsers).toBe(1);
    expect(e.reportTier).toBe("basic");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(false);
    expect(e.canManageAlertRecipients).toBe(false);
    expect(e.blocked).toBe(false);
  });

  it("trial of Practice ≡ Practice: 15/300/3, audit reports, email, user mgmt", () => {
    const e = getEntitlements("trial", "practice");
    expect(e.maxStaff).toBe(15);
    expect(e.maxCredentials).toBe(300);
    expect(e.maxUsers).toBe(3);
    expect(e.reportTier).toBe("audit");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(true);
    expect(e.canManageAlertRecipients).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("trial with no/missing selected plan: treated as blocked (defense-in-depth)", () => {
    const e = getEntitlements("trial");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toBe("No plan selected");
    expect(e.maxStaff).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    const e2 = getEntitlements("trial", "garbage");
    expect(e2.blocked).toBe(true);
  });

  it("expired_trial: all zeros, blocked, none reports", () => {
    const e = getEntitlements("expired_trial");
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    expect(e.canManageUsers).toBe(false);
    expect(e.blocked).toBe(true);
    expect(typeof e.blockedReason).toBe("string");
  });

  it("inactive: all zeros, blocked, none reports", () => {
    const e = getEntitlements("inactive");
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.blocked).toBe(true);
    expect(typeof e.blockedReason).toBe("string");
  });

  it("solo: 5/50/1, basic reports, email to self, no user mgmt", () => {
    const e = getEntitlements("solo");
    expect(e.maxStaff).toBe(5);
    expect(e.maxCredentials).toBe(50);
    expect(e.maxUsers).toBe(1);
    expect(e.reportTier).toBe("basic");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(false);
    expect(e.blocked).toBe(false);
  });

  it("practice: 15/300/3, audit reports, email, user mgmt", () => {
    const e = getEntitlements("practice");
    expect(e.maxStaff).toBe(15);
    expect(e.maxCredentials).toBe(300);
    expect(e.maxUsers).toBe(3);
    expect(e.reportTier).toBe("audit");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("unknown plan: falls back to inactive+blocked", () => {
    const e = getEntitlements("garbage_plan");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toBe("Unknown plan");
    expect(e.maxStaff).toBe(0);
    expect(e.reportTier).toBe("none");
  });
});

describe("canEmailReports is derived from the report tier (single derivation point)", () => {
  it("true for every active tier, false for none", () => {
    expect(getEntitlements("solo").canEmailReports).toBe(true);
    expect(getEntitlements("practice").canEmailReports).toBe(true);
    expect(getEntitlements("trial", "solo").canEmailReports).toBe(true);
    expect(getEntitlements("trial", "practice").canEmailReports).toBe(true);
    expect(getEntitlements("expired_trial").canEmailReports).toBe(false);
    expect(getEntitlements("inactive").canEmailReports).toBe(false);
  });
});

describe("getReportTier integration", () => {
  const testCases: [string, string | null | undefined, string][] = [
    ["trial", "solo", "basic"],
    ["trial", "practice", "audit"],
    ["trial", null, "none"],
    ["expired_trial", undefined, "none"],
    ["inactive", undefined, "none"],
    ["solo", undefined, "basic"],
    ["practice", undefined, "audit"],
  ];

  for (const [plan, trialPlan, expected] of testCases) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""} → ${expected}`, () => {
      expect(getReportTier(plan, trialPlan)).toBe(expected);
    });
  }
});

describe("getPlanLimits integration", () => {
  it("solo: getPlanLimits matches getEntitlements", () => {
    const l = getPlanLimits("solo");
    const e = getEntitlements("solo");
    expect(l.maxStaff).toBe(e.maxStaff);
    expect(l.maxCredentials).toBe(e.maxCredentials);
    expect(l.maxUsers).toBe(e.maxUsers);
  });

  it("trial of solo resolves to solo limits", () => {
    const l = getPlanLimits("trial", "solo");
    expect(l.maxStaff).toBe(5);
    expect(l.maxCredentials).toBe(50);
    expect(l.maxUsers).toBe(1);
  });

  it("trial of practice resolves to practice limits", () => {
    const l = getPlanLimits("trial", "practice");
    expect(l.maxStaff).toBe(15);
    expect(l.maxCredentials).toBe(300);
    expect(l.maxUsers).toBe(3);
  });

  it("expired_trial: getPlanLimits returns zeros", () => {
    const l = getPlanLimits("expired_trial");
    expect(l.maxStaff).toBe(0);
    expect(l.maxCredentials).toBe(0);
    expect(l.maxUsers).toBe(0);
  });
});

describe("Blocked plan behavior", () => {
  it("blocked+reason covers all non-active states", () => {
    for (const plan of ["expired_trial", "inactive"]) {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(true);
      expect(typeof e.blockedReason).toBe("string");
      expect(e.blockedReason.length).toBeGreaterThan(0);
    }
  });

  it("active states never blocked", () => {
    for (const [plan, trialPlan] of [
      ["trial", "solo"],
      ["trial", "practice"],
      ["solo", undefined],
      ["practice", undefined],
    ] as const) {
      const e = getEntitlements(plan, trialPlan);
      expect(e.blocked).toBe(false);
    }
  });
});

describe("PlanLimitError", () => {
  it("three limit codes", () => {
    const codes = ["STAFF_LIMIT", "CREDENTIAL_LIMIT", "USER_LIMIT"] as const;
    for (const code of codes) {
      const err = new PlanLimitError("limit", code, 1, 5);
      expect(err.code).toBe(code);
      expect(err.name).toBe("PlanLimitError");
    }
  });
});
