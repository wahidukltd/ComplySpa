import { describe, it, expect } from "vitest";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/utils/plan";
import { PlanLimitError } from "@/lib/utils/errors";

describe("PLAN_LIMITS", () => {
  it("solo: 5 staff, 50 credentials, 1 user", () => {
    expect(PLAN_LIMITS.solo.maxStaff).toBe(5);
    expect(PLAN_LIMITS.solo.maxCredentials).toBe(50);
    expect(PLAN_LIMITS.solo.maxUsers).toBe(1);
  });

  it("practice: 15 staff, 300 credentials, 3 users", () => {
    expect(PLAN_LIMITS.practice.maxStaff).toBe(15);
    expect(PLAN_LIMITS.practice.maxCredentials).toBe(300);
    expect(PLAN_LIMITS.practice.maxUsers).toBe(3);
  });

  it("multi_location: 50 staff, 1000 credentials, 10 users", () => {
    expect(PLAN_LIMITS.multi_location.maxStaff).toBe(50);
    expect(PLAN_LIMITS.multi_location.maxCredentials).toBe(1000);
    expect(PLAN_LIMITS.multi_location.maxUsers).toBe(10);
  });

  it("trial: generous limits for trial period", () => {
    expect(PLAN_LIMITS.trial.maxStaff).toBe(1000);
    expect(PLAN_LIMITS.trial.maxCredentials).toBe(10000);
    expect(PLAN_LIMITS.trial.maxUsers).toBe(100);
  });

  it("expired_trial: all limits zero", () => {
    expect(PLAN_LIMITS.expired_trial.maxStaff).toBe(0);
    expect(PLAN_LIMITS.expired_trial.maxCredentials).toBe(0);
    expect(PLAN_LIMITS.expired_trial.maxUsers).toBe(0);
  });

  it("inactive: all limits zero", () => {
    expect(PLAN_LIMITS.inactive.maxStaff).toBe(0);
    expect(PLAN_LIMITS.inactive.maxCredentials).toBe(0);
    expect(PLAN_LIMITS.inactive.maxUsers).toBe(0);
  });
});

describe("getPlanLimits", () => {
  it("returns correct limits for 'solo'", () => {
    const limits = getPlanLimits("solo");
    expect(limits.maxStaff).toBe(5);
    expect(limits.maxCredentials).toBe(50);
    expect(limits.maxUsers).toBe(1);
  });

  it("returns correct limits for 'practice'", () => {
    const limits = getPlanLimits("practice");
    expect(limits.maxStaff).toBe(15);
    expect(limits.maxCredentials).toBe(300);
    expect(limits.maxUsers).toBe(3);
  });

  it("returns correct limits for 'multi_location'", () => {
    const limits = getPlanLimits("multi_location");
    expect(limits.maxStaff).toBe(50);
    expect(limits.maxCredentials).toBe(1000);
    expect(limits.maxUsers).toBe(10);
  });

  it("returns correct limits for 'trial'", () => {
    const limits = getPlanLimits("trial");
    expect(limits.maxStaff).toBe(1000);
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
