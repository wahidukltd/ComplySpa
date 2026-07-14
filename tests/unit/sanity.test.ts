import { describe, it, expect } from "vitest";
import { getCredentialStatus } from "@/lib/utils/status";
import { formatDate } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/utils/currency";

describe("getCredentialStatus", () => {
  it("returns 'expired' for a past date", () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(getCredentialStatus(past)).toBe("expired");
  });

  it("returns 'expiring' for a date within 90 days", () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(getCredentialStatus(soon)).toBe("expiring");
  });

  it("returns 'valid' for a future date beyond 90 days", () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(getCredentialStatus(future)).toBe("valid");
  });

  it("returns 'valid' for null input", () => {
    expect(getCredentialStatus(null)).toBe("valid");
  });
});

describe("formatDate", () => {
  it("returns a formatted string for a valid date", () => {
    const result = formatDate("2026-07-14T00:00:00Z");
    expect(result).toMatch(/[A-Za-z]{3} \d{2}, 2026/);
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });
});

describe("formatCurrency", () => {
  it("returns formatted currency for a positive number", () => {
    expect(formatCurrency(49.99)).toBe("$49.99");
  });

  it("returns $0.00 for null", () => {
    expect(formatCurrency(null)).toBe("$0.00");
  });
});
