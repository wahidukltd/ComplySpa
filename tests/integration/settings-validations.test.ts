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

  it("alertRecipientSchema: valid email", () => {
    const result = alertRecipientSchema.safeParse({ email: "test@example.com" });
    expect(result.success).toBe(true);
  });

  it("alertRecipientSchema: invalid email fails", () => {
    const result = alertRecipientSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("customCredentialTypeSchema: valid input", () => {
    const result = customCredentialTypeSchema.safeParse({ name: "Custom License", category: "license", default_renewal_cycle_days: 365 });
    expect(result.success).toBe(true);
  });

  it("customCredentialTypeSchema: invalid category fails", () => {
    const result = customCredentialTypeSchema.safeParse({ name: "Test", category: "invalid", default_renewal_cycle_days: 365 });
    expect(result.success).toBe(false);
  });

  it("inviteUserSchema: valid manager invite", () => {
    const result = inviteUserSchema.safeParse({ email: "manager@example.com", role: "manager" });
    expect(result.success).toBe(true);
  });

  it("inviteUserSchema: owner role fails (only manager/viewer)", () => {
    const result = inviteUserSchema.safeParse({ email: "owner@example.com", role: "owner" });
    expect(result.success).toBe(false);
  });
});
