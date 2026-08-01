import { describe, it, expect } from "vitest";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { getPlanLimits } from "@/lib/utils/plan";

// ─── PRACTICE HAS 15 STAFF NOT 10 ───────────────────────────────────────

describe("Practice plan has correct limits (user specified 15)", () => {
  it("Practice: 15 staff, 300 credentials, 3 users", () => {
    const p = getPlanLimits("practice");
    expect(p.maxStaff).toBe(15);
    expect(p.maxCredentials).toBe(300);
    expect(p.maxUsers).toBe(3);
  });
});

// ─── EVERY SUBSCRIPTION TRANSITION ──────────────────────────────────────

describe("All subscription transitions behave correctly", () => {
  const transitions: [string, string, Partial<ReturnType<typeof getEntitlements>>][] = [
    // Signup → trial
    ["signup", "trial", { blocked: false, reportTier: "none", maxStaff: 1000, canManageUsers: true }],
    // Trial → canceled/expired
    ["trial_expire", "expired_trial", { blocked: true, reportTier: "none", maxStaff: 0, canManageUsers: false }],
    // Expired → inactive after 30 days
    ["expired_to_inactive", "inactive", { blocked: true, reportTier: "none", maxStaff: 0, canManageUsers: false }],
    // Skip trial → subscribe to Solo
    ["skip_trial_solo", "solo", { blocked: false, reportTier: "basic", maxStaff: 5, canEmailReports: false }],
    // Skip trial → subscribe to Practice
    ["skip_trial_practice", "practice", { blocked: false, reportTier: "audit", maxStaff: 15, canEmailReports: true }],
    // Downgrade: Practice → Solo
    ["practice_to_solo", "solo", { blocked: false, reportTier: "basic", maxStaff: 5, canEmailReports: false, canManageUsers: false, canManageAlertRecipients: false }],
    // Upgrade: Solo → Practice
    ["solo_to_practice", "practice", { blocked: false, reportTier: "audit", maxStaff: 15, canEmailReports: true, canManageUsers: true }],
    // Cancel: plan stays unchanged
    ["cancel", "solo", { blocked: false }],
    // Revoke: plan becomes expired_trial
    ["revoke", "expired_trial", { blocked: true, maxStaff: 0, reportTier: "none" }],
  ];

  for (const [name, plan, expected] of transitions) {
    it(name, () => {
      const e = getEntitlements(plan);
      const l = getPlanLimits(plan);
      for (const [key, value] of Object.entries(expected)) {
        if (key === "maxStaff" || key === "maxCredentials" || key === "maxUsers") {
          expect(l[key as keyof typeof l]).toBe(value);
        } else {
          expect(e[key as keyof typeof e]).toBe(value);
        }
      }
    });
  }
});

// ─── ENFORCEMENT LAYER CONSISTENCY ──────────────────────────────────────

describe("Cross-layer consistency: all enforcement layers agree", () => {
  const allPlans = ["trial", "expired_trial", "inactive", "solo", "practice"] as const;

  for (const plan of allPlans) {
    it(`${plan}: entitlements and plan limits agree on every field`, () => {
      const e = getEntitlements(plan);
      const l = getPlanLimits(plan);
      expect(l.maxStaff).toBe(e.maxStaff);
      expect(l.maxCredentials).toBe(e.maxCredentials);
      expect(l.maxUsers).toBe(e.maxUsers);
    });
  }
});

// ─── NO HIGHER-TIER FEATURE LEAKS AFTER DOWNGRADE ────────────────────────

describe("No feature leak after downgrade", () => {
  it("Solo (downgraded) cannot access Practice features", () => {
    const solo = getEntitlements("solo");
    expect(solo.reportTier).not.toBe("audit");
    expect(solo.canEmailReports).toBe(false);
    expect(solo.canManageUsers).toBe(false);
    expect(solo.canManageAlertRecipients).toBe(false);
    expect(solo.hasInspectionReadiness).toBe(false);
  });

  it("Practice cannot access features above its tier", () => {
    const practice = getEntitlements("practice");
    expect(practice.reportTier).toBe("audit");
  });

  it("Expired_trial has zero of everything", () => {
    const et = getEntitlements("expired_trial");
    expect(et.maxStaff).toBe(0);
    expect(et.maxCredentials).toBe(0);
    expect(et.maxUsers).toBe(0);
    expect(et.reportTier).toBe("none");
    expect(et.canEmailReports).toBe(false);
    expect(et.canManageUsers).toBe(false);
    expect(et.canManageAlertRecipients).toBe(false);
    expect(et.hasInspectionReadiness).toBe(false);
  });
});

// ─── AUTOMATIC RESTORATION AFTER UPGRADE ─────────────────────────────────

describe("Upgrade restores all features", () => {
  it("Solo→Practice: audit, email, user mgmt, alert recipients all restored", () => {
    const p = getEntitlements("practice");
    expect(p.reportTier).toBe("audit");
    expect(p.canEmailReports).toBe(true);
    expect(p.canManageUsers).toBe(true);
    expect(p.canManageAlertRecipients).toBe(true);
    expect(p.hasInspectionReadiness).toBe(true);
  });

  it("Expired_trial→Practice: full restoration", () => {
    const p = getEntitlements("practice");
    expect(p.blocked).toBe(false);
    expect(p.reportTier).toBe("audit");
    expect(p.maxStaff).toBe(15);
    expect(p.maxCredentials).toBe(300);
    expect(p.maxUsers).toBe(3);
  });
});

// ─── REPORT TIER BOUNDARY TESTING ────────────────────────────────────────

describe("Report tier boundaries", () => {
  const tiers: [string, string][] = [
    ["trial", "none"],
    ["expired_trial", "none"],
    ["inactive", "none"],
    ["solo", "basic"],
    ["practice", "audit"],
  ];

  for (const [plan, expected] of tiers) {
    it(`${plan} → ${expected}`, () => {
      expect(getReportTier(plan)).toBe(expected);
    });
  }

  it("unknown plan → none (not crash)", () => {
    expect(getReportTier("nonexistent")).toBe("none");
  });

  it("empty string → none (not crash)", () => {
    expect(getReportTier("")).toBe("none");
  });
});

// ─── UNKNOWN PLAN SAFETY ─────────────────────────────────────────────────

describe("Unknown plan falls back safely", () => {
  it("unknown plan: unchanging fallback (inactive + blocked)", () => {
    const e = getEntitlements("some_future_plan_that_doesnt_exist_yet");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toBe("Unknown plan");
    expect(e.maxStaff).toBe(0);
    expect(e.reportTier).toBe("none");
    expect(e.canEmailReports).toBe(false);
    expect(e.canManageUsers).toBe(false);
  });
});

// ─── BLOCKED PLANS ───────────────────────────────────────────────────────

describe("Blocked plan behavior", () => {
  it("active plans are never blocked", () => {
    for (const plan of ["trial", "solo", "practice"]) {
      expect(getEntitlements(plan).blocked).toBe(false);
    }
  });

  it("non-active plans are always blocked with a reason", () => {
    for (const plan of ["expired_trial", "inactive"]) {
      const e = getEntitlements(plan);
      expect(e.blocked).toBe(true);
      expect(typeof e.blockedReason).toBe("string");
      expect(e.blockedReason.length).toBeGreaterThan(0);
    }
  });
});

// ─── ALERT RECIPIENT ENTITLEMENT ────────────────────────────────────────

describe("Alert recipient entitlement enforced", () => {
  it("blocked plans and solo cannot manage alert recipients", () => {
    for (const plan of ["expired_trial", "inactive", "solo"]) {
      expect(getEntitlements(plan).canManageAlertRecipients).toBe(false);
    }
    expect(getEntitlements("trial").canManageAlertRecipients).toBe(true);
    expect(getEntitlements("practice").canManageAlertRecipients).toBe(true);
  });
});

// ─── EMAIL REPORTS ───────────────────────────────────────────────────────

describe("Email report entitlement enforced", () => {
  it("only practice can email reports", () => {
    for (const plan of ["trial", "expired_trial", "inactive", "solo"]) {
      expect(getEntitlements(plan).canEmailReports).toBe(false);
    }
    expect(getEntitlements("practice").canEmailReports).toBe(true);
  });
});
