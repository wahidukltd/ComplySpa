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
  // Trial is a state on the selected plan: signup transitions resolve through
  // the plan being evaluated (trial_plan), paid plans resolve directly.
  const transitions: [string, string, string | null | undefined, Partial<ReturnType<typeof getEntitlements>>][] = [
    // Signup → trial of the selected plan (e.g. Practice)
    ["signup (trial of practice)", "trial", "practice", { blocked: false, reportTier: "audit", maxStaff: 15, canManageUsers: true, canEmailReports: true }],
    // Signup → trial of Solo
    ["signup (trial of solo)", "trial", "solo", { blocked: false, reportTier: "basic", maxStaff: 5, canManageUsers: false, canEmailReports: true }],
    // Trial → canceled/expired
    ["trial_expire", "expired_trial", undefined, { blocked: true, reportTier: "none", maxStaff: 0, canManageUsers: false }],
    // Expired → inactive after 30 days
    ["expired_to_inactive", "inactive", undefined, { blocked: true, reportTier: "none", maxStaff: 0, canManageUsers: false }],
    // Skip trial → subscribe to Solo
    ["skip_trial_solo", "solo", undefined, { blocked: false, reportTier: "basic", maxStaff: 5, canEmailReports: true }],
    // Skip trial → subscribe to Practice
    ["skip_trial_practice", "practice", undefined, { blocked: false, reportTier: "audit", maxStaff: 15, canEmailReports: true }],
    // Downgrade: Practice → Solo
    ["practice_to_solo", "solo", undefined, { blocked: false, reportTier: "basic", maxStaff: 5, canEmailReports: true, canManageUsers: false, canManageAlertRecipients: false }],
    // Upgrade: Solo → Practice
    ["solo_to_practice", "practice", undefined, { blocked: false, reportTier: "audit", maxStaff: 15, canEmailReports: true, canManageUsers: true }],
    // Cancel: plan stays unchanged
    ["cancel", "solo", undefined, { blocked: false }],
    // Revoke: plan becomes expired_trial
    ["revoke", "expired_trial", undefined, { blocked: true, maxStaff: 0, reportTier: "none" }],
  ];

  for (const [name, plan, trialPlan, expected] of transitions) {
    it(name, () => {
      const e = getEntitlements(plan, trialPlan);
      const l = getPlanLimits(plan, trialPlan);
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
  const allStates: [string, string | null][] = [
    ["trial", "solo"],
    ["trial", "practice"],
    ["expired_trial", null],
    ["inactive", null],
    ["solo", null],
    ["practice", null],
  ];

  for (const [plan, trialPlan] of allStates) {
    it(`${plan}${trialPlan ? ` (trial of ${trialPlan})` : ""}: entitlements and plan limits agree on every field`, () => {
      const e = getEntitlements(plan, trialPlan);
      const l = getPlanLimits(plan, trialPlan);
      expect(l.maxStaff).toBe(e.maxStaff);
      expect(l.maxCredentials).toBe(e.maxCredentials);
      expect(l.maxUsers).toBe(e.maxUsers);
    });
  }
});

// ─── NO HIGHER-TIER FEATURE LEAKS AFTER DOWNGRADE ────────────────────────

describe("No feature leak after downgrade", () => {
  it("Solo (downgraded) cannot access Practice report tier", () => {
    const solo = getEntitlements("solo");
    expect(solo.reportTier).not.toBe("audit");
    expect(solo.reportTier).toBe("basic");
    // Email to self is not a differentiator — the report is.
    expect(solo.canEmailReports).toBe(true);
    expect(solo.canManageUsers).toBe(false);
    expect(solo.canManageAlertRecipients).toBe(false);
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
  const tiers: [string, string | null | undefined, string][] = [
    ["trial", "solo", "basic"],
    ["trial", "practice", "audit"],
    ["trial", null, "none"],
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
  it("active states are never blocked", () => {
    for (const [plan, trialPlan] of [
      ["trial", "solo"],
      ["trial", "practice"],
      ["solo", undefined],
      ["practice", undefined],
    ] as const) {
      expect(getEntitlements(plan, trialPlan).blocked).toBe(false);
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
    expect(getEntitlements("trial", "practice").canManageAlertRecipients).toBe(true);
    expect(getEntitlements("practice").canManageAlertRecipients).toBe(true);
  });
});

// ─── EMAIL REPORTS ───────────────────────────────────────────────────────

describe("Email report entitlement enforced", () => {
  it("every active plan can email to self; blocked plans cannot", () => {
    expect(getEntitlements("trial", "solo").canEmailReports).toBe(true);
    expect(getEntitlements("trial", "practice").canEmailReports).toBe(true);
    expect(getEntitlements("solo").canEmailReports).toBe(true);
    expect(getEntitlements("practice").canEmailReports).toBe(true);
    expect(getEntitlements("expired_trial").canEmailReports).toBe(false);
    expect(getEntitlements("inactive").canEmailReports).toBe(false);
  });
});
