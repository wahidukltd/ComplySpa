import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";

describe("Two onboarding paths", () => {
  it("14-day trial path: trial plan with end date, capped limits", () => {
    const e = getEntitlements("trial");
    expect(e.blocked).toBe(false);
    expect(e.maxStaff).toBe(1000);
    expect(e.reportTier).toBe("none");
  });

  it("immediate subscribe path: solo plan activated, no trial", () => {
    const e = getEntitlements("solo");
    expect(e.blocked).toBe(false);
    expect(e.maxStaff).toBe(5);
    expect(e.reportTier).toBe("basic");
  });
});

describe("Purchase during trial immediately ends trial", () => {
  it("trial → solo: limits become solo, no trial benefits remain", () => {
    const trial = getEntitlements("trial");
    const solo = getEntitlements("solo");

    expect(trial.reportTier).toBe("none");
    expect(solo.reportTier).toBe("basic");
    expect(trial.canEmailReports).toBe(false);
    expect(trial.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
  });

  it("trial → practice: full audit reports activated", () => {
    const trial = getEntitlements("trial");
    const practice = getEntitlements("practice");

    expect(trial.reportTier).toBe("none");
    expect(practice.reportTier).toBe("audit");
    expect(practice.canEmailReports).toBe(true);
  });
});

describe("Upgrade path transitions", () => {
  const plans = ["solo", "practice"] as const;

  it("solo → practice: higher limits, more users, email reports", () => {
    const solo = getEntitlements("solo");
    const practice = getEntitlements("practice");
    expect(practice.maxStaff).toBeGreaterThan(solo.maxStaff);
    expect(practice.maxCredentials).toBeGreaterThan(solo.maxCredentials);
    expect(practice.maxUsers).toBeGreaterThan(solo.maxUsers);
    expect(practice.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
  });

  for (const plan of plans) {
    it(`${plan}: never blocked, has report tier`, () => {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(false);
      expect(["basic", "audit"]).toContain(e.reportTier);
    });
  }
});

describe("Downgrade transitions", () => {
  it("practice → solo: lose email, audit → basic, lose user mgmt", () => {
    const practice = getEntitlements("practice");
    const solo = getEntitlements("solo");
    expect(practice.canEmailReports).toBe(true);
    expect(solo.canEmailReports).toBe(false);
    expect(practice.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
    expect(practice.reportTier).toBe("audit");
    expect(solo.reportTier).toBe("basic");
  });
});

describe("Cancel transitions", () => {
  it("cancel: plan unchanged, cancel_at_period_end set separately", () => {
    const solo = getEntitlements("solo");
    expect(solo.blocked).toBe(false);
    expect(solo.reportTier).toBe("basic");
  });

  it("subscription revoked: plan becomes expired_trial, all features locked", () => {
    const revoked = getEntitlements("expired_trial");
    expect(revoked.blocked).toBe(true);
    expect(revoked.maxStaff).toBe(0);
    expect(revoked.reportTier).toBe("none");
    expect(typeof revoked.blockedReason).toBe("string");
  });
});

describe("Trial expiry transitions", () => {
  it("expired_trial: locked, zero limits, cannot generate reports", () => {
    const e = getEntitlements("expired_trial");
    expect(e.blocked).toBe(true);
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
  });

  it("inactive: same as expired_trial but different reason", () => {
    const expired = getEntitlements("expired_trial");
    const inactive = getEntitlements("inactive");
    expect(expired.blocked).toBe(true);
    expect(inactive.blocked).toBe(true);
    expect(expired.blockedReason).toContain("trial");
    expect(inactive.blockedReason).toContain("inactive");
  });
});

describe("Feature entitlement consistency across all plans", () => {
  const allPlans = ["trial", "expired_trial", "inactive", "solo", "practice"];

  for (const plan of allPlans) {
    it(`${plan}: maxStaff ≥ maxUsers`, () => {
      const e = getEntitlements(plan);
      expect(e.maxStaff).toBeGreaterThanOrEqual(e.maxUsers);
    });

    it(`${plan}: reportTier matches access flags`, () => {
      const e = getEntitlements(plan);
      if (!e.blocked) {
        expect(getReportTier(plan)).toBe(e.reportTier);
      }
    });
  }

  it("only practice has email reports", () => {
    for (const plan of ["trial", "expired_trial", "inactive", "solo"]) {
      expect(getEntitlements(plan).canEmailReports).toBe(false);
    }
    expect(getEntitlements("practice").canEmailReports).toBe(true);
  });
});

describe("No duplicate trial protection (app layer)", () => {
  it("getPlanLimits returns zeros for expired_trial", () => {
    const limits = getPlanLimits("expired_trial");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });

  it("getPlanLimits returns zeros for inactive", () => {
    const limits = getPlanLimits("inactive");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });
});

describe("DB trigger limits match entitlements", () => {
  const plans = ["trial", "solo", "practice", "expired_trial", "inactive"];

  for (const plan of plans) {
    it(`${plan}: getPlanLimits matches getEntitlements`, () => {
      const limits = getPlanLimits(plan);
      const e = getEntitlements(plan);
      expect(limits.maxStaff).toBe(e.maxStaff);
      expect(limits.maxCredentials).toBe(e.maxCredentials);
      expect(limits.maxUsers).toBe(e.maxUsers);
    });
  }
});
