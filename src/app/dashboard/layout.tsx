import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Toaster } from "sonner";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!userRecord) redirect("/onboarding");

  const { data: clinic } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (!clinic) redirect("/onboarding");

  if (clinic.plan === "expired_trial") redirect("/pricing?reason=trial_ended");
  if (clinic.plan === "inactive") redirect("/pricing?reason=account_inactive");

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  if (clinic.plan === "solo" && pathname.startsWith("/dashboard/settings/users")) {
    redirect("/pricing?reason=plan_upgrade_required");
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

