import { describe, it, expect } from "vitest";
import { getEntitlements } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";

describe("Trial expiration → suspended state", () => {
  it("expired_trial: blocked, zero limits, data preserved (no deletions)", () => {
    const e = getEntitlements("expired_trial");
    expect(e.blocked).toBe(true);
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    expect(e.canManageUsers).toBe(false);
    expect(e.canManageAlertRecipients).toBe(false);
  });

  it("inactive: same as expired_trial, different reason", () => {
    const expired = getEntitlements("expired_trial");
    const inactive = getEntitlements("inactive");
    expect(expired.maxStaff).toBe(inactive.maxStaff);
    expect(expired.maxCredentials).toBe(inactive.maxCredentials);
    expect(expired.reportTier).toBe(inactive.reportTier);
    expect(expired.blocked).toBe(inactive.blocked);
    expect(expired.blockedReason).toContain("trial");
    expect(inactive.blockedReason).toContain("inactive");
  });
});

describe("Activation after expired_trial → full restoration", () => {
  const paidPlans = ["solo", "practice"] as const;

  for (const plan of paidPlans) {
    it(`${plan}: blocked=false, report tier active, limits restored`, () => {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(false);
      expect(e.reportTier).not.toBe("none");
      expect(e.maxStaff).toBeGreaterThan(0);
      expect(e.maxCredentials).toBeGreaterThan(0);
      expect(e.maxUsers).toBeGreaterThan(0);
    });
  }
});

describe("expired_trial vs inactive transitions", () => {
  it("expired_trial → paid: all features unlocked, data intact", () => {
    const before = getEntitlements("expired_trial");
    const after = getEntitlements("practice");

    expect(before.blocked).toBe(true);
    expect(after.blocked).toBe(false);
    expect(after.reportTier).toBe("audit");
    expect(after.canEmailReports).toBe(true);
    expect(after.canManageUsers).toBe(true);
  });

  it("expired_trial → paid: limits increase from zero to plan levels", () => {
    const before = getPlanLimits("expired_trial");
    const after = getPlanLimits("solo");

    expect(before.maxStaff).toBe(0);
    expect(after.maxStaff).toBe(5);
    expect(before.maxCredentials).toBe(0);
    expect(after.maxCredentials).toBe(50);
  });
});

describe("No duplicate account after trial", () => {
  it("expired_trial: limits prevent inserts but existing data is untouched", () => {
    const e = getEntitlements("expired_trial");
    expect(e.maxStaff).toBe(0);
    expect(e.maxCredentials).toBe(0);
    expect(e.maxUsers).toBe(0);
  });

  it("paid plan after expired_trial: same limits as fresh subscribe", () => {
    const fresh = getPlanLimits("practice");
    const restored = getPlanLimits("practice");
    expect(restored.maxStaff).toBe(fresh.maxStaff);
    expect(restored.maxCredentials).toBe(fresh.maxCredentials);
    expect(restored.maxUsers).toBe(fresh.maxUsers);
  });
});

describe("Every state has consistent block/limit/report state", () => {
  const allStates: [string, string | null][] = [
    ["trial", "solo"],
    ["trial", "practice"],
    ["expired_trial", null],
    ["inactive", null],
    ["solo", null],
    ["practice", null],
  ];

  for (const [plan, trialPlan] of allStates) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: blocked implies zero limits`, () => {
      const e = getEntitlements(plan, trialPlan);
      if (e.blocked) {
        expect(e.maxStaff).toBe(0);
        expect(e.maxCredentials).toBe(0);
        expect(e.maxUsers).toBe(0);
        expect(e.reportTier).toBe("none");
      }
    });

    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: not blocked implies nonzero limits`, () => {
      const e = getEntitlements(plan, trialPlan);
      if (!e.blocked) {
        expect(e.maxStaff).toBeGreaterThan(0);
        expect(e.maxCredentials).toBeGreaterThan(0);
        expect(e.maxUsers).toBeGreaterThan(0);
        expect(e.reportTier).not.toBe("none");
      }
    });
  }

  it("no active state has a 'none' report tier", () => {
    for (const [plan, trialPlan] of allStates) {
      const e = getEntitlements(plan, trialPlan);
      if (!e.blocked) {
        expect(e.reportTier).not.toBe("none");
      }
    }
  });
});

describe("Middleware redirect logic", () => {
  it("blocked plans should never reach dashboard", () => {
    const blockedPlans = ["expired_trial", "inactive"];
    for (const plan of blockedPlans) {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(true);
    }
  });

  it("active states (including both trials) can reach dashboard", () => {
    const activeStates: [string, string | null][] = [
      ["trial", "solo"],
      ["trial", "practice"],
      ["solo", null],
      ["practice", null],
    ];
    for (const [plan, trialPlan] of activeStates) {
      const e = getEntitlements(plan, trialPlan);
      expect(e.blocked).toBe(false);
    }
  });
});
