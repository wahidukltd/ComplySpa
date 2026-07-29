"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { staffMemberSchema, addStaffWithCredentialsSchema, type StaffMemberInput, type AddStaffWithCredentialsInput } from "@/lib/validations/staff";
import { createOnboardingItems } from "@/lib/staff/onboarding";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import { PlanLimitError } from "@/lib/utils/errors";
import * as Sentry from "@sentry/nextjs";

export async function addStaffMember(input: StaffMemberInput) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { success: false, error: "Unauthorized" };

  const { clinicId, plan, userId } = clinicData;

  const parsed = staffMemberSchema.safeParse(input);
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
  const limits = getPlanLimits(plan);

  const { count } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if ((count ?? 0) >= limits.maxStaff) {
    const err = new PlanLimitError(
      "Your plan has reached its staff limit. Upgrade to add more.",
      "STAFF_LIMIT",
      count ?? 0,
      limits.maxStaff,
    );
    Sentry.captureException(err);
    return { success: false, error: err.message };
  }

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
    return { success: false, error: "Failed to add staff member. Please try again." };
  }

  const staffRole = parsed.data.role;
  if (staffRole) {
    await createOnboardingItems(staff.id, clinicId, staffRole);
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard");
  return { success: true, id: staff.id };
}

export async function updateStaffMember(id: string, input: StaffMemberInput) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { error: "Unauthorized" };

  const parsed = staffMemberSchema.safeParse(input);
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

  const { data: currentStaff } = await supabase
    .from("staff_members")
    .select("role")
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .is("deleted_at", null)
    .single();
  if (!currentStaff) return { error: "Staff member not found." };

  const oldRole = currentStaff.role;
  const newRole = parsed.data.role;

  const { error } = await supabase
    .from("staff_members")
    .update({
      ...parsed.data,
      hire_date: parsed.data.hire_date || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .is("deleted_at", null);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to update staff member. Please try again." };
  }

  if (newRole && oldRole !== newRole) {
    await supabase.from("onboarding_items").delete().eq("staff_member_id", id);
    await createOnboardingItems(id, user.clinic_id, newRole);
  }

  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${id}`);
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteStaffMember(id: string) {
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

  const { error } = await supabase
    .from("staff_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .is("deleted_at", null);

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to remove staff member. Please try again." };
  }

  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function addStaffMemberWithCredentials(input: AddStaffWithCredentialsInput) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { success: false, error: "Unauthorized" };

  const { clinicId, plan, userId } = clinicData;

  const parsed = addStaffWithCredentialsSchema.safeParse(input);
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

  const limits = getPlanLimits(plan);

  const { count: staffCount } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if ((staffCount ?? 0) >= limits.maxStaff) {
    const err = new PlanLimitError(
      "Your plan has reached its staff limit. Upgrade to add more.",
      "STAFF_LIMIT",
      staffCount ?? 0,
      limits.maxStaff,
    );
    Sentry.captureException(err);
    return { success: false, error: err.message };
  }

  const wizardCount = parsed.data.credentials.length;
  if (wizardCount > 0) {
    const { count: credCount } = await supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .is("suspended_at", null);

    if ((credCount ?? 0) + wizardCount > limits.maxCredentials) {
      const err = new PlanLimitError(
        "Your plan has reached its credential limit. Upgrade to add more.",
        "CREDENTIAL_LIMIT",
        (credCount ?? 0) + wizardCount,
        limits.maxCredentials,
      );
      Sentry.captureException(err);
      return { success: false, error: err.message };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials, ...staffBase } = parsed.data;
  const staffInput = {
    ...staffBase,
    clinic_id: clinicId,
    hire_date: staffBase.hire_date || null,
    email: staffBase.email || null,
    phone: staffBase.phone || null,
    location: staffBase.location || null,
    department: staffBase.department || null,
    manager: staffBase.manager || null,
  };

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .insert(staffInput)
    .select("id")
    .single();

  if (staffError) {
    Sentry.captureException(staffError);
    return { success: false, error: "Failed to add staff member. Please try again." };
  }

  const role = parsed.data.role;
  if (role) {
    const onboardingResult = await createOnboardingItems(staff.id, clinicId, role);
    if (onboardingResult.error) {
      await supabase.from("staff_members").update({ deleted_at: new Date().toISOString() }).eq("id", staff.id);
      return { success: false, error: onboardingResult.error };
    }
  }

  if (wizardCount > 0) {
    const credentialRows = parsed.data.credentials.map((c) => ({
      staff_member_id: staff.id,
      credential_type_id: c.credential_type_id,
      clinic_id: clinicId,
      license_number: c.license_number || null,
      state: c.state || null,
      issue_date: c.issue_date || null,
      expiration_date: c.expiration_date || null,
    }));

    const { error: credError } = await supabase
      .from("credentials")
      .insert(credentialRows);

    if (credError) {
      Sentry.captureException(credError);
      await supabase.from("staff_members").update({ deleted_at: new Date().toISOString() }).eq("id", staff.id);
      return { success: false, error: "Failed to add credentials. Staff member was not created." };
    }
  }

  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${staff.id}`);
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard");
  return { success: true, id: staff.id };
}

