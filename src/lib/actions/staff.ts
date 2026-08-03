"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { staffMemberSchema, addStaffWithCredentialsSchema, type StaffMemberInput, type AddStaffWithCredentialsInput } from "@/lib/validations/staff";
import { createOnboardingItems, reconcileOnboardingItemsToRole } from "@/lib/staff/onboarding";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import { getCredentialStatus } from "@/lib/utils/status";
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
    const onboardingResult = await createOnboardingItems(staff.id, clinicId, staffRole, { flow: "add-staff" });
    if (onboardingResult.error) {
      // Roll back the staff row — a hire whose requirements failed to
      // generate must not linger as a half-created record. Clean up any items
      // created before the failure so no orphan rows accumulate.
      await supabase.rpc("soft_delete_staff_member", { p_staff_id: staff.id, p_clinic_id: clinicId });
      await supabase.from("onboarding_items").delete().eq("staff_member_id", staff.id).eq("clinic_id", clinicId);
      return { success: false, error: onboardingResult.error };
    }
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

  // Role-clear guard (D6): a staff member with a role cannot have it cleared
  // via the API — their requirements would orphan with no recovery surface
  // (sync is insert-only and the checklist depends on a role).
  if (!newRole && oldRole) {
    return { error: "A role cannot be cleared. Select a role to continue." };
  }

  // Optimistic concurrency (review 2026-08-03): guard the UPDATE on the role
  // as read, so a concurrent admin's committed role change is never clobbered
  // and items are never reconciled against a stale template. 0 rows = someone
  // else changed the record — fail with a reload instruction, not silence.
  const updateBuilder = supabase
    .from("staff_members")
    .update({
      ...parsed.data,
      hire_date: parsed.data.hire_date || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  const guardedUpdate = oldRole
    ? updateBuilder.eq("role", oldRole)
    : updateBuilder.is("role", null);

  const { data: updated, error } = await guardedUpdate
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to update staff member. Please try again." };
  }
  if (!updated) {
    return { error: "This staff member was changed by someone else. Reload and try again." };
  }

  if (newRole && oldRole !== newRole) {
    // D3: additive-preserving regeneration — retained items keep their
    // completion history, new requirements are inserted (backfilled when a
    // live credential is held), obsolete requirements are removed.
    const result = await reconcileOnboardingItemsToRole(id, user.clinic_id, newRole, "role-change");
    if (result.error) {
      // D11 failure atomicity: the role UPDATE already succeeded — revert it
      // ONLY if the role is still what we set (never clobber a concurrent
      // change), then surface a distinct recovery error so a retry is never
      // silently treated as converged.
      const { data: reverted, error: revertErr } = await supabase
        .from("staff_members")
        .update({ role: oldRole })
        .eq("id", id)
        .eq("clinic_id", user.clinic_id)
        .eq("role", newRole)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (revertErr) Sentry.captureException(revertErr);
      if (revertErr || !reverted) {
        return {
          error:
            "Role updated, but requirements could not be regenerated and the role could not be restored. Reload the page and use \"Sync to role template\" to recover.",
        };
      }
      return { error: result.error };
    }

    revalidatePath("/dashboard/staff");
    revalidatePath(`/dashboard/staff/${id}`);
    revalidatePath("/dashboard");
    return { success: true, added: result.added, removed: result.removed, backfilled: result.backfilled };
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

  // Soft-delete via a scoped SECURITY DEFINER function (migration 048): a
  // direct UPDATE of deleted_at fails RLS (the SELECT policies filter
  // deleted_at IS NULL, and Postgres rejects an UPDATE whose new row becomes
  // invisible under SELECT policies). RPC is pinned to the session clinic.
  const { data: deleted, error } = await supabase.rpc("soft_delete_staff_member", {
    p_staff_id: id,
    p_clinic_id: user.clinic_id,
  });

  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to remove staff member. Please try again." };
  }
  if (!deleted) return { error: "Staff member not found." };

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
    // Validate every credential type against the clinic's accessible set
    // (global defaults + own custom types) before any insert — mirrors
    // addCredential; a client-supplied id referencing another clinic's custom
    // type must not reach the INSERT (D6). The Set comparison also rejects
    // duplicate type ids as defense-in-depth behind the schema refine.
    const credentialTypeIds = parsed.data.credentials.map((c) => c.credential_type_id);
    const { data: typeRows, error: typeErr } = await supabase
      .from("credential_types")
      .select("id")
      .in("id", credentialTypeIds)
      .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);
    if (typeErr || !typeRows || typeRows.length !== new Set(credentialTypeIds).size) {
      return { success: false, error: "Invalid credential type." };
    }

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
    const onboardingResult = await createOnboardingItems(staff.id, clinicId, role, { flow: "add-staff-wizard" });
    if (onboardingResult.error) {
      await supabase.rpc("soft_delete_staff_member", { p_staff_id: staff.id, p_clinic_id: clinicId });
      await supabase.from("onboarding_items").delete().eq("staff_member_id", staff.id).eq("clinic_id", clinicId);
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
      // D5: status computed at insert — a past-date credential is expired the
      // moment it is created, not at the next 05:00 cron.
      status: getCredentialStatus(c.expiration_date || null),
    }));

    const { error: credError } = await supabase
      .from("credentials")
      .insert(credentialRows);

    if (credError) {
      Sentry.captureException(credError);
      await supabase.rpc("soft_delete_staff_member", { p_staff_id: staff.id, p_clinic_id: clinicId });
      await supabase.from("onboarding_items").delete().eq("staff_member_id", staff.id).eq("clinic_id", clinicId);
      return { success: false, error: "Failed to add credentials. Staff member was not created." };
    }
  }

  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${staff.id}`);
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard");
  return { success: true, id: staff.id };
}


