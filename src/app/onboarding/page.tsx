import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { completeInvitationSignup } from "@/lib/actions/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) {
    redirect("/sign-in");
  }

  const { data: existingUser } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (existingUser) {
    redirect("/dashboard");
  }

  try {
    const result = await completeInvitationSignup(userId);
    if (!result.error) redirect("/dashboard");
    if (result.error !== "No invitation pending") {
      Sentry.captureMessage("Invitation signup failed", { extra: { userId, error: result.error } });
    }
  } catch (err) {
    Sentry.captureException(err);
  }

  return <OnboardingForm />;
}

