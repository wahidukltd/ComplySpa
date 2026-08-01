import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate } from "@/lib/staff/role-templates";

export interface OnboardingStaffState {
  requiredTotal: number;
  requiredCompleted: number;
  requiredPending: number;
  optionalTotal: number;
  optionalCompleted: number;
  missingNames: string[];
}

export const EMPTY_ONBOARDING_STATE: OnboardingStaffState = {
  requiredTotal: 0,
  requiredCompleted: 0,
  requiredPending: 0,
  optionalTotal: 0,
  optionalCompleted: 0,
  missingNames: [],
};

/** Per-staff onboarding state for a set of staff ids, scoped to one clinic.
 * Pure aggregation of existing onboarding_items rows (orchestration only —
 * no compliance rules live here). Throws on query error so callers can
 * decide how to degrade (overview: safeSection; staff list: catch + fallback). */
export async function getOnboardingStateByStaff(
  clinicId: string,
  staffMemberIds: string[],
): Promise<Record<string, OnboardingStaffState>> {
  if (staffMemberIds.length === 0) return {};

  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("onboarding_items")
    .select(`
      staff_member_id,
      status,
      is_required,
      credential_type:credential_types!onboarding_items_credential_type_id_fkey(name)
    `)
    .eq("clinic_id", clinicId)
    .in("staff_member_id", staffMemberIds);

  if (error) throw new Error(error.message);

  const map: Record<string, OnboardingStaffState> = {};
  for (const id of staffMemberIds) {
    map[id] = { ...EMPTY_ONBOARDING_STATE };
  }

  for (const item of items ?? []) {
    const state = map[item.staff_member_id];
    if (!state) continue;
    if (item.is_required) {
      state.requiredTotal++;
      if (item.status === "completed") {
        state.requiredCompleted++;
      } else if (item.status === "pending") {
        state.requiredPending++;
        if (item.credential_type?.name) state.missingNames.push(item.credential_type.name);
      }
    } else {
      state.optionalTotal++;
      if (item.status === "completed") state.optionalCompleted++;
    }
  }

  return map;
}

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
