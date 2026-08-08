"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import { getEntitlements } from "@/lib/utils/entitlements";
import { sendInvitationEmail } from "@/lib/email/send";
import {
  clinicProfileSchema,
  alertRecipientSchema,
  inviteUserSchema,
  type ClinicProfileInput,
  type AlertRecipientInput,
  type InviteUserInput,
} from "@/lib/validations/settings";
import * as Sentry from "@sentry/nextjs";

async function getAuth() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, role, clinic_id")
    .eq("auth_user_id", ctx.userId)
    .maybeSingle();
  if (error || !user) {
    if (error) Sentry.captureException(error);
    return null;
  }
  return { id: user.id, role: user.role, clinic_id: user.clinic_id };
}

async function getClinicName(clinicId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle();
  return data?.name ?? "Your clinic";
}

// ─── Clinic Profile ─────────────────────────────────────────────────────────

export async function updateClinicProfile(input: ClinicProfileInput) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "owner") return { success: false, error: "Only the owner can update clinic profile" };

  const parsed = clinicProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name: parsed.data.name,
      address: parsed.data.address || null,
      state: parsed.data.state || null,
    })
    .eq("id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to update clinic profile" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}

// ─── Alert Recipients ────────────────────────────────────────────────────────

export async function getAlertRecipients() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return { recipients: [], error: "Unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("alert_recipients")
    .select("id, email, is_active, created_at")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at");
  return { recipients: data ?? [], error: null };
}

async function checkAlertRecipientEntitlement(clinicId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: clinic } = await supabase.from("clinics").select("plan, trial_plan").eq("id", clinicId).maybeSingle();
  return clinic ? getEntitlements(clinic.plan, clinic.trial_plan).canManageAlertRecipients : false;
}

export async function addAlertRecipient(input: AlertRecipientInput) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };
  if (!(await checkAlertRecipientEntitlement(user.clinic_id))) return { success: false, error: "Alert recipient management requires Practice plan or higher" };

  const parsed = alertRecipientSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Validation failed" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("alert_recipients")
    .insert({ clinic_id: user.clinic_id, email: parsed.data.email });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "This email is already a recipient" };
    }
    Sentry.captureException(error);
    return { success: false, error: "Failed to add recipient" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}

export async function removeAlertRecipient(id: string) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };
  if (!(await checkAlertRecipientEntitlement(user.clinic_id))) return { success: false, error: "Alert recipient management requires Practice plan or higher" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("alert_recipients")
    .delete()
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to remove recipient" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}

// ─── Custom Credential Types ─────────────────────────────────────────────────

export async function getCredentialTypes() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return { custom: [], builtin: [], error: "Unauthorized" };

  const supabase = await createClient();

  const [customRes, builtinRes] = await Promise.all([
    supabase
      .from("credential_types")
      .select("id, name, category, default_renewal_cycle_days, is_custom, clinic_id")
      .eq("is_custom", true)
      .eq("clinic_id", ctx.clinicId),
    supabase
      .from("credential_types")
      .select("id, name, category, default_renewal_cycle_days, is_custom, clinic_id")
      .eq("is_custom", false)
      .is("clinic_id", null),
  ]);

  return { custom: customRes.data ?? [], builtin: builtinRes.data ?? [], error: null };
}

/**
 * Delete a custom credential type with in-use detection (plan §4.7).
 *   - Any credential referencing the type (incl. soft-deleted — the FK is
 *     RESTRICT on every row) blocks the delete with a friendly error.
 *   - References from role templates / onboarding checklists are surfaced as
 *     exact counts; the caller must confirm (confirmed = true) before the
 *     delete proceeds, so the CASCADE removal is explicit, never silent.
 * Returns { requiresConfirmation, inUse } instead of deleting when refs
 * exist and the caller hasn't confirmed.
 */
export async function removeCustomCredentialType(id: string, confirmed = false) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };

  const supabase = await createClient();

  const { data: type } = await supabase
    .from("credential_types")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .eq("is_custom", true)
    .maybeSingle();
  if (!type) return { success: false, error: "Credential type not found" };

  const [credentialCount, templateCount, onboardingCount] = await Promise.all([
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("credential_type_id", id),
    supabase
      .from("role_template_items")
      .select("id", { count: "exact", head: true })
      .eq("credential_type_id", id),
    supabase
      .from("onboarding_items")
      .select("id", { count: "exact", head: true })
      .eq("credential_type_id", id),
  ]);

  const credentials = credentialCount.count ?? 0;
  const templates = templateCount.count ?? 0;
  const onboardingItems = onboardingCount.count ?? 0;

  if (credentials > 0) {
    return {
      success: false,
      error: `This type is in use by ${credentials} credential${credentials === 1 ? "" : "s"}. Delete or reassign them first.`,
    };
  }

  if (!confirmed && (templates > 0 || onboardingItems > 0)) {
    return {
      success: false,
      error: null,
      requiresConfirmation: true,
      inUse: { templates, onboardingItems },
    };
  }

  const { error } = await supabase
    .from("credential_types")
    .delete()
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .eq("is_custom", true);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to remove credential type" };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/role-templates");
  return { success: true, error: null };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getClinicUsers() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return { users: [], error: "Unauthorized" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, role, created_at, auth_user_id")
    .eq("clinic_id", ctx.clinicId)
    .is("deleted_at", null)
    .order("created_at");

  return { users: data ?? [], error: null };
}

async function sendInviteEmail(
  email: string,
  clinicId: string,
  pendingUserId: string,
): Promise<{ ok: boolean; emailAccepted: boolean; error?: string }> {
  const isProduction = process.env.NODE_ENV === "production";
  const clinicName = await getClinicName(clinicId);

  // Production fail-closed (plan §4.3): a missing/misconfigured email service
  // must never leave a silently-unmailed pending row. In dev/test the row is
  // kept and the UI degrades honestly (emailAccepted: false).
  if (isProduction && !process.env.RESEND_API_KEY) {
    Sentry.captureMessage("RESEND_API_KEY missing in production — invitation email not sent", {
      level: "error",
      extra: { feature: "settings", flow: "user-invite" },
    });
    return { ok: false, emailAccepted: false, error: "Email service is misconfigured — invitation not created" };
  }

  const result = await sendInvitationEmail({ to: email, clinicName });

  if (!result.success) {
    if (isProduction) {
      // Fail closed: remove the just-created pending row so no invite exists
      // without its email (soft-delete — the authenticated client has no
      // DELETE policy on users).
      const supabase = await createClient();
      await supabase
        .from("users")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", pendingUserId)
        .eq("clinic_id", clinicId);
      Sentry.captureMessage("Invitation email send failed in production — invitation rolled back", {
        level: "error",
        extra: { feature: "settings", flow: "user-invite", error: result.error },
      });
      return { ok: false, emailAccepted: false, error: "Email service is misconfigured — invitation not created" };
    }
    Sentry.captureMessage("Invitation email send failed (dev/test) — invitation kept, no email", {
      level: "warning",
      extra: { feature: "settings", flow: "user-invite", error: result.error },
    });
    return { ok: true, emailAccepted: false };
  }

  return { ok: true, emailAccepted: true };
}

export async function inviteUser(input: InviteUserInput) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "owner") return { success: false, error: "Only the owner can invite users" };

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Validation failed" };

  const supabase = await createClient();

  const [countResult, clinicResult] = await Promise.all([
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", user.clinic_id)
      // B4 (plan 2026-08-08): match the enforce_plan_limits trigger and the
      // billing usage counts — soft-deleted users must not hold a seat.
      .is("deleted_at", null),
    supabase
      .from("clinics")
      .select("plan, trial_plan")
      .eq("id", user.clinic_id)
      .maybeSingle(),
  ]);

  const plan = clinicResult.data?.plan ?? "trial";
  const trialPlan = clinicResult.data?.trial_plan ?? null;
  const limits = getPlanLimits(plan, trialPlan);

  if (getEntitlements(plan, trialPlan).blocked) {
    return { success: false, error: "Your plan is inactive. Reactivate to invite users." };
  }

  if ((countResult.count ?? 0) >= limits.maxUsers) {
    return { success: false, error: "User limit reached for your plan. Upgrade to add more users." };
  }

  // Duplicate handling (plan §4.3): these checks exist for friendly messages;
  // the invariant that closes the race is the partial unique index
  // (clinic_id, lower(email)) WHERE auth_user_id IS NULL AND deleted_at IS NULL
  // from migration 056 — concurrent inserts collapse to one row and the loser
  // hits 23505 below.
  const { data: pending } = await supabase
    .from("users")
    .select("id")
    .eq("clinic_id", user.clinic_id)
    .eq("email", parsed.data.email)
    .is("auth_user_id", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (pending) {
    return { success: false, error: "An invitation for this email is already pending", pendingUserId: pending.id };
  }

  const { data: member } = await supabase
    .from("users")
    .select("id")
    .eq("clinic_id", user.clinic_id)
    .eq("email", parsed.data.email)
    .is("deleted_at", null)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (member) {
    return { success: false, error: "This email is already a member of your clinic." };
  }

  const { data: inserted, error: inviteErr } = await supabase
    .from("users")
    .insert({
      auth_user_id: null,
      clinic_id: user.clinic_id,
      email: parsed.data.email,
      role: parsed.data.role,
    })
    .select("id")
    .maybeSingle();
  if (inviteErr) {
    if (inviteErr.code === "23505") {
      // Race loser (migration 056 index / users_email_unique): the other
      // request won. Re-read the surviving row so the UI can offer resend
      // instead of an opaque error.
      const { data: survivor } = await supabase
        .from("users")
        .select("id")
        .eq("clinic_id", user.clinic_id)
        .eq("email", parsed.data.email)
        .is("auth_user_id", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (survivor) {
        return { success: false, error: "An invitation for this email is already pending", pendingUserId: survivor.id };
      }

      // Re-invite after remove: users.email is globally unique (migration
      // 008), so a soft-removed invite still occupies the address. Revive
      // the row instead of creating a second one — the plan's "removed
      // users can be re-invited" requirement.
      const { data: removed } = await supabase
        .from("users")
        .select("id")
        .eq("clinic_id", user.clinic_id)
        .eq("email", parsed.data.email)
        .is("auth_user_id", null)
        .not("deleted_at", "is", null)
        .maybeSingle();
      if (removed) {
        const { error: reviveErr } = await supabase
          .from("users")
          .update({ deleted_at: null, role: parsed.data.role })
          .eq("id", removed.id)
          .eq("clinic_id", user.clinic_id);
        if (reviveErr) {
          Sentry.captureException(reviveErr);
          return { success: false, error: "Failed to create invitation" };
        }
        const sendResult = await sendInviteEmail(parsed.data.email, user.clinic_id, removed.id);
        if (!sendResult.ok) {
          return { success: false, error: sendResult.error };
        }
        revalidatePath("/dashboard/settings");
        return { success: true, emailAccepted: sendResult.emailAccepted, pendingUserId: removed.id };
      }

      // Cross-clinic collision: users.email is unique across the whole
      // system — the address already belongs to another clinic's account.
      return { success: false, error: "This email is already registered with ComplySpa." };
    }
    Sentry.captureException(inviteErr);
    return { success: false, error: "Failed to create invitation" };
  }
  if (!inserted) return { success: false, error: "Failed to create invitation" };

  const sendResult = await sendInviteEmail(parsed.data.email, user.clinic_id, inserted.id);
  if (!sendResult.ok) {
    return { success: false, error: sendResult.error };
  }

  revalidatePath("/dashboard/settings");
  return {
    success: true,
    emailAccepted: sendResult.emailAccepted,
    pendingUserId: inserted.id,
  };
}

export async function resendInvitation(pendingUserId: string) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "owner") return { success: false, error: "Only the owner can resend invitations" };

  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", pendingUserId)
    .eq("clinic_id", user.clinic_id)
    .is("auth_user_id", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pending) return { success: false, error: "Pending invitation not found" };

  const sendResult = await sendInviteEmail(pending.email, user.clinic_id, pending.id);
  if (!sendResult.ok) {
    return { success: false, error: sendResult.error };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, emailAccepted: sendResult.emailAccepted, pendingUserId: pending.id };
}

export async function removeUser(id: string) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "owner") return { success: false, error: "Only the owner can remove users" };

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .maybeSingle();

  if (!target) return { success: false, error: "User not found" };
  if (target.id === user.id) return { success: false, error: "Cannot remove yourself" };

  const { error } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to remove user" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}

export async function updateUserRole(id: string, role: "manager" | "viewer") {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (user.role !== "owner") return { success: false, error: "Only the owner can change roles" };

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", user.clinic_id)
    .maybeSingle();

  if (!target) return { success: false, error: "User not found" };
  if (target.id === user.id) return { success: false, error: "Cannot change your own role" };

  const { error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", id)
    .eq("clinic_id", user.clinic_id);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to update role" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}
