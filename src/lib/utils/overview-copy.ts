export function formatUnresolvedStaff(pending: number, atRisk: number, nonCompliant: number): string {
  const parts: string[] = [];
  if (pending > 0) {
    parts.push(`${pending} staff member${pending > 1 ? "s" : ""} not yet work-ready (no credentials tracked)`);
  }
  if (atRisk > 0) parts.push(`${atRisk} at risk`);
  if (nonCompliant > 0) parts.push(`${nonCompliant} non-compliant`);
  if (parts.length === 0) return "";
  return `${parts.join(", ")}. See the hero chips for details.`;
}
