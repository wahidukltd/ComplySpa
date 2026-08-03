import { describe, it, expect } from "vitest";
import { deriveWorkStatus, WORK_STATUS_META, WORK_STATUS_FILTER } from "@/lib/utils/work-status";
import type { ReadinessResult } from "@/lib/staff/readiness";
import { EMPTY_ONBOARDING_STATE } from "@/lib/staff/onboarding";

function readiness(status: ReadinessResult["status"]): ReadinessResult {
  return { status, missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
}

const pendingRequired = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 2, requiredPending: 2, missingNames: ["RN License"] };

describe("deriveWorkStatus", () => {
  it("returns blocked when any required item is pending, even if readiness says ready (drift safety)", () => {
    expect(deriveWorkStatus(readiness("ready"), pendingRequired)).toBe("blocked");
  });

  it("returns blocked for a new hire with pending required items", () => {
    expect(deriveWorkStatus(readiness("pending"), pendingRequired)).toBe("blocked");
  });

  it("returns work_ready when readiness is ready and nothing is blocked", () => {
    expect(deriveWorkStatus(readiness("ready"), EMPTY_ONBOARDING_STATE)).toBe("work_ready");
  });

  it("returns in_progress for at_risk (expiring)", () => {
    expect(deriveWorkStatus(readiness("at_risk"), EMPTY_ONBOARDING_STATE)).toBe("in_progress");
  });

  it("returns in_progress for non_compliant (e.g. credential lapsed after onboarding)", () => {
    expect(deriveWorkStatus(readiness("non_compliant"), EMPTY_ONBOARDING_STATE)).toBe("in_progress");
  });

  it("returns in_progress for pending readiness with no items (legacy staff)", () => {
    expect(deriveWorkStatus(readiness("pending"), EMPTY_ONBOARDING_STATE)).toBe("in_progress");
  });

  it("returns work_ready when only optional items remain (required all complete)", () => {
    const optionalOnly = { ...EMPTY_ONBOARDING_STATE, optionalTotal: 1, optionalCompleted: 0, optionalPending: 1 };
    expect(deriveWorkStatus(readiness("ready"), optionalOnly)).toBe("work_ready");
  });

  it("never reports blocked for pending optional items (optional work is not a gate)", () => {
    const optionalPending = { ...EMPTY_ONBOARDING_STATE, optionalTotal: 2, optionalPending: 2 };
    expect(deriveWorkStatus(readiness("pending"), optionalPending)).toBe("in_progress");
    expect(deriveWorkStatus(readiness("at_risk"), optionalPending)).toBe("in_progress");
  });

  it("does not treat a skipped required item as blocked (requiredPending only counts pending)", () => {
    const skippedRequired = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 1, requiredCompleted: 0, requiredPending: 0 };
    expect(deriveWorkStatus(readiness("non_compliant"), skippedRequired)).toBe("in_progress");
  });

  it("returns work_ready for a skipped required item when readiness is ready (state converges on the next credential INSERT via the auto-complete trigger)", () => {
    const skippedRequired = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 1, requiredCompleted: 0, requiredPending: 0 };
    expect(deriveWorkStatus(readiness("ready"), skippedRequired)).toBe("work_ready");
  });

  it("blocks when a skipped required item exists alongside another pending required item", () => {
    const mixed = { ...EMPTY_ONBOARDING_STATE, requiredTotal: 2, requiredCompleted: 0, requiredPending: 1, missingNames: ["BLS"] };
    expect(deriveWorkStatus(readiness("non_compliant"), mixed)).toBe("blocked");
  });
});

describe("WORK_STATUS_META", () => {
  it("exposes all three states with labels", () => {
    expect(WORK_STATUS_META.work_ready.label).toBe("Work Ready");
    expect(WORK_STATUS_META.in_progress.label).toBe("In Progress");
    expect(WORK_STATUS_META.blocked.label).toBe("Blocked");
  });
});

describe("WORK_STATUS_FILTER", () => {
  it("starts with All and covers every status", () => {
    expect(WORK_STATUS_FILTER[0]).toMatchObject({ value: "", label: "All" });
    const values = WORK_STATUS_FILTER.map((f) => f.value);
    for (const status of ["work_ready", "in_progress", "blocked"] as const) {
      expect(values).toContain(status);
    }
  });
});
