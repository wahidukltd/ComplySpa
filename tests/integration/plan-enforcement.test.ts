import { describe, it, expect } from "vitest";
import { getPlanLimits } from "@/lib/utils/plan";

describe("Plan Enforcement Logic", () => {
  it("solo at 5 staff: count >= maxStaff → should block", () => {
    const limits = getPlanLimits("solo");
    const currentCount = 5;
    expect(currentCount >= limits.maxStaff).toBe(true);
  });

  it("solo at 4 staff: count < maxStaff → should allow", () => {
    const limits = getPlanLimits("solo");
    const currentCount = 4;
    expect(currentCount >= limits.maxStaff).toBe(false);
  });

  it("solo at 50 credentials: count >= maxCredentials → should block", () => {
    const limits = getPlanLimits("solo");
    const currentCount = 50;
    expect(currentCount >= limits.maxCredentials).toBe(true);
  });

  it("practice at 15 staff: count >= maxStaff → should block", () => {
    const limits = getPlanLimits("practice");
    const currentCount = 15;
    expect(currentCount >= limits.maxStaff).toBe(true);
  });

  it("practice at 14 staff: count < maxStaff → should allow", () => {
    const limits = getPlanLimits("practice");
    const currentCount = 14;
    expect(currentCount >= limits.maxStaff).toBe(false);
  });

  it("multi_location at 10 users: count >= maxUsers → should block", () => {
    const limits = getPlanLimits("multi_location");
    const currentCount = 10;
    expect(currentCount >= limits.maxUsers).toBe(true);
  });

  it("expired_trial at 0: any insert should block (all limits 0)", () => {
    const limits = getPlanLimits("expired_trial");
    expect(0 >= limits.maxStaff).toBe(true);
    expect(0 >= limits.maxCredentials).toBe(true);
    expect(0 >= limits.maxUsers).toBe(true);
  });

  it("inactive at 0: any insert should block (all limits 0)", () => {
    const limits = getPlanLimits("inactive");
    expect(0 >= limits.maxStaff).toBe(true);
    expect(0 >= limits.maxCredentials).toBe(true);
    expect(0 >= limits.maxUsers).toBe(true);
  });

  it("trial at 1000 staff: count >= maxStaff → should block", () => {
    const limits = getPlanLimits("trial");
    const currentCount = 1000;
    expect(currentCount >= limits.maxStaff).toBe(true);
  });

  it("trial at 999 staff: count < maxStaff → should allow", () => {
    const limits = getPlanLimits("trial");
    const currentCount = 999;
    expect(currentCount >= limits.maxStaff).toBe(false);
  });
});
