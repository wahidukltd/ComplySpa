import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";
import { PlanLimitError } from "@/lib/utils/errors";

describe("All 6 plan states", () => {
  it("trial: 1000/10000/100, none reports, user mgmt enabled", () => {
    const e = getEntitlements("trial");
    expect(e.maxStaff).toBe(1000);
    expect(e.maxCredentials).toBe(10000);
    expect(e.maxUsers).toBe(100);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    expect(e.canAccessAPI).toBe(false);
    expect(e.canManageUsers).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("expired_trial: all zeros, blocked, none reports", () => {
    const e = getEntitlements("expired_trial");
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    expect(e.canAccessAPI).toBe(false);
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

  it("solo: 5/50/1, basic reports, no email, no API", () => {
    const e = getEntitlements("solo");
    expect(e.maxStaff).toBe(5);
    expect(e.maxCredentials).toBe(50);
    expect(e.maxUsers).toBe(1);
    expect(e.reportTier).toBe("basic");
    expect(e.canEmailReports).toBe(false);
    expect(e.canAccessAPI).toBe(false);
    expect(e.canManageUsers).toBe(false);
    expect(e.blocked).toBe(false);
  });

  it("practice: 15/300/3, audit reports, email, no API", () => {
    const e = getEntitlements("practice");
    expect(e.maxStaff).toBe(15);
    expect(e.maxCredentials).toBe(300);
    expect(e.maxUsers).toBe(3);
    expect(e.reportTier).toBe("audit");
    expect(e.canEmailReports).toBe(true);
    expect(e.canAccessAPI).toBe(false);
    expect(e.canManageUsers).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("multi_location: 50/1000/10, white_label, email, API", () => {
    const e = getEntitlements("multi_location");
    expect(e.maxStaff).toBe(50);
    expect(e.maxCredentials).toBe(1000);
    expect(e.maxUsers).toBe(10);
    expect(e.reportTier).toBe("white_label");
    expect(e.canEmailReports).toBe(true);
    expect(e.canAccessAPI).toBe(true);
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

describe("getReportTier integration", () => {
  const testCases: [string, string][] = [
    ["trial", "none"],
    ["expired_trial", "none"],
    ["inactive", "none"],
    ["solo", "basic"],
    ["practice", "audit"],
    ["multi_location", "white_label"],
  ];

  for (const [plan, expected] of testCases) {
    it(`${plan} → ${expected}`, () => {
      expect(getReportTier(plan)).toBe(expected);
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

  it("active plans never blocked", () => {
    for (const plan of ["trial", "solo", "practice", "multi_location"]) {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(false);
    }
  });
});

describe("Inspection readiness feature gate", () => {
  it("only trial+practice+multi have inspection readiness", () => {
    expect(getEntitlements("trial").hasInspectionReadiness).toBe(true);
    expect(getEntitlements("solo").hasInspectionReadiness).toBe(false);
    expect(getEntitlements("practice").hasInspectionReadiness).toBe(true);
    expect(getEntitlements("multi_location").hasInspectionReadiness).toBe(true);
    expect(getEntitlements("expired_trial").hasInspectionReadiness).toBe(false);
    expect(getEntitlements("inactive").hasInspectionReadiness).toBe(false);
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
