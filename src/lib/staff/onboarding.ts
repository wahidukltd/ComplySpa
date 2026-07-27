import { createClient } from "@/lib/supabase/server";
import { ROLE_CREDENTIAL_MAP } from "@/lib/staff/role-credential-defaults";

export async function createOnboardingItems(
  staffMemberId: string,
  clinicId: string,
  role: string,
) {
  const credentialNames = ROLE_CREDENTIAL_MAP[role] ?? [];
  if (credentialNames.length === 0) return;

  const supabase = await createClient();

  const { data: types } = await supabase
    .from("credential_types")
    .select("id, name")
    .in("name", credentialNames);

  if (!types || types.length === 0) return;

  const nameToId: Record<string, string> = {};
  for (const t of types) nameToId[t.name] = t.id;

  const rows: Array<{ staff_member_id: string; clinic_id: string; credential_type_id: string }> = [];
  for (const name of credentialNames) {
    const credentialTypeId = nameToId[name];
    if (credentialTypeId) {
      rows.push({ staff_member_id: staffMemberId, clinic_id: clinicId, credential_type_id: credentialTypeId });
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("onboarding_items").insert(rows);
  if (error) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
  }
}

export async function getOnboardingProgress(staffMemberId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("onboarding_items")
    .select("status")
    .eq("staff_member_id", staffMemberId);

  if (error || !data) return { total: 0, completed: 0, skipped: 0, pending: 0 };

  const completed = data.filter((i) => i.status === "completed").length;
  const skipped = data.filter((i) => i.status === "skipped").length;
  const pending = data.filter((i) => i.status === "pending").length;

  return { total: data.length, completed, skipped, pending };
}

export async function getOnboardingItems(staffMemberId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("onboarding_items")
    .select(`
      id,
      status,
      completed_at,
      completed_by_user_id,
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
