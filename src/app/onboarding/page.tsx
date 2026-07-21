import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { completeInvitationSignup } from "@/lib/actions/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const supabase = await createClient();

  const { data: existingUser } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existingUser) {
    redirect("/dashboard");
  }

  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    const metaClinicId = clerkUser.publicMetadata?.clinic_id as string | undefined;
    const metaRole = clerkUser.publicMetadata?.role as string | undefined;

    if (metaClinicId && metaRole) {
      const result = await completeInvitationSignup(userId, metaClinicId, metaRole);
      if (!result.error) redirect("/dashboard");
      Sentry.captureMessage("Invitation signup failed", { extra: { userId, error: result.error } });
    }
  } catch (err) {
    Sentry.captureException(err);
  }

  return <OnboardingForm />;
}
