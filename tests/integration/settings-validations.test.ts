import { describe, it, expect } from "vitest";
import {
  clinicProfileSchema,
  alertRecipientSchema,
  customCredentialTypeSchema,
  inviteUserSchema,
} from "@/lib/validations/settings";

describe("Settings Validations", () => {
  it("clinicProfileSchema: valid input", () => {
    const result = clinicProfileSchema.safeParse({ name: "Test Clinic", address: "123 Main St", state: "TX" });
    expect(result.success).toBe(true);
  });

  it("clinicProfileSchema: empty name fails", () => {
    const result = clinicProfileSchema.safeParse({ name: "", address: "", state: "" });
    expect(result.success).toBe(false);
  });

  it("clinicProfileSchema: state/province accepts free text up to 100 chars (international-safe)", () => {
    const result = clinicProfileSchema.safeParse({ name: "Clinic", state: "Ontario" });
    expect(result.success).toBe(true);
  });

  it("alertRecipientSchema: valid email", () => {
    const result = alertRecipientSchema.safeParse({ email: "test@example.com" });
    expect(result.success).toBe(true);
  });

  it("alertRecipientSchema: invalid email fails", () => {
    const result = alertRecipientSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("alertRecipientSchema: canonicalizes trim + lowercase (plan §4.4)", () => {
    const result = alertRecipientSchema.safeParse({ email: "  Owner@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("owner@example.com");
  });

  it("customCredentialTypeSchema: valid input (unified renewal_days field, plan §4.7)", () => {
    const result = customCredentialTypeSchema.safeParse({ name: "Custom License", category: "license", renewal_days: 365 });
    expect(result.success).toBe(true);
  });

  it("customCredentialTypeSchema: invalid category fails", () => {
    const result = customCredentialTypeSchema.safeParse({ name: "Test", category: "invalid", renewal_days: 365 });
    expect(result.success).toBe(false);
  });

  it("customCredentialTypeSchema: trims the name", () => {
    const result = customCredentialTypeSchema.safeParse({ name: "  Botox Certification  ", category: "training" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Botox Certification");
  });

  it("customCredentialTypeSchema: renewal_days bounds (1..3650)", () => {
    expect(customCredentialTypeSchema.safeParse({ name: "X", category: "license", renewal_days: 0 }).success).toBe(false);
    expect(customCredentialTypeSchema.safeParse({ name: "X", category: "license", renewal_days: 3651 }).success).toBe(false);
    expect(customCredentialTypeSchema.safeParse({ name: "X", category: "license", renewal_days: 1 }).success).toBe(true);
  });

  it("inviteUserSchema: valid manager invite", () => {
    const result = inviteUserSchema.safeParse({ email: "manager@example.com", role: "manager" });
    expect(result.success).toBe(true);
  });

  it("inviteUserSchema: owner role fails (only manager/viewer)", () => {
    const result = inviteUserSchema.safeParse({ email: "owner@example.com", role: "owner" });
    expect(result.success).toBe(false);
  });

  it("inviteUserSchema: canonicalizes trim + lowercase (plan §4.3)", () => {
    const result = inviteUserSchema.safeParse({ email: "  Manager@Example.com  ", role: "viewer" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("manager@example.com");
  });
});
