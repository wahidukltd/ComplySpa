import { describe, it, expect } from "vitest";
import { computeComplianceHealth } from "@/lib/utils/compliance-health";
import type { ReadinessResult } from "@/lib/staff/readiness";

// computeComplianceHealth lives in a pure module (src/lib/utils/compliance-health.ts)
// with no server-only imports, so this test is hermetic.

function r(status: ReadinessResult["status"]): ReadinessResult {
  return {
    status,
    missingCredentials: [],
    expiredCredentials: [],
    expiringCredentials: [],
  };
}

describe("computeComplianceHealth", () => {
  it("returns 0 for an empty map (no staff)", () => {
    const result = computeComplianceHealth({});
    expect(result.score).toBe(0);
    expect(result.readyCount).toBe(0);
    expect(result.totalStaff).toBe(0);
  });

  it("returns 100 when all staff are ready", () => {
    const result = computeComplianceHealth({
      a: r("ready"),
      b: r("ready"),
    });
    expect(result.score).toBe(100);
    expect(result.readyCount).toBe(2);
    expect(result.totalStaff).toBe(2);
  });

  it("floors 18/19 ready to 94", () => {
    const results: Record<string, ReadinessResult> = {};
    for (let i = 0; i < 19; i++) {
      results[`s${i}`] = r(i === 18 ? "non_compliant" : "ready");
    }
    const result = computeComplianceHealth(results);
    expect(result.score).toBe(94);
    expect(result.readyCount).toBe(18);
    expect(result.totalStaff).toBe(19);
  });

  it("does not count at-risk, non-compliant, or pending as ready", () => {
    const result = computeComplianceHealth({
      ready: r("ready"),
      atRisk: r("at_risk"),
      nonCompliant: r("non_compliant"),
      pending: r("pending"),
    });
    expect(result.score).toBe(25);
    expect(result.readyCount).toBe(1);
    expect(result.totalStaff).toBe(4);
  });

  it("returns 0 score when no staff are ready", () => {
    const result = computeComplianceHealth({
      a: r("non_compliant"),
      b: r("pending"),
    });
    expect(result.score).toBe(0);
    expect(result.readyCount).toBe(0);
    expect(result.totalStaff).toBe(2);
  });
});
