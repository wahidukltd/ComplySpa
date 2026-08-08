import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Toaster } from "sonner";
import { getEntitlements } from "@/lib/utils/entitlements";

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
    .select("plan, trial_plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (!clinic) redirect("/onboarding");

  const { blocked } = getEntitlements(clinic.plan, clinic.trial_plan);

  if (blocked) {
    redirect("/resume");
  }

  // Plan 2026-08-08 (owner decision): the Users tab is viewable read-only on
  // every active plan; mutations stay owner-only in actions + RLS, so no
  // per-plan route gate is needed here.

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

