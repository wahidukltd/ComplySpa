import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const supabase = await createClient();

  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (userErr) {
    Sentry.captureException(userErr);
    throw userErr;
  }

  if (!userRecord) {
    redirect("/onboarding");
  }

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (clinicErr) {
    Sentry.captureException(clinicErr);
    throw clinicErr;
  }

  if (!clinic) {
    redirect("/onboarding");
  }

  if (clinic.plan === "expired_trial") {
    redirect("/pricing?reason=trial_ended");
  }

  if (clinic.plan === "inactive") {
    redirect("/pricing?reason=account_inactive");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
