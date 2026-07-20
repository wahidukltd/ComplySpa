import { describe, it, expect } from "vitest";
import { calculateReadinessScore, scoreTier } from "@/lib/audit/readiness";

describe("Readiness Score Calculation", () => {
  it("all pass -> 100%", () => {
    const findings = Array(7).fill({ status: "pass" });
    expect(calculateReadinessScore(findings)).toBe(100);
  });

  it("all fail -> 0%", () => {
    const findings = Array(7).fill({ status: "fail" });
    expect(calculateReadinessScore(findings)).toBe(0);
  });

  it("all manual_attest -> 50% (7 * 0.5 = 3.5 / 7 = 0.5 -> 50%)", () => {
    const findings = Array(7).fill({ status: "manual_attest" });
    expect(calculateReadinessScore(findings)).toBe(50);
  });

  it("mixed: 4 pass + 3 fail -> 57% (4/7 = 57.14 -> 57)", () => {
    const findings = [
      { status: "pass" }, { status: "pass" }, { status: "pass" }, { status: "pass" },
      { status: "fail" }, { status: "fail" }, { status: "fail" },
    ];
    expect(calculateReadinessScore(findings)).toBe(57);
  });

  it("mixed with manual_attest: 3 pass + 2 manual_attest + 2 fail -> 57%", () => {
    const findings = [
      { status: "pass" }, { status: "pass" }, { status: "pass" },
      { status: "manual_attest" }, { status: "manual_attest" },
      { status: "fail" }, { status: "fail" },
    ];
    expect(calculateReadinessScore(findings)).toBe(57);
  });

  it("empty findings -> 0%", () => {
    expect(calculateReadinessScore([])).toBe(0);
  });

  it("scoreTier: >= 80 is sage/Ready", () => {
    expect(scoreTier(80).color).toBe("#4A8C5C");
    expect(scoreTier(100).color).toBe("#4A8C5C");
  });

  it("scoreTier: 60-79 is amber/Needs Work", () => {
    expect(scoreTier(60).color).toBe("#C2853A");
    expect(scoreTier(79).color).toBe("#C2853A");
  });

  it("scoreTier: < 60 is terracotta/At Risk", () => {
    expect(scoreTier(59).color).toBe("#B8443A");
    expect(scoreTier(0).color).toBe("#B8443A");
  });
});
