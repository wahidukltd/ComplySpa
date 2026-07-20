"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClinicSchema, type CreateClinicInput } from "@/lib/validations/clinic";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

export async function createClinic(input: CreateClinicInput) {
  const { userId } = await auth();
  if (!userId) {
    return { error: "Unauthorized. Please sign in and try again." };
  }

  const parsed = createClinicSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { error: "Validation failed", fieldErrors };
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
      return { error: "Please verify your email address before setting up your clinic." };
    }
  } catch {
    return {
      error:
        "Unable to verify your account. Please try again or contact support.",
    };
  }

  if (!userEmail) {
    return { error: "Your account must have a verified email address to continue." };
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
    return { error: "Unable to create clinic. Please try again." };
  }

  if (!clinicId) {
    return { error: "Unable to create clinic. Please try again." };
  }

  try {
    await clerk.users.updateUser(userId, {
      publicMetadata: { clinic_id: clinicId },
    });
  } catch (err) {
    Sentry.captureException(err);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
