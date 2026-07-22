"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import { getPlanLimits } from "@/lib/utils/plan";
import {
  clinicProfileSchema,
  alertRecipientSchema,
  customCredentialTypeSchema,
  inviteUserSchema,
  type ClinicProfileInput,
  type AlertRecipientInput,
  type CustomCredentialTypeInput,
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

// ─── Clinic Profile ─────────────────────────────────────────────────────────

export async function getClinicProfile() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return { profile: null, error: "Unauthorized" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics")
    .select("name, address, state")
    .eq("id", ctx.clinicId)
    .maybeSingle();
  return { profile: data, error: null };
}

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

export async function addAlertRecipient(input: AlertRecipientInput) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };

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

export async function addCustomCredentialType(input: CustomCredentialTypeInput) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };

  const parsed = customCredentialTypeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Validation failed" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("credential_types")
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      default_renewal_cycle_days: parsed.data.default_renewal_cycle_days ?? null,
      is_custom: true,
      clinic_id: user.clinic_id,
    });

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to add credential type" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
}

export async function removeCustomCredentialType(id: string) {
  const user = await getAuth();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { success: false, error: "Insufficient permissions" };

  const supabase = await createClient();
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
  return { success: true, error: null };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getClinicUsers() {
  const ctx = await getClinicIdAndUser();
  if (!ctx) return { users: [], error: "Unauthorized" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, role, created_at")
    .eq("clinic_id", ctx.clinicId)
    .order("created_at");

  return { users: data ?? [], error: null };
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
      .eq("clinic_id", user.clinic_id),
    supabase
      .from("clinics")
      .select("plan")
      .eq("id", user.clinic_id)
      .maybeSingle(),
  ]);

  const plan = clinicResult.data?.plan ?? "trial";
  const limits = getPlanLimits(plan);

  if (plan === "inactive" || plan === "expired_trial") {
    return { success: false, error: "Your plan is inactive. Reactivate to invite users." };
  }

  if ((countResult.count ?? 0) >= limits.maxUsers) {
    return { success: false, error: "User limit reached for your plan. Upgrade to add more users." };
  }

  const { error: inviteErr } = await supabase.from("users").insert({
    auth_user_id: null,
    clinic_id: user.clinic_id,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  if (inviteErr) {
    Sentry.captureException(inviteErr);
    return { success: false, error: "Failed to create invitation" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, error: null };
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
