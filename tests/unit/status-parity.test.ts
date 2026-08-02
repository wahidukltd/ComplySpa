import { describe, it, expect } from "vitest";
import { getCredentialStatus } from "@/lib/utils/status";

// Pins the display-util boundary to the cron-maintained SQL semantics in
// update_credential_statuses() (migration 035, latest body):
//   expired  : expiration_date < NOW()
//   expiring : NOW() <= expiration_date < NOW() + 90 days
//   valid    : expiration_date >= NOW() + 90 days
//   null/invalid dates stay 'valid' (the SQL cron never touches null dates —
//   the util's null→valid choice matches the untouched state).
// A deliberate boundary change must update BOTH sides and this test.
describe("getCredentialStatus boundary parity with update_credential_statuses (035)", () => {
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;
  const margin = 60_000; // > internal Date.now() drift

  it("expired when the date is in the past", () => {
    expect(getCredentialStatus(new Date(now - margin))).toBe("expired");
    expect(getCredentialStatus(new Date(now - 90 * day))).toBe("expired");
  });

  it("expiring within the 90-day window", () => {
    expect(getCredentialStatus(new Date(now + margin))).toBe("expiring");
    expect(getCredentialStatus(new Date(now + 89 * day))).toBe("expiring");
  });

  it("valid at and beyond the 90-day boundary", () => {
    expect(getCredentialStatus(new Date(now + 90 * day + margin))).toBe("valid");
    expect(getCredentialStatus(new Date(now + 91 * day))).toBe("valid");
  });

  it("null and invalid dates stay valid (untouched-state parity)", () => {
    expect(getCredentialStatus(null)).toBe("valid");
    expect(getCredentialStatus("not-a-date")).toBe("valid");
  });
});
