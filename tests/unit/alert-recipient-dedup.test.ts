import { describe, it, expect } from "vitest";
import { canonicalRecipientList } from "../../supabase/functions/send-credential-alert/dedup";

describe("canonicalRecipientList (plan §4.6 — defensive delivery dedup)", () => {
  it("collapses the same address across casings to exactly one delivery", () => {
    const recipients = [
      { email: "Owner@example.com" },
      { email: "owner@example.com" },
      { email: "OWNER@EXAMPLE.COM" },
    ];
    const result = canonicalRecipientList("owner@example.com", recipients);
    expect(result).toEqual(["owner@example.com"]);
    expect(result).toHaveLength(1);
  });

  it("keeps distinct addresses, canonicalized", () => {
    const result = canonicalRecipientList("owner@example.com", [
      { email: "Manager@Example.com" },
      { email: "VIEWER@example.com" },
    ]);
    expect(result).toEqual(["owner@example.com", "manager@example.com", "viewer@example.com"]);
  });

  it("dedupes the owner against the recipient list (owner always receives, once)", () => {
    const result = canonicalRecipientList("Owner@Clinic.com", [
      { email: "owner@clinic.com" },
      { email: "ops@clinic.com" },
    ]);
    expect(result).toEqual(["owner@clinic.com", "ops@clinic.com"]);
  });

  it("handles null/undefined recipients and empty addresses", () => {
    expect(canonicalRecipientList("owner@example.com", null)).toEqual(["owner@example.com"]);
    expect(canonicalRecipientList("owner@example.com", undefined)).toEqual(["owner@example.com"]);
    expect(canonicalRecipientList("owner@example.com", [{ email: "" }])).toEqual(["owner@example.com"]);
  });
});
