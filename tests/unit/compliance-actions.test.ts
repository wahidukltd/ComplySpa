import { describe, it, expect, vi } from "vitest";
import { buildComplianceActionsFromReadiness } from "@/lib/staff/compliance-actions";
import type { ReadinessResult } from "@/lib/staff/readiness";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";

// The onboarding-card emission path makes no DB calls (pending staff are
// skipped before any query; the stale-verify block only runs when credential
// names exist). Any DB call here is a test bug — fail loudly.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      throw new Error("unexpected DB call in builder test");
    },
  })),
}));

function readiness(status: ReadinessResult["status"]): ReadinessResult {
  return { status, missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
}

function onboardingState(overrides: Partial<OnboardingStaffState>): OnboardingStaffState {
  return {
    requiredTotal: 0,
    requiredCompleted: 0,
    requiredPending: 0,
    optionalTotal: 0,
    optionalCompleted: 0,
    optionalPending: 0,
    missingNames: [],
    ...overrides,
  };
}

const staffRows = [{ id: "s1", name: "Priya", role: "RN" }];

describe("buildComplianceActionsFromReadiness — onboarding cards", () => {
  it("emits one warning complete_onboarding card for a pending staff member with pending required items", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("pending") },
      "clinic-1",
      { s1: onboardingState({ requiredTotal: 4, requiredCompleted: 1, requiredPending: 3, missingNames: ["RN License", "BLS", "ACLS"] }) },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!).toMatchObject({
      actionType: "complete_onboarding",
      urgency: "warning",
      actionLabel: "Continue onboarding",
      actionHref: "/dashboard/staff/s1#onboarding",
      description: "Onboarding incomplete — RN License, BLS, ACLS pending",
    });
  });

  it("truncates missing names to 3 with +N more", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("pending") },
      "clinic-1",
      { s1: onboardingState({ requiredTotal: 5, requiredPending: 5, missingNames: ["A", "B", "C", "D", "E"] }) },
    );
    expect(actions[0]!.description).toBe("Onboarding incomplete — A, B, C +2 more pending");
  });

  it("falls back to a requirement count when pending items have no known names", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("pending") },
      "clinic-1",
      { s1: onboardingState({ requiredTotal: 2, requiredPending: 2, missingNames: [] }) },
    );
    expect(actions[0]!.description).toBe("Onboarding incomplete — 2 requirements pending");
  });

  it("emits Start onboarding for a pending staff member with a role and no items", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("pending") },
      "clinic-1",
      { s1: onboardingState({}) },
    );
    expect(actions[0]!).toMatchObject({
      actionLabel: "Start onboarding",
      description: "Onboarding not started — no requirements generated yet",
    });
  });

  it("emits Continue onboarding for optional-only pending items (vocabulary parity with the staff list)", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("pending") },
      "clinic-1",
      { s1: onboardingState({ optionalTotal: 2, optionalPending: 2 }) },
    );
    expect(actions[0]!).toMatchObject({
      actionLabel: "Continue onboarding",
      description: "Onboarding incomplete — 2 requirements pending",
    });
  });

  it("emits no onboarding cards when onboardingState is null (overview section failed)", async () => {
    const actions = await buildComplianceActionsFromReadiness(staffRows, { s1: readiness("pending") }, "clinic-1", null);
    expect(actions).toHaveLength(0);
  });

  it("emits no onboarding cards for at_risk staff (individual actions cover them)", async () => {
    const actions = await buildComplianceActionsFromReadiness(
      staffRows,
      { s1: readiness("at_risk") },
      "clinic-1",
      { s1: onboardingState({ requiredTotal: 4, requiredPending: 3, missingNames: ["RN License", "BLS", "ACLS"] }) },
    );
    expect(actions).toHaveLength(0);
  });
});
