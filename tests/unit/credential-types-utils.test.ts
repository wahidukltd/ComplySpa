import { describe, it, expect } from "vitest";
import { findSimilarCredentialTypeName } from "@/lib/utils/credential-types";

describe("findSimilarCredentialTypeName (plan §4.7)", () => {
  const types = [
    { id: "1", name: "Registered Nurse License" },
    { id: "2", name: "CPR/BLS Certification" },
    { id: "3", name: "Botox Certification" },
  ];

  it("returns the existing name on an exact case-insensitive match", () => {
    expect(findSimilarCredentialTypeName("registered nurse license", types)).toBe("Registered Nurse License");
    expect(findSimilarCredentialTypeName("  CPR/BLS CERTIFICATION  ", types)).toBe("CPR/BLS Certification");
  });

  it("returns null when no similar name exists", () => {
    expect(findSimilarCredentialTypeName("Radiofrequency Microneedling Cert", types)).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(findSimilarCredentialTypeName("", types)).toBeNull();
    expect(findSimilarCredentialTypeName("   ", types)).toBeNull();
  });

  it("returns null for an empty type list", () => {
    expect(findSimilarCredentialTypeName("Anything", [])).toBeNull();
  });

  it("does not treat partial names as duplicates (no fuzzy matching)", () => {
    expect(findSimilarCredentialTypeName("Nurse License", types)).toBeNull();
  });
});
