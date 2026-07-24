import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getEntitlements } from "@/lib/utils/entitlements";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ponytail: Polar.sh billing integration is infrastructure-ready but not yet
// activated (no Polar approval). The webhook endpoint, DB columns, and RPC
// exist. Once approved: set POLAR_WEBHOOK_SECRET, create Polar products
// with metadata plan:solo|practice|multi_location, and replace the pricing
// page buttons with Polar checkout links. Until then, this page shows plan
// details only — no payment flow.

const POLAR_ACTIVE = Boolean(process.env.POLAR_WEBHOOK_SECRET);

const PLAN_LOOKUP = {
  trial: { name: "Free Trial" },
  solo: { name: "Solo" },
  practice: { name: "Practice" },
  multi_location: { name: "Multi-Location" },
} as const;

export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, clinic_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!userRecord) redirect("/onboarding");

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, plan, trial_end_date, cancel_at_period_end")
    .eq("id", userRecord.clinic_id)
    .single();

  if (!clinic) redirect("/onboarding");

  const entitlements = getEntitlements(clinic.plan);
  const planName = PLAN_LOOKUP[clinic.plan as keyof typeof PLAN_LOOKUP]?.name ?? clinic.plan;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "#000000" }}>Billing &amp; Plan</h2>
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>Your subscription plan and limits.</p>
      </div>

      {!POLAR_ACTIVE && (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{ borderColor: "#C2853A", backgroundColor: "#FFFBEB", color: "#92400E" }}
        >
          Polar billing integration is being configured. Payment processing will be available soon.
          Your trial includes full feature access — no action needed.
        </div>
      )}

      <div className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "#000000" }}>Current Plan</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: "#000000" }}>{planName}</p>
            {clinic.plan === "trial" && clinic.trial_end_date && (
              <p className="text-sm mt-1" style={{ color: "rgba(0,0,0,0.55)" }}>
                Trial ends {new Date(clinic.trial_end_date).toLocaleDateString()}
              </p>
            )}
            {entitlements.blocked && (
              <p className="text-sm mt-1" style={{ color: "#B8443A" }}>
                {entitlements.blockedReason}
              </p>
            )}
          </div>
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}
          >
            View Plans
          </Link>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <h3 className="text-base font-medium mb-3" style={{ color: "#000000" }}>Plan Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>Staff Limit</span>
            <span style={{ color: "#000000" }}>{entitlements.maxStaff === 1000 ? "Unlimited (trial)" : entitlements.maxStaff}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>Credential Limit</span>
            <span style={{ color: "#000000" }}>{entitlements.maxCredentials === 10000 ? "Unlimited (trial)" : entitlements.maxCredentials}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>User Limit</span>
            <span style={{ color: "#000000" }}>{entitlements.maxUsers === 100 ? "Unlimited (trial)" : entitlements.maxUsers}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>Report Tier</span>
            <span style={{ color: "#000000" }}>{entitlements.reportTier === "none" ? "No reports (trial)" : entitlements.reportTier}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>Email Reports</span>
            <span style={{ color: "#000000" }}>{entitlements.canEmailReports ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(0,0,0,0.55)" }}>API Access</span>
            <span style={{ color: "#000000" }}>{entitlements.canAccessAPI ? "Yes" : "No"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
