"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { credentialSchema, type CredentialInput } from "@/lib/validations/staff";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import * as Sentry from "@sentry/nextjs";

export async function addCredential(input: CredentialInput & { document_url?: string }) {
  const authData = await getClinicIdAndUser();
  if (!authData) return { error: "Unauthorized" };

  const { document_url, ...credInput } = input;
  const parsed = credentialSchema.safeParse(credInput);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("id", parsed.data.staff_member_id)
    .eq("clinic_id", authData.clinicId)
    .is("deleted_at", null)
    .single();

  if (!staff) {
    return { error: "Staff member not found." };
  }

  const { data: credential, error } = await supabase
    .from("credentials")
    .insert({
      staff_member_id: parsed.data.staff_member_id,
      credential_type_id: parsed.data.credential_type_id,
      clinic_id: authData.clinicId,
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
    return { error: "Failed to add credential. Please try again." };
  }

  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}`);
  revalidatePath(`/dashboard/staff/${parsed.data.staff_member_id}/credentials`);
  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true, id: credential.id };
}

export async function updateCredential(id: string, input: CredentialInput & { document_url?: string }) {
  const authData = await getClinicIdAndUser();
  if (!authData) return { error: "Unauthorized" };

  const { document_url, ...credInput } = input;
  const parsed = credentialSchema.safeParse(credInput);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
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
    .eq("clinic_id", authData.clinicId);

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
  const authData = await getClinicIdAndUser();
  if (!authData) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { data: cred } = await supabase
    .from("credentials")
    .select("staff_member_id")
    .eq("id", id)
    .eq("clinic_id", authData.clinicId)
    .single();

  if (!cred) return { error: "Credential not found." };
  if (cred.staff_member_id !== staffMemberId) return { error: "Credential does not belong to this staff member." };

  const { error } = await supabase
    .from("credentials")
    .delete()
    .eq("id", id)
    .eq("clinic_id", authData.clinicId);

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
  const authData = await getClinicIdAndUser();
  if (!authData) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("credentials")
    .update({
      last_verified_date: new Date().toISOString(),
      verified_by_user_id: authData.internalUserId,
    })
    .eq("id", credentialId)
    .eq("clinic_id", authData.clinicId);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to log verification." };
  }

  revalidatePath("/dashboard/credentials");
  revalidatePath("/dashboard");
  return { success: true };
}
