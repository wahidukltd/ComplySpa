"use server";
import "server-only";

import type { ReportData } from "@/lib/pdf/report-content";
import { getReportSession } from "@/lib/report/session";
import { assembleReportData } from "@/lib/report/data";

// Thin session wrapper over the shared gate + assembly: getReportSession()
// (auth → users → clinic → entitlements) then assembleReportData(). The
// delivery routes use the same two modules directly — one gate, one assembly.
export async function getReportData(): Promise<{
  data: ReportData | null;
  error: string | null;
}> {
  const session = await getReportSession();
  if (session.status !== 200) {
    return { data: null, error: session.error };
  }

  return assembleReportData(session.clinicId, session.email);
}
