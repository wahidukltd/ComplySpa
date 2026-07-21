"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClinicSchema, type CreateClinicInput } from "@/lib/validations/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

async function createClinicInternal(input: CreateClinicInput) {
  const { userId } = await auth();
  if (!userId) return { clinicId: null, error: "Unauthorized. Please sign in and try again.", fieldErrors: undefined as Record<string, string[]> | undefined };

  const parsed = createClinicSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { clinicId: null, error: "Validation failed", fieldErrors };
  }

  const { name, address, state } = parsed.data;

  const clerk = await clerkClient();
  let userEmail: string | undefined;
  try {
    const clerkUser = await clerk.users.getUser(userId);
    userEmail = clerkUser.emailAddresses[0]?.emailAddress;
    const primaryEmail = clerkUser.emailAddresses.find(
      e => e.id === clerkUser.primaryEmailAddressId,
    );
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== "verified") {
      return { clinicId: null, error: "Please verify your email address before setting up your clinic.", fieldErrors: undefined };
    }
  } catch {
    return { clinicId: null, error: "Unable to verify your account. Please try again or contact support.", fieldErrors: undefined };
  }

  if (!userEmail) {
    return { clinicId: null, error: "Your account must have a verified email address to continue.", fieldErrors: undefined };
  }

  const supabase = await createClient();

  const { data: clinicId, error: rpcError } = await supabase.rpc(
    "create_clinic_for_user",
    {
      p_clerk_sub: userId,
      p_email: userEmail,
      p_name: name,
      p_address: address || undefined,
      p_state: state || undefined,
    }
  );

  if (rpcError) {
    Sentry.captureMessage("Onboarding RPC failed", { extra: { userId, error: rpcError } });
    return { clinicId: null, error: "Unable to create clinic. Please try again.", fieldErrors: undefined };
  }

  if (!clinicId) {
    return { clinicId: null, error: "Unable to create clinic. Please try again.", fieldErrors: undefined };
  }

  try {
    await clerk.users.updateUser(userId, {
      publicMetadata: { clinic_id: clinicId },
    });
  } catch (err) {
    Sentry.captureException(err);
  }

  return { clinicId, error: null, fieldErrors: undefined };
}

export async function createClinic(input: CreateClinicInput) {
  const result = await createClinicInternal(input);
  if (result.error) return result;
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function createClinicOnboarding(input: CreateClinicInput) {
  const result = await createClinicInternal(input);
  if (result.error) return { clinicId: null, error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/dashboard");
  return { clinicId: result.clinicId, error: null };
}

export async function completeInvitationSignup(clerkUserId: string, clinicId: string, role: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id")
    .eq("id", clinicId)
    .maybeSingle();

  if (!clinic) return { error: "Clinic not found" };

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (existing) return { error: null };

  const { data: planData } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", clinicId)
    .single();
  const limits = getPlanLimits(planData?.plan ?? "trial");

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  if ((count ?? 0) >= limits.maxUsers) {
    return { error: "User limit reached for this clinic plan." };
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return { error: "No email found in Clerk account" };

  const { error } = await supabase
    .from("users")
    .insert({
      clinic_id: clinicId,
      email,
      role,
      clerk_user_id: clerkUserId,
    });

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to create user record" };
  }

  return { error: null };
}
