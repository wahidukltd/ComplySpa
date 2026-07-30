"use server";

import "server-only";
import { getActionsSummary } from "@/lib/staff/compliance-actions";

export async function getActionCount(): Promise<number> {
  const summary = await getActionsSummary();
  return summary.critical + summary.warning;
}
