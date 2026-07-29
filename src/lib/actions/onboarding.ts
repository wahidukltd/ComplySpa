"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClinicSchema, type CreateClinicInput } from "@/lib/validations/clinic";
import { getEntitlements } from "@/lib/utils/entitlements";
import { getOnboardingItems, getOnboardingProgress, updateOnboardingItemStatus, createOnboardingItems } from "@/lib/staff/onboarding";
import * as Sentry from "@sentry/nextjs";

// ── Existing clinic onboarding functions ──

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
      p_user_id: userId,
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
    const { sendEmail, HELLO_FROM } = await import("@/lib/email/send");
    const { buildWelcomeEmail } = await import("@/lib/email/templates/welcome");
    const firstName = authUser?.user_metadata?.name?.split(" ")[0] ?? "there";
    await sendEmail({
      from: HELLO_FROM,
      to: userEmail,
      subject: "Welcome to your compliance dashboard",
      html: buildWelcomeEmail({
        clinicName: name,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        ownerFirstName: firstName,
      }),
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

export async function completeInvitationSignup(authUserId: string): Promise<{ error: string | null }> {
  const { data: { user: authUser } } = await (await createClient()).auth.getUser();
  if (!authUser?.email) return { error: "No email found for user" };
  if (!authUser.email_confirmed_at) return { error: "Please verify your email before claiming the invitation." };

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("users")
    .select("id, clinic_id, role")
    .eq("email", authUser.email)
    .is("auth_user_id", null)
    .maybeSingle();

  if (!pending) return { error: "No invitation pending" };

  const { error } = await admin
    .from("users")
    .update({ auth_user_id: authUserId })
    .eq("id", pending.id);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to claim invitation" };
  }

  return { error: null };
}

export async function restoreExistingAccount(authUserId: string): Promise<{ redirectTo: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.email) return { redirectTo: null, error: "No email found" };

  const supabaseAdmin = createAdminClient();

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, clinic_id")
    .eq("email", authUser.email)
    .is("deleted_at", null)
    .is("auth_user_id", null)
    .maybeSingle();

  if (!existing) return { redirectTo: null, error: null };

  const { data: clinic } = await supabaseAdmin
    .from("clinics")
    .select("id, plan")
    .eq("id", existing.clinic_id)
    .maybeSingle();

  if (!clinic) return { redirectTo: null, error: null };

  const { error } = await supabaseAdmin
    .from("users")
    .update({ auth_user_id: authUserId })
    .eq("id", existing.id);

  if (error) {
    Sentry.captureException(error);
    return { redirectTo: null, error: "Failed to restore account" };
  }

  return { redirectTo: getEntitlements(clinic.plan).blocked ? "/resume" : "/dashboard", error: null };
}

export async function syncStaffOnboarding(staffId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { success: false, error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) return { success: false, error: "Unauthorized" };
  if (userRecord.role === "viewer") return { success: false, error: "Insufficient permissions" };

  const { data: staff } = await supabase
    .from("staff_members")
    .select("role")
    .eq("id", staffId)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();
  if (!staff || !staff.role) return { success: false, error: "Staff member has no role." };

  await supabase.from("onboarding_items").delete().eq("staff_member_id", staffId);
  await createOnboardingItems(staffId, userRecord.clinic_id, staff.role);

  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function syncAllStaffOnboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { success: false, error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) return { success: false, error: "Unauthorized" };
  if (userRecord.role === "viewer") return { success: false, error: "Insufficient permissions" };

  const { data: staffList } = await supabase
    .from("staff_members")
    .select("id, role")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .not("role", "is", null);

  if (!staffList || staffList.length === 0) return { success: true, count: 0 };

  let synced = 0;
  for (const staff of staffList) {
    if (staff.role) {
      await supabase.from("onboarding_items").delete().eq("staff_member_id", staff.id);
      await createOnboardingItems(staff.id, userRecord.clinic_id, staff.role);
      synced++;
    }
  }

  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard/staff");
  return { success: true, count: synced };
}

// ── New onboarding progress functions ──

export async function getStaffOnboarding(staffId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) return { error: "Unauthorized" };

  const [items, progress] = await Promise.all([
    getOnboardingItems(staffId),
    getOnboardingProgress(staffId),
  ]);

  return { items, progress };
}

export async function markOnboardingItemComplete(itemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) return { error: "Unauthorized" };
  if (userRecord.role === "viewer") return { error: "Insufficient permissions" };

  const result = await updateOnboardingItemStatus(itemId, "completed", userRecord.id);
  if (result.error) {
    Sentry.captureException(result.error);
    return { error: "Failed to complete onboarding item." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/onboarding");
  return { success: true };
}

export async function markOnboardingItemSkipped(itemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { error: "Unauthorized" };

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!userRecord) return { error: "Unauthorized" };
  if (userRecord.role === "viewer") return { error: "Insufficient permissions" };

  const result = await updateOnboardingItemStatus(itemId, "skipped", userRecord.id);
  if (result.error) {
    Sentry.captureException(result.error);
    return { error: "Failed to skip onboarding item." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/onboarding");
  return { success: true };
}
