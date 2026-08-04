import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

// Report temp files live in the documents bucket at `${clinicId}/${...}.pdf`
// (uploaded via uploadDocument). The route validates the path against this
// pattern AND the session clinic_id before touching the file — tenant comes
// from the session, never from the request (migration 049 principle).
export const REPORT_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+\.pdf$/;

export function isClinicScopedReportPath(filePath: string, clinicId: string): boolean {
  if (!REPORT_FILE_PATTERN.test(filePath)) return false;
  return filePath.startsWith(`${clinicId}/`);
}

// Reports are ephemeral — the temp file must not outlive the send attempt.
// Runs as service_role so cleanup works regardless of who uploaded.
export async function deleteReportFileFromStorage(filePath: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.storage.from("documents").remove([filePath]);
    if (error) {
      Sentry.captureMessage("Report email: storage cleanup failed", {
        level: "error",
        extra: { filePath },
      });
      return false;
    }
    return true;
  } catch (err) {
    Sentry.captureMessage("Report email: storage cleanup threw", {
      level: "error",
      extra: { filePath, error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
}
