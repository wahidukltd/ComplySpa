import type { ReadinessResult } from "@/lib/staff/readiness";

export function computeComplianceHealth(
  results: Record<string, ReadinessResult>,
): { score: number; readyCount: number; totalStaff: number } {
  const totalStaff = Object.keys(results).length;
  if (totalStaff === 0) return { score: 0, readyCount: 0, totalStaff: 0 };
  const readyCount = Object.values(results).filter((r) => r.status === "ready").length;
  // Floor, not round: a compliance score must never display higher than the
  // true work-ready rate (18/19 → 94%, matching the owner-approved format).
  return { score: Math.floor((readyCount / totalStaff) * 100), readyCount, totalStaff };
}
