import { describe, it, expect } from "vitest";
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  CATEGORY_COLORS,
} from "@/lib/utils/credential-display";
import type { CredentialStatus } from "@/lib/utils/status";

describe("credential display constants", () => {
  it("labels every status in the CredentialStatus union", () => {
    const statuses: CredentialStatus[] = ["valid", "expiring", "expired"];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_VARIANTS[s]).toBeTruthy();
    }
  });

  it("labels are human-readable words, never raw status strings", () => {
    expect(STATUS_LABELS.valid).toBe("Valid");
    expect(STATUS_LABELS.expiring).toBe("Expiring");
    expect(STATUS_LABELS.expired).toBe("Expired");
  });

  it("covers every category with a color class", () => {
    for (const category of ["license", "training", "insurance", "agreement"]) {
      expect(CATEGORY_COLORS[category]).toContain("bg-");
    }
  });
});
