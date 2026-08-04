import { describe, it, expect } from "vitest";
import { getPlanLimits } from "@/lib/utils/plan";
import { getEntitlements, getReportTier } from "@/lib/utils/entitlements";
import { PlanLimitError } from "@/lib/utils/errors";

describe("getPlanLimits", () => {
  it("solo: 5 staff, 50 credentials, 1 user", () => {
    const limits = getPlanLimits("solo");
    expect(limits.maxStaff).toBe(5);
    expect(limits.maxCredentials).toBe(50);
    expect(limits.maxUsers).toBe(1);
  });

  it("practice: 15 staff, 300 credentials, 3 users", () => {
    const limits = getPlanLimits("practice");
    expect(limits.maxStaff).toBe(15);
    expect(limits.maxCredentials).toBe(300);
    expect(limits.maxUsers).toBe(3);
  });

  it("trial of solo: solo limits (5/50/1)", () => {
    const limits = getPlanLimits("trial", "solo");
    expect(limits.maxStaff).toBe(5);
    expect(limits.maxCredentials).toBe(50);
    expect(limits.maxUsers).toBe(1);
  });

  it("trial of practice: practice limits (15/300/3)", () => {
    const limits = getPlanLimits("trial", "practice");
    expect(limits.maxStaff).toBe(15);
    expect(limits.maxCredentials).toBe(300);
    expect(limits.maxUsers).toBe(3);
  });

  it("trial without a selected plan: all limits zero", () => {
    const limits = getPlanLimits("trial");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });

  it("expired_trial: all limits zero", () => {
    const limits = getPlanLimits("expired_trial");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });

  it("inactive: all limits zero", () => {
    const limits = getPlanLimits("inactive");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });

  it("falls back to inactive for unknown plan", () => {
    const limits = getPlanLimits("nonexistent_plan");
    expect(limits.maxStaff).toBe(0);
    expect(limits.maxCredentials).toBe(0);
    expect(limits.maxUsers).toBe(0);
  });

  it("falls back to inactive for empty string", () => {
    const limits = getPlanLimits("");
    expect(limits.maxUsers).toBe(0);
  });
});

describe("getEntitlements", () => {
  it("trial of solo: solo caps, basic reports, email to self, no user mgmt", () => {
    const e = getEntitlements("trial", "solo");
    expect(e.maxStaff).toBe(5);
    expect(e.maxCredentials).toBe(50);
    expect(e.maxUsers).toBe(1);
    expect(e.reportTier).toBe("basic");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(false);
    expect(e.blocked).toBe(false);
  });

  it("trial of practice: practice caps, audit reports, email, user mgmt", () => {
    const e = getEntitlements("trial", "practice");
    expect(e.maxStaff).toBe(15);
    expect(e.maxCredentials).toBe(300);
    expect(e.maxUsers).toBe(3);
    expect(e.reportTier).toBe("audit");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("solo: capped limits, basic reports, email to self, no user mgmt", () => {
    const e = getEntitlements("solo");
    expect(e.maxStaff).toBe(5);
    expect(e.maxCredentials).toBe(50);
    expect(e.maxUsers).toBe(1);
    expect(e.reportTier).toBe("basic");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(false);
    expect(e.blocked).toBe(false);
  });

  it("practice: mid limits, audit reports, email, user mgmt", () => {
    const e = getEntitlements("practice");
    expect(e.maxStaff).toBe(15);
    expect(e.maxCredentials).toBe(300);
    expect(e.maxUsers).toBe(3);
    expect(e.reportTier).toBe("audit");
    expect(e.canEmailReports).toBe(true);
    expect(e.canManageUsers).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("expired_trial: blocked with reason", () => {
    const e = getEntitlements("expired_trial");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toContain("trial has expired");
    expect(e.maxStaff).toBe(0);
    expect(e.reportTier).toBe("none");
  });

  it("inactive: blocked with reason", () => {
    const e = getEntitlements("inactive");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toContain("inactive");
    expect(e.maxStaff).toBe(0);
    expect(e.reportTier).toBe("none");
  });

  it("unknown plan falls back to inactive", () => {
    const e = getEntitlements("nonexistent");
    expect(e.blocked).toBe(true);
    expect(e.blockedReason).toBe("Unknown plan");
  });
});

describe("getReportTier", () => {
  it("trial of solo returns basic", () => {
    expect(getReportTier("trial", "solo")).toBe("basic");
  });
  it("trial of practice returns audit", () => {
    expect(getReportTier("trial", "practice")).toBe("audit");
  });
  it("trial without selected plan returns none", () => {
    expect(getReportTier("trial")).toBe("none");
  });
  it("solo returns basic", () => {
    expect(getReportTier("solo")).toBe("basic");
  });
  it("practice returns audit", () => {
    expect(getReportTier("practice")).toBe("audit");
  });
  it("expired_trial returns none", () => {
    expect(getReportTier("expired_trial")).toBe("none");
  });
  it("inactive returns none", () => {
    expect(getReportTier("inactive")).toBe("none");
  });
  it("unknown plan returns none", () => {
    expect(getReportTier("garbage")).toBe("none");
  });
});

describe("PlanLimitError", () => {
  it("carries code, current, and max", () => {
    const err = new PlanLimitError("Too many staff", "STAFF_LIMIT", 5, 5);
    expect(err.code).toBe("STAFF_LIMIT");
    expect(err.current).toBe(5);
    expect(err.max).toBe(5);
    expect(err.message).toBe("Too many staff");
    expect(err.name).toBe("PlanLimitError");
  });

  it("is an Error instance", () => {
    const err = new PlanLimitError("Too many", "CREDENTIAL_LIMIT", 50, 50);
    expect(err instanceof Error).toBe(true);
  });

  it("supports USER_LIMIT code", () => {
    const err = new PlanLimitError("Too many users", "USER_LIMIT", 3, 3);
    expect(err.code).toBe("USER_LIMIT");
  });
});
