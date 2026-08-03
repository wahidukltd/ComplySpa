import { describe, it, expect } from "vitest";
import { deriveAuditAction, AUDIT_ACTION_LABELS } from "@/lib/utils/audit-display";

const base = {
  staff_member_id: "s1",
  credential_type_id: "t1",
  license_number: "RN123",
  status: "valid",
  last_verified_date: null,
  expiration_date: "2027-01-01",
  issue_date: "2026-01-01",
};

describe("deriveAuditAction", () => {
  it("maps INSERT to added", () => {
    expect(deriveAuditAction("INSERT", null, base)).toBe("added");
  });

  it("maps an UPDATE that changes last_verified_date to verified (verify writes only that)", () => {
    const oldValues = { ...base, last_verified_date: null, verified_by_user_id: null };
    const newValues = { ...base, last_verified_date: "2026-08-04T10:00:00Z", verified_by_user_id: "u1" };
    expect(deriveAuditAction("UPDATE", oldValues, newValues)).toBe("verified");
  });

  it("maps an UPDATE that changes expiration/issue dates to renewed", () => {
    const oldValues = { ...base, expiration_date: "2026-07-01", issue_date: "2025-07-01" };
    const newValues = { ...base, expiration_date: "2027-07-01", issue_date: "2026-07-01" };
    expect(deriveAuditAction("UPDATE", oldValues, newValues)).toBe("renewed");
  });

  it("maps any other UPDATE (notes, number, type) to updated", () => {
    const oldValues = { ...base, notes: "old" };
    const newValues = { ...base, notes: "new" };
    expect(deriveAuditAction("UPDATE", oldValues, newValues)).toBe("updated");
  });

  it("an UPDATE that only recomputes status (no date/verified change) is updated, not renewed", () => {
    const oldValues = { ...base, status: "valid" };
    const newValues = { ...base, status: "expiring" };
    expect(deriveAuditAction("UPDATE", oldValues, newValues)).toBe("updated");
  });

  it("falls back to updated for unknown actions and missing value snapshots", () => {
    expect(deriveAuditAction("DELETE", base, null)).toBe("updated");
    expect(deriveAuditAction("UPDATE", null, null)).toBe("updated");
  });

  it("exposes labels for every derived action", () => {
    for (const action of ["added", "updated", "verified", "renewed"] as const) {
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
  });
});
