import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/utils/entitlements";

// Discriminated union: a 200 always carries the full session context, an
// error status always carries a message. The routes can narrow on `status`
// and trust the fields — a 200-with-missing-fields response is unrepresentable.
export type ReportSession =
  | {
      status: 200;
      email: string;
      role: string;
      clinicId: string;
      tier: "basic" | "audit";
    }
  | { status: 401 | 403 | 404; error: string };

// Shared authorization gate for the report delivery routes. The tenant and the
// report tier always come from the session (migration 049 principle) — the
// routes accept no client-supplied identifiers, so cross-tenant access is
// structurally impossible. The viewer check deliberately lives in the email
// route (viewers may preview/download); this helper only enforces auth, user
// existence, and the plan gate (tier "none" → 403).
export async function getReportSession(): Promise<ReportSession> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 401, error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("email, role, clinic_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!userRecord) return { status: 404, error: "User not found" };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("plan, trial_plan")
    .eq("id", userRecord.clinic_id)
    .single();

  if (!clinic) return { status: 404, error: "Clinic not found" };

  const tier = getEntitlements(clinic.plan, clinic.trial_plan).reportTier;
  if (tier === "none") {
    return { status: 403, error: "Reports are not available on your current plan" };
  }

  return {
    status: 200,
    email: userRecord.email,
    role: userRecord.role,
    clinicId: userRecord.clinic_id,
    tier,
  };
}
