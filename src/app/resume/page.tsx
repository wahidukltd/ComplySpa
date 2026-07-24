import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/utils/entitlements";
import { createCheckoutLink } from "@/lib/polar/checkout";
import { polarConfig } from "@/lib/polar/config";
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
    supabase.from("clinics").select("id, plan, trial_end_date").eq("id", userRecord.clinic_id).single(),
    supabase.from("staff_members").select("id", { count: "exact", head: true }).eq("clinic_id", userRecord.clinic_id).is("deleted_at", null),
    supabase.from("credentials").select("id", { count: "exact", head: true }).eq("clinic_id", userRecord.clinic_id).is("deleted_at", null),
  ]);

  const clinic = clinicRes.data;
  if (!clinic) redirect("/onboarding");

  const entitlements = getEntitlements(clinic.plan);
  if (!entitlements.blocked) redirect("/dashboard");

  let checkoutUrl: string | null = null;
  if (polarConfig.enabled) {
    const result = await createCheckoutLink("practice", undefined, { clinic_id: clinic.id });
    checkoutUrl = result.url;
  }

  return (
    <ResumeScreen
      staffCount={staffRes.count ?? 0}
      credentialCount={credRes.count ?? 0}
      plan={clinic.plan as "expired_trial" | "inactive"}
      checkoutUrl={checkoutUrl}
      userEmail={userRecord.email}
    />
  );
}
