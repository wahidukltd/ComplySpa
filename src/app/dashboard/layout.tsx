import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";

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
    throw new Error("Failed to load user data");
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
    throw new Error("Failed to load clinic data");
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

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  if (clinic.plan === "solo") {
    const soloRestricted = pathname.startsWith("/dashboard/audit") || pathname.startsWith("/dashboard/settings/users");
    if (soloRestricted) {
      redirect("/pricing?reason=plan_upgrade_required");
    }
  }

  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            border: "1px solid var(--color-hairline)",
            color: "var(--color-ink)",
          },
        }}
      />
    </>
  );
}
