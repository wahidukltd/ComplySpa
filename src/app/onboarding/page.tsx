import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

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

  return <OnboardingForm />;
}
