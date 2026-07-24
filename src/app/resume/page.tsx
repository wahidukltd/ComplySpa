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

  const [clinicRes, staffRes, credRes] = await Promise.all([
    supabase.from("clinics").select("name, plan, trial_end_date").eq("id", userRecord.clinic_id).single(),
    supabase.from("staff_members").select("id", { count: "exact", head: true }).eq("clinic_id", userRecord.clinic_id).is("deleted_at", null),
    supabase.from("credentials").select("id", { count: "exact", head: true }).eq("clinic_id", userRecord.clinic_id).is("deleted_at", null),
  ]);

  if (clinicRes.error) redirect("/onboarding");
  const clinic = clinicRes.data;
  const entitlements = getEntitlements(clinic.plan);
  if (!entitlements.blocked) redirect("/dashboard");

  const plans: { id: PlanId; name: string; monthly: number }[] = [
    { id: "solo", name: "Solo", monthly: 29 },
    { id: "practice", name: "Practice", monthly: 49 },
    { id: "multi_location", name: "Multi-Location", monthly: 79 },
  ];

  return (
    <ResumeScreen
      clinicName={clinic.name}
      staffCount={staffRes.count ?? 0}
      credentialCount={credRes.count ?? 0}
      plan={clinic.plan as "expired_trial" | "inactive"}
      plans={plans}
      polarEnabled={polarConfig.enabled}
      userEmail={userRecord.email}
    />
  );
}
