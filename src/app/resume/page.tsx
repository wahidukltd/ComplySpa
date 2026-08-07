import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/utils/entitlements";
import { polarConfig } from "@/lib/polar/config";
import type { PlanId } from "@/lib/polar/checkout";
import { ResumeScreen } from "./resume-screen";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, email, clinic_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!userRecord) redirect("/onboarding");

  const [clinicRes, countsRes] = await Promise.all([
    supabase.from("clinics").select("name, plan, trial_plan").eq("id", userRecord.clinic_id).single(),
    // B6 (plan 2026-08-08) + review finding 5: count ALL preserved rows —
    // suspended staff/credentials are still the clinic's data ("Everything you
    // built is securely preserved"). A direct count through the RLS-scoped
    // client is a no-op for revoked clinics (036 SELECT policies filter
    // suspended_at IS NULL), so this runs through the scoped SECURITY DEFINER
    // RPC (048/049 pattern — tenant from the session, never a caller arg).
    supabase.rpc("count_preserved_clinic_data"),
  ]);

  if (clinicRes.error) redirect("/onboarding");
  const clinic = clinicRes.data;
  const entitlements = getEntitlements(clinic.plan, clinic.trial_plan);
  if (!entitlements.blocked) redirect("/dashboard");

  const plans: { id: PlanId; name: string; monthly: number }[] = [
    { id: "solo", name: "Solo", monthly: 29 },
    { id: "practice", name: "Practice", monthly: 49 },
  ];

  const counts = countsRes.data?.[0];
  return (
    <ResumeScreen
      clinicName={clinic.name}
      staffCount={counts?.staff_count ?? 0}
      credentialCount={counts?.credential_count ?? 0}
      plan={clinic.plan as "expired_trial" | "inactive"}
      plans={plans}
      polarEnabled={polarConfig.enabled}
      userEmail={userRecord.email}
    />
  );
}
