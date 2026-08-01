import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutLink } from "@/lib/polar/checkout";
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
        .select("plan, polar_customer_id")
        .eq("id", existingUser.clinic_id)
        .single();

      if (clinic) {
        if (clinic.plan === validPlan) {
          redirect("/dashboard");
        }
        const result = await createCheckoutLink(validPlan, clinic.polar_customer_id ?? undefined, {
          clinic_id: existingUser.clinic_id,
          plan: validPlan,
        });
        if (result?.url) {
          redirect(result.url);
        }
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
