import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getCheckoutUrl } from "@/lib/actions/billing";
import { OnboardingForm } from "./onboarding-form";
import { completeInvitationSignup, restoreExistingAccount } from "@/lib/actions/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(props: { searchParams: Promise<{ plan?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) {
    redirect("/sign-in");
  }

  const { plan } = await props.searchParams;
  const validPlan = plan === "solo" || plan === "practice" ? (plan as "solo" | "practice") : null;

  const { data: existingUser } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (existingUser) {
    if (validPlan) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("plan, trial_plan")
        .eq("id", existingUser.clinic_id)
        .single();

      if (clinic) {
        // Already on the chosen plan, or already evaluating it in a trial —
        // either way the user is set; send them to the dashboard.
        if (
          clinic.plan === validPlan ||
          (clinic.plan === "trial" && clinic.trial_plan === validPlan)
        ) {
          redirect("/dashboard");
        }
        // Finding 6 (security review 2026-08-08): this is a third checkout
        // entry point on the same money path — route through the owner-gated
        // getCheckoutUrl server action (owner role + shouldBlockNewCheckout +
        // productAvailable), never a direct createCheckoutLink call.
        const result = await getCheckoutUrl(validPlan, "monthly");
        if (result.url) {
          redirect(result.url);
        }
        // Finding 19: a truthful fallback instead of silently landing on the
        // dashboard when no checkout URL can be created (unconfigured or
        // unavailable product — the common case pre-approval).
        redirect("/pricing?reason=unavailable");
      }
    }
    redirect("/dashboard");
  }

  try {
    const existingAccount = await restoreExistingAccount(userId);
    if (existingAccount.redirectTo) {
      redirect(existingAccount.redirectTo);
    }

    const result = await completeInvitationSignup(userId);
    if (!result.error) redirect("/dashboard");
    if (result.error !== "No invitation pending") {
      Sentry.captureMessage("Invitation signup failed", { extra: { userId, error: result.error } });
    }
  } catch (err) {
    Sentry.captureException(err);
  }

  return <OnboardingForm plan={validPlan} />;
}
