"use server";
import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClinicSchema, type CreateClinicInput } from "@/lib/validations/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

async function createClinicInternal(input: CreateClinicInput) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { clinicId: null, error: "Unauthorized. Please sign in and try again.", fieldErrors: undefined as Record<string, string[]> | undefined };

  const parsed = createClinicSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { clinicId: null, error: "Validation failed", fieldErrors };
  }

  const { name, address, state } = parsed.data;

  const userEmail = authUser?.email ?? null;
  if (!authUser?.email_confirmed_at) {
    return { clinicId: null, error: "Please verify your email address before setting up your clinic.", fieldErrors: undefined };
  }

  if (!userEmail) {
    return { clinicId: null, error: "Your account must have a verified email address to continue.", fieldErrors: undefined };
  }

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
    Sentry.captureException(rpcError);
    return { clinicId: null, error: "Unable to create clinic. Please try again.", fieldErrors: undefined };
  }

  if (!clinicId) {
    return { clinicId: null, error: "Unable to create clinic. Please try again.", fieldErrors: undefined };
  }

  try {
    const { sendEmail } = await import("@/lib/email/send");
    await sendEmail({
      to: userEmail,
      subject: "Welcome to your compliance dashboard",
      html: `<p>Your clinic "${name}" is set up and ready.</p>
<p>You've added staff and credentials. Your first inspection-readiness scan is running now.</p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Go to your dashboard</a></p>`,
    });
  } catch (emailErr) {
    Sentry.captureException(emailErr);
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

export async function completeInvitationSignup(clerkUserId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) return { error: "No email found for user" };

  const { data: pending } = await supabase
    .from("users")
    .select("id, clinic_id, role")
    .eq("email", authUser.email)
    .eq("clerk_user_id", "")
    .maybeSingle();

  if (!pending) return { error: "No invitation pending" };

  const { error } = await supabase
    .from("users")
    .update({ clerk_user_id: clerkUserId })
    .eq("id", pending.id);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to claim invitation" };
  }

  return { error: null };
}
