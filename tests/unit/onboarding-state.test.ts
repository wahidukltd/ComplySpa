import { describe, it, expect } from "vitest";
import { hasPendingOnboardingItems, EMPTY_ONBOARDING_STATE } from "@/lib/staff/onboarding";

describe("hasPendingOnboardingItems", () => {
  it("returns false for an empty state", () => {
    expect(hasPendingOnboardingItems(EMPTY_ONBOARDING_STATE)).toBe(false);
  });

  it("returns true when required items are pending", () => {
    const state = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 2, requiredPending: 1 };
    expect(hasPendingOnboardingItems(state)).toBe(true);
  });

  it("returns true when only optional items are pending", () => {
    const state = { ...EMPTY_ONBOARDING_STATE, optionalTotal: 1, optionalPending: 1 };
    expect(hasPendingOnboardingItems(state)).toBe(true);
  });

  it("returns false when everything is completed or skipped", () => {
    const state = {
      ...EMPTY_ONBOARDING_STATE,
      requiredTotal: 3,
      requiredCompleted: 2,
      requiredPending: 0,
      optionalTotal: 1,
      optionalCompleted: 1,
      optionalPending: 0,
    };
    expect(hasPendingOnboardingItems(state)).toBe(false);
  });

  it("returns true for a mixed required+optional pending state", () => {
    const state = {
      ...EMPTY_ONBOARDING_STATE,
      requiredPending: 2,
      optionalPending: 1,
    };
    expect(hasPendingOnboardingItems(state)).toBe(true);
  });

  it("does not treat skipped required items as pending (skipped-required is re-completable, not outstanding)", () => {
    const state = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 1, requiredPending: 0 };
    expect(hasPendingOnboardingItems(state)).toBe(false);
  });
});
