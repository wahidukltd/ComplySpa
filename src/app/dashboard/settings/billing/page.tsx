import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { BillingClient } from "@/components/billing/billing-client";
import { getBillingOverview } from "@/lib/actions/billing";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) redirect("/onboarding");

  const { data, error } = await getBillingOverview();
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Billing & Plan"
          description="Your plan, billing cycle, and payment details."
        />
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            We couldn&apos;t load your billing details. Refresh the page to try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Plan"
        description="Your plan, billing cycle, and payment details."
      />
      <BillingClient overview={data!} />
    </div>
  );
}
