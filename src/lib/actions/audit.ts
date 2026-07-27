"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import * as Sentry from "@sentry/nextjs";

export async function createAuditRun(): Promise<{ success: boolean; error?: string }> {
  const clinicData = await getClinicIdAndUser();
  if (!clinicData) return { success: false, error: "Unauthorized" };

  const { clinicId, internalUserId } = clinicData;

  const supabase = await createClient();

  const { data: expiredCount } = await supabase
    .from("credentials")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "expired")
    .is("deleted_at", null);

  const { data: expiringCount } = await supabase
    .from("credentials")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "expiring")
    .is("deleted_at", null);

  const { error } = await supabase.from("audit_reports").insert({
    clinic_id: clinicId,
    generated_by_user_id: internalUserId ?? undefined,
    report_data_snapshot: {
      type: "readiness_scan",
      expired_count: expiredCount ?? 0,
      expiring_count: expiringCount ?? 0,
      generated_at: new Date().toISOString(),
    },
  });

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to create audit." };
  }

  return { success: true };
}
