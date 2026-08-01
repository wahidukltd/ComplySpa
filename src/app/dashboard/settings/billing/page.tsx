import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getEntitlements } from "@/lib/utils/entitlements";
import { createCheckoutLink } from "@/lib/polar/checkout";
import { createCustomerPortalUrl } from "@/lib/polar/customer-portal";
import { polarConfig } from "@/lib/polar/config";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLAN_LOOKUP: Record<string, string> = {
  trial: "Free Trial",
  solo: "Solo",
  practice: "Practice",
  expired_trial: "Expired Trial",
  inactive: "Inactive",
};
const PAID_PLANS = new Set(["solo", "practice"]);

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
    .select("id, plan, trial_end_date, polar_customer_id, cancel_at_period_end")
    .eq("id", userRecord.clinic_id)
    .single();

  if (!clinic) redirect("/onboarding");

  const entitlements = getEntitlements(clinic.plan);
  const planName = PLAN_LOOKUP[clinic.plan] ?? clinic.plan;
  const isPaid = PAID_PLANS.has(clinic.plan);

  let checkoutUrl: string | null = null;
  let portalUrl: string | null = null;

  if (polarConfig.enabled) {
    if (isPaid && clinic.polar_customer_id) {
      const portal = await createCustomerPortalUrl(clinic.polar_customer_id);
      portalUrl = portal.url;
    } else if (!isPaid && clinic.plan === "trial") {
      const checkout = await createCheckoutLink("practice", clinic.polar_customer_id ?? undefined, {
        clinic_id: clinic.id,
      });
      checkoutUrl = checkout.url;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "#000000" }}>Billing &amp; Plan</h2>
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>Manage your subscription and billing.</p>
      </div>

      {!polarConfig.enabled && clinic.plan === "trial" && (
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
            {clinic.cancel_at_period_end && (
              <p className="text-sm mt-1" style={{ color: "#C2853A" }}>
                Subscription will cancel at end of billing period
              </p>
            )}
            {entitlements.blocked && (
              <p className="text-sm mt-1" style={{ color: "#B8443A" }}>
                {entitlements.blockedReason}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <h3 className="text-base font-medium mb-3" style={{ color: "#000000" }}>
          {isPaid ? "Manage Subscription" : "Subscribe"}
        </h3>
        <p className="text-sm mb-4" style={{ color: "rgba(0,0,0,0.55)" }}>
          {isPaid
            ? portalUrl
              ? "Manage your payment method, view invoices, or change your plan in the customer portal."
              : "Visit your billing settings to manage your subscription."
            : "Choose a plan that fits your clinic size."}
        </p>
        <div className="flex flex-wrap gap-3">
          {isPaid && portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}
            >
              Customer Portal
            </a>
          )}
          {!isPaid && checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}
            >
              Subscribe Now
            </a>
          )}
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ borderColor: "rgba(0,0,0,0.12)", color: "#000000" }}
          >
            {isPaid ? "Change Plan" : "View Plans"}
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
        </div>
      </div>
    </div>
  );
}
