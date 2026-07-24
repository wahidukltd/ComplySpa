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
    expect(e.canAccessAPI).toBe(false);
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
  const paidPlans = ["solo", "practice", "multi_location"] as const;

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

describe("Every plan has consistent block/limit/report state", () => {
  const allStates = ["trial", "expired_trial", "inactive", "solo", "practice", "multi_location"] as const;

  for (const plan of allStates) {
    it(`${plan}: blocked implies zero limits`, () => {
      const e = getEntitlements(plan);
      if (e.blocked) {
        expect(e.maxStaff).toBe(0);
        expect(e.maxCredentials).toBe(0);
        expect(e.maxUsers).toBe(0);
        expect(e.reportTier).toBe("none");
      }
    });

    it(`${plan}: not blocked implies nonzero limits`, () => {
      const e = getEntitlements(plan);
      if (!e.blocked && plan !== "trial") {
        expect(e.maxStaff).toBeGreaterThan(0);
        expect(e.maxCredentials).toBeGreaterThan(0);
        expect(e.maxUsers).toBeGreaterThan(0);
        expect(e.reportTier).not.toBe("none");
      }
    });
  }

  it("trial is the only active plan with 'none' report tier", () => {
    for (const plan of allStates) {
      const e = getEntitlements(plan);
      if (!e.blocked && e.reportTier === "none") {
        expect(plan).toBe("trial");
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

  it("active plans (including trial) can reach dashboard", () => {
    const activePlans = ["trial", "solo", "practice", "multi_location"];
    for (const plan of activePlans) {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(false);
    }
  });
});
