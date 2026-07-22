"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { credentialSchema, type CredentialInput } from "@/lib/validations/staff";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import * as Sentry from "@sentry/nextjs";

export async function addCredential(input: CredentialInput & { document_url?: string }) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { success: false, error: "Unauthorized" };

  const { clinicId, plan, userId } = clinicData;

  const { document_url, ...credInput } = input;
  const parsed = credentialSchema.safeParse(credInput);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role === "viewer") return { success: false, error: "Insufficient permissions" };

  // ponytail: race window between count and insert — acceptable at current scale,
  // use SERIALIZABLE isolation or BEFORE INSERT trigger if this becomes a problem
  // ponytail: clinic-wide count, not per-staff — per-staff limits if needed later
  const limits = getPlanLimits(plan);

  const { count } = await supabase
    .from("credentials")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  if ((count ?? 0) >= limits.maxCredentials) {
    return {
      success: false,
      error: `Your plan allows up to ${limits.maxCredentials} credentials. You currently have ${count ?? 0}. Upgrade to add more.`,
    };
  }

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("id", parsed.data.staff_member_id)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .single();

  if (!staff) return { success: false, error: "Staff member not found." };

  const { data: credential, error } = await supabase
    .from("credentials")
    .insert({
      staff_member_id: parsed.data.staff_member_id,
      credential_type_id: parsed.data.credential_type_id,
      clinic_id: clinicId,
      license_number: parsed.data.license_number || null,
      state: parsed.data.state || null,
      issue_date: parsed.data.issue_date || null,
      expiration_date: parsed.data.expiration_date || null,
      verification_url: parsed.data.verification_url || null,
      notes: parsed.data.notes || null,
      document_url: document_url ?? null,
    })
    .select("id, expiration_date")
    .single();

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to add credential. Please try again." };
  }

  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}`);
  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}/credentials`);
  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true, id: credential.id };
}

export async function updateCredential(id: string, input: CredentialInput & { document_url?: string }) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { error: "Unauthorized" };

  const { document_url, ...credInput } = input;
  const parsed = credentialSchema.safeParse(credInput);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data: user } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return { error: "Unauthorized" };
  if (user.role === "viewer") return { error: "Insufficient permissions" };

  const { error } = await supabase
    .from("credentials")
    .update({
      credential_type_id: parsed.data.credential_type_id,
      license_number: parsed.data.license_number || null,
      state: parsed.data.state || null,
      issue_date: parsed.data.issue_date || null,
      expiration_date: parsed.data.expiration_date || null,
      verification_url: parsed.data.verification_url || null,
      notes: parsed.data.notes || null,
      document_url: document_url ?? null,
    })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to update credential. Please try again." };
  }

  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}`);
  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}/credentials`);
  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteCredential(id: string, staffMemberId: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { error: "Unauthorized" };

  const { data: user } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return { error: "Unauthorized" };
  if (user.role === "viewer") return { error: "Insufficient permissions" };

  const { data: cred } = await supabase
    .from("credentials")
    .select("staff_member_id")
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .maybeSingle();

  if (!cred) return { error: "Credential not found." };
  if (cred.staff_member_id !== staffMemberId) return { error: "Credential does not belong to this staff member." };

  const { error } = await supabase
    .from("credentials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to delete credential. Please try again." };
  }

  revalidatePath(`/dashboard/staff/${staffMemberId}`);
  revalidatePath(`/dashboard/staff/${staffMemberId}/credentials`);
  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function verifyCredentialNow(credentialId: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { error: "Unauthorized" };

  const { data: user } = await supabase
    .from("users")
    .select("id, clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return { error: "Unauthorized" };
  if (user.role === "viewer") return { error: "Insufficient permissions" };

  const { error } = await supabase
    .from("credentials")
    .update({
      last_verified_date: new Date().toISOString(),
      verified_by_user_id: user.id,
    })
    .eq("id", credentialId)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to log verification." };
  }

  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true };
}

