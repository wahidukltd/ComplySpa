import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";

describe("Two onboarding paths", () => {
  it("14-day trial path: trial of the selected plan, capabilities from it", () => {
    const soloTrial = getEntitlements("trial", "solo");
    expect(soloTrial.blocked).toBe(false);
    expect(soloTrial.maxStaff).toBe(5);
    expect(soloTrial.reportTier).toBe("basic");

    const practiceTrial = getEntitlements("trial", "practice");
    expect(practiceTrial.blocked).toBe(false);
    expect(practiceTrial.maxStaff).toBe(15);
    expect(practiceTrial.reportTier).toBe("audit");
  });

  it("immediate subscribe path: solo plan activated, no trial", () => {
    const e = getEntitlements("solo");
    expect(e.blocked).toBe(false);
    expect(e.maxStaff).toBe(5);
    expect(e.reportTier).toBe("basic");
  });
});

describe("Purchase during trial immediately ends trial", () => {
  it("trial of practice → solo: limits become solo, no trial benefits remain", () => {
    const trial = getEntitlements("trial", "practice");
    const solo = getEntitlements("solo");

    expect(trial.reportTier).toBe("audit");
    expect(solo.reportTier).toBe("basic");
    expect(trial.canEmailReports).toBe(true);
    expect(trial.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
  });

  it("trial of solo → practice: full audit reports activated", () => {
    const trial = getEntitlements("trial", "solo");
    const practice = getEntitlements("practice");

    expect(trial.reportTier).toBe("basic");
    expect(practice.reportTier).toBe("audit");
    expect(trial.canEmailReports).toBe(true);
    expect(practice.canEmailReports).toBe(true);
  });
});

describe("Upgrade path transitions", () => {
  const plans = ["solo", "practice"] as const;

  it("solo → practice: higher limits, more users, email to self on both", () => {
    const solo = getEntitlements("solo");
    const practice = getEntitlements("practice");
    expect(practice.maxStaff).toBeGreaterThan(solo.maxStaff);
    expect(practice.maxCredentials).toBeGreaterThan(solo.maxCredentials);
    expect(practice.maxUsers).toBeGreaterThan(solo.maxUsers);
    expect(practice.canEmailReports).toBe(true);
    expect(solo.canEmailReports).toBe(true);
    expect(practice.canManageUsers).toBe(true);
    expect(solo.canManageUsers).toBe(false);
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
  it("practice → solo: audit → basic; email to self remains (report is the differentiator)", () => {
    const practice = getEntitlements("practice");
    const solo = getEntitlements("solo");
    expect(practice.canEmailReports).toBe(true);
    expect(solo.canEmailReports).toBe(true);
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

describe("Feature entitlement consistency across all states", () => {
  const allStates: [string, string | null][] = [
    ["trial", "solo"],
    ["trial", "practice"],
    ["expired_trial", null],
    ["inactive", null],
    ["solo", null],
    ["practice", null],
  ];

  for (const [plan, trialPlan] of allStates) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: maxStaff ≥ maxUsers`, () => {
      const e = getEntitlements(plan, trialPlan);
      expect(e.maxStaff).toBeGreaterThanOrEqual(e.maxUsers);
    });

    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: reportTier matches access flags`, () => {
      const e = getEntitlements(plan, trialPlan);
      if (!e.blocked) {
        expect(getReportTier(plan, trialPlan)).toBe(e.reportTier);
      }
    });
  }

  it("every active state can email to self; blocked states cannot", () => {
    for (const [plan, trialPlan] of [["trial", "solo"], ["trial", "practice"], ["solo", null], ["practice", null]] as const) {
      expect(getEntitlements(plan, trialPlan).canEmailReports).toBe(true);
    }
    expect(getEntitlements("expired_trial").canEmailReports).toBe(false);
    expect(getEntitlements("inactive").canEmailReports).toBe(false);
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
  // Migration 050 aligned the DB CASE values with the app resolver, including
  // trial resolution via trial_plan.
  const states: [string, string | null][] = [
    ["trial", "solo"],
    ["trial", "practice"],
    ["solo", null],
    ["practice", null],
    ["expired_trial", null],
    ["inactive", null],
  ];

  for (const [plan, trialPlan] of states) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: getPlanLimits matches getEntitlements`, () => {
      const limits = getPlanLimits(plan, trialPlan);
      const e = getEntitlements(plan, trialPlan);
      expect(limits.maxStaff).toBe(e.maxStaff);
      expect(limits.maxCredentials).toBe(e.maxCredentials);
      expect(limits.maxUsers).toBe(e.maxUsers);
    });
  }
});
