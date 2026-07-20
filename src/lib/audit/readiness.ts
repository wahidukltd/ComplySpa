import type { FindingStatus } from "./checklist";

export function calculateReadinessScore(
  findings: Array<{ status: FindingStatus }>,
): number {
  if (findings.length === 0) return 0;

  const points = findings.reduce((sum, f) => {
    switch (f.status) {
      case "pass":
        return sum + 1.0;
      case "manual_attest":
        return sum + 0.5;
      case "fail":
      case "stale":
      default:
        return sum + 0;
    }
  }, 0);

  return Math.round((points / findings.length) * 100);
}

export function scoreTier(score: number): { color: string; label: string } {
  if (score >= 80) return { color: "#4A8C5C", label: "Ready" };
  if (score >= 60) return { color: "#C2853A", label: "Needs Work" };
  return { color: "#B8443A", label: "At Risk" };
}
