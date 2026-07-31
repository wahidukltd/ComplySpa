import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate } from "@/lib/staff/role-templates";

export async function createOnboardingItems(
  staffMemberId: string,
  clinicId: string,
  role: string,
): Promise<{ error?: string }> {
  let template;
  try {
    template = await getResolvedTemplate(clinicId, role);
  } catch (err) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err);
    return { error: "Failed to load role template." };
  }
  if (!template) return {};

  const allItems = [...template.required, ...template.optional];
  if (allItems.length === 0) return {};

  const requiredIds = new Set(template.required.map((r) => r.credentialTypeId));

  const rows: Array<{
    staff_member_id: string;
    clinic_id: string;
    credential_type_id: string;
    is_required: boolean;
  }> = allItems.map((item) => ({
    staff_member_id: staffMemberId,
    clinic_id: clinicId,
    credential_type_id: item.credentialTypeId,
    is_required: requiredIds.has(item.credentialTypeId),
  }));

  const supabase = await createClient();

  const { error } = await supabase.from("onboarding_items").insert(rows);
  if (error) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
    return { error: "Failed to create onboarding items." };
  }

  return {};
}

export async function getOnboardingProgress(staffMemberId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("onboarding_items")
    .select("status, is_required")
    .eq("staff_member_id", staffMemberId);

  if (error || !data) {
    return {
      total: 0, completed: 0, skipped: 0, pending: 0,
      requiredTotal: 0, requiredCompleted: 0,
      optionalTotal: 0, optionalCompleted: 0,
      blocked: false,
    };
  }

  const required = data.filter((i) => i.is_required);
  const optional = data.filter((i) => !i.is_required);

  const requiredPending = required.filter((i) => i.status === "pending").length;

  return {
    total: data.length,
    completed: data.filter((i) => i.status === "completed").length,
    skipped: data.filter((i) => i.status === "skipped").length,
    pending: data.filter((i) => i.status === "pending").length,
    requiredTotal: required.length,
    requiredCompleted: required.filter((i) => i.status === "completed").length,
    optionalTotal: optional.length,
    optionalCompleted: optional.filter((i) => i.status === "completed").length,
    blocked: requiredPending > 0,
  };
}

export async function getOnboardingItems(staffMemberId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("onboarding_items")
    .select(`
      id,
      status,
      is_required,
      created_at,
      completed_at,
      completed_by_user_id,
      credential_type_id,
      credential_type:credential_types!onboarding_items_credential_type_id_fkey(name, category)
    `)
    .eq("staff_member_id", staffMemberId)
    .order("created_at");

  return data ?? [];
}

export async function updateOnboardingItemStatus(
  itemId: string,
  status: "completed" | "skipped",
  userId: string,
) {
  const supabase = await createClient();

  const updates: {
    status: string;
    completed_at?: string | null;
    completed_by_user_id?: string | null;
  } = { status };
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
    updates.completed_by_user_id = userId;
  } else {
    updates.completed_at = null;
    updates.completed_by_user_id = null;
  }

  const { error } = await supabase
    .from("onboarding_items")
    .update(updates)
    .eq("id", itemId);

  if (error) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
    return { error: "Failed to update onboarding item." };
  }

  return { success: true };
}
