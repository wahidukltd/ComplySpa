import { describe, it, expect } from "vitest";
import { staffStep1Schema, wizardCredentialSchema } from "@/lib/validations/staff";
import {
  buildSuggestedRows,
  autoExpirationDate,
  rowDateError,
  wizardRoleNameError,
} from "@/lib/staff/wizard";

const CPR_ID = "11111111-1111-1111-8111-111111111111";
const ACLS_ID = "22222222-2222-2222-9222-222222222222";
const RN_ID = "33333333-3333-3333-8333-333333333333";

describe("buildSuggestedRows — template rows for the wizard", () => {
  it("returns [] for an empty suggestion set", () => {
    expect(buildSuggestedRows([])).toEqual([]);
  });

  it("orders required first and pre-checks only required items", () => {
    const rows = buildSuggestedRows([
      { credentialTypeId: CPR_ID, name: "CPR/BLS Certification", category: "training", isRequired: true, renewalDays: 730 },
      { credentialTypeId: ACLS_ID, name: "ACLS Certification", category: "training", isRequired: false, renewalDays: null },
      { credentialTypeId: RN_ID, name: "Registered Nurse License", category: "license", isRequired: true, renewalDays: 365 },
    ]);
    expect(rows.map((r) => r.credentialTypeId)).toEqual([CPR_ID, RN_ID, ACLS_ID]);
    expect(rows.map((r) => r.checked)).toEqual([true, true, false]);
    expect(rows.map((r) => r.isRequired)).toEqual([true, true, false]);
    expect(rows.every((r) => r.fromTemplate)).toBe(true);
  });

  it("starts detail fields empty", () => {
    const [row] = buildSuggestedRows([
      { credentialTypeId: CPR_ID, name: "CPR/BLS Certification", category: "training", isRequired: true, renewalDays: 730 },
    ]);
    expect(row).toMatchObject({
      licenseNumber: "",
      state: "",
      issueDate: "",
      expirationDate: "",
    });
  });
});

describe("autoExpirationDate — native date-input value", () => {
  const NOW = new Date(2026, 5, 15); // 2026-06-15

  it("adds the cycle length in days", () => {
    expect(autoExpirationDate(365, NOW)).toBe("2027-06-15");
  });

  it("zero days stays today", () => {
    expect(autoExpirationDate(0, NOW)).toBe("2026-06-15");
  });

  it("rolls across month boundaries with zero-padded values", () => {
    const jan31 = new Date(2026, 0, 31);
    expect(autoExpirationDate(1, jan31)).toBe("2026-02-01");
  });
});

describe("rowDateError — issue/expiration ordering", () => {
  it("accepts empty dates", () => {
    expect(rowDateError("", "")).toBeNull();
    expect(rowDateError("2026-01-01", "")).toBeNull();
    expect(rowDateError("", "2026-01-01")).toBeNull();
  });

  it("accepts expiration on or after issue", () => {
    expect(rowDateError("2026-01-01", "2026-01-01")).toBeNull();
    expect(rowDateError("2026-01-01", "2027-01-01")).toBeNull();
  });

  it("rejects expiration before issue", () => {
    expect(rowDateError("2026-01-03", "2026-01-02")).toBe(
      "Expiration must be on or after the issue date.",
    );
  });
});

describe("wizardCredentialSchema — server date-order refine (defense-in-depth)", () => {
  it("accepts valid and empty dates", () => {
    expect(
      wizardCredentialSchema.safeParse({
        credential_type_id: CPR_ID,
        issue_date: "2026-01-01",
        expiration_date: "2026-01-02",
      }).success,
    ).toBe(true);
    expect(
      wizardCredentialSchema.safeParse({
        credential_type_id: CPR_ID,
        issue_date: "2026-01-01",
        expiration_date: "2026-01-01",
      }).success,
    ).toBe(true);
    expect(wizardCredentialSchema.safeParse({ credential_type_id: CPR_ID }).success).toBe(true);
  });

  it("rejects expiration before issue", () => {
    const parsed = wizardCredentialSchema.safeParse({
      credential_type_id: CPR_ID,
      issue_date: "2026-01-03",
      expiration_date: "2026-01-02",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("staffStep1Schema — the step-1 client gate mirrors the server constraints (pre-merge review M-4)", () => {
  it("accepts a valid form", () => {
    expect(
      staffStep1Schema.safeParse({ name: "Jane Smith", email: "jane@clinic.com" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(staffStep1Schema.safeParse({ name: "Jane Smith", email: "not-an-email" }).success).toBe(
      false,
    );
  });

  it("rejects an over-length name", () => {
    expect(staffStep1Schema.safeParse({ name: "x".repeat(256) }).success).toBe(false);
  });
});

describe("wizardRoleNameError — Step-2 custom role creation guard", () => {
  it("rejects empty, over-length, and pattern-violating names", () => {
    expect(wizardRoleNameError("", [])).not.toBeNull();
    expect(wizardRoleNameError("   ", [])).not.toBeNull();
    expect(wizardRoleNameError("Bad@Role", [])).not.toBeNull();
    expect(wizardRoleNameError("A".repeat(81), [])).not.toBeNull();
  });

  it("rejects built-in role names (case-insensitive) with the Settings pointer", () => {
    expect(wizardRoleNameError("RN", [])).toBe(
      "This name matches a built-in role. Customize it in Settings → Role Templates instead.",
    );
    expect(wizardRoleNameError("rn", [])).toBe(
      "This name matches a built-in role. Customize it in Settings → Role Templates instead.",
    );
    expect(wizardRoleNameError("front_desk", [])).toBe(
      "This name matches a built-in role. Customize it in Settings → Role Templates instead.",
    );
  });

  it("rejects own-clinic duplicate custom role names (case-insensitive)", () => {
    expect(wizardRoleNameError("Laser Tech II", ["Laser Tech II"])).toBe(
      "A role with this name already exists in your clinic.",
    );
    expect(wizardRoleNameError("laser tech ii", ["Laser Tech II"])).toBe(
      "A role with this name already exists in your clinic.",
    );
  });

  it("accepts valid custom names that collide with nothing", () => {
    expect(wizardRoleNameError("Laser Tech II", ["Injectables Nurse"])).toBeNull();
    expect(wizardRoleNameError("  Dermal Specialist  ", [])).toBeNull();
  });
});
