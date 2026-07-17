"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { staffMemberSchema, type StaffMemberInput } from "@/lib/validations/staff";
import { getClinicId } from "@/lib/utils/clinic";
import * as Sentry from "@sentry/nextjs";

export async function addStaffMember(input: StaffMemberInput) {
  const clinicId = await getClinicId();
  if (!clinicId) return { error: "Unauthorized" };

  const parsed = staffMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: staff, error } = await supabase
    .from("staff_members")
    .insert({
      ...parsed.data,
      clinic_id: clinicId,
      hire_date: parsed.data.hire_date || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    })
    .select("id")
    .single();

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to add staff member. Please try again." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard");
  return { success: true, id: staff.id };
}

export async function updateStaffMember(id: string, input: StaffMemberInput) {
  const clinicId = await getClinicId();
  if (!clinicId) return { error: "Unauthorized" };

  const parsed = staffMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_members")
    .update({
      ...parsed.data,
      hire_date: parsed.data.hire_date || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to update staff member. Please try again." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteStaffMember(id: string) {
  const clinicId = await getClinicId();
  if (!clinicId) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to remove staff member. Please try again." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard");
  return { success: true };
}
