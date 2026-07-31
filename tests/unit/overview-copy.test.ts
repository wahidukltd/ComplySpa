import { describe, it, expect } from "vitest";
import { formatUnresolvedStaff } from "@/lib/utils/overview-copy";

describe("formatUnresolvedStaff", () => {
  it("returns empty string when all counts are zero", () => {
    expect(formatUnresolvedStaff(0, 0, 0)).toBe("");
  });

  it("formats pending only with correct singular/plural", () => {
    expect(formatUnresolvedStaff(1, 0, 0)).toBe(
      "1 staff member not yet work-ready (no credentials tracked). See the hero chips for details.",
    );
    expect(formatUnresolvedStaff(2, 0, 0)).toBe(
      "2 staff members not yet work-ready (no credentials tracked). See the hero chips for details.",
    );
  });

  it("joins multiple clauses without dangling punctuation", () => {
    expect(formatUnresolvedStaff(2, 3, 0)).toBe(
      "2 staff members not yet work-ready (no credentials tracked), 3 at risk. See the hero chips for details.",
    );
    expect(formatUnresolvedStaff(0, 3, 0)).toBe(
      "3 at risk. See the hero chips for details.",
    );
    expect(formatUnresolvedStaff(0, 3, 1)).toBe(
      "3 at risk, 1 non-compliant. See the hero chips for details.",
    );
  });

  it("formats non-compliant alone", () => {
    expect(formatUnresolvedStaff(0, 0, 1)).toBe(
      "1 non-compliant. See the hero chips for details.",
    );
  });
});
