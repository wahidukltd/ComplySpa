"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { ROLE_VALUES } from "@/lib/staff/role-credential-defaults";
import { getResolvedTemplate } from "@/lib/staff/role-templates";
import { createOnboardingItems, captureFlowError } from "@/lib/staff/onboarding";
import * as Sentry from "@sentry/nextjs";

const templateItemSchema = z.object({
  credential_type_id: z.string().uuid(),
  is_required: z.boolean(),
});

const createTemplateSchema = z.object({
  role: z.enum(ROLE_VALUES),
  items: z.array(templateItemSchema).max(50),
});

const updateTemplateSchema = z.object({
  items: z.array(templateItemSchema).max(50),
});

async function requireOwnerOrManager(userId: string) {
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return "Unauthorized";
  if (user.role === "viewer") return "Insufficient permissions";
  return null;
}

export async function getRoleTemplates() {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };

  const { clinicId } = clinicData;
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("role_templates")
    .select("id, clinic_id, role, is_active, updated_at")
    .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`)
    .is("is_active", true)
    .order("role");

  if (!templates || templates.length === 0) return { data: [] };

  const { data: items } = await supabase
    .from("role_template_items")
    .select(`
      id,
      template_id,
      is_required,
      sort_order,
      credential_type_id,
      credential_type:credential_types!role_template_items_credential_type_id_fkey(name, category)
    `)
    .in("template_id", templates.map((t) => t.id))
    .order("sort_order");

  const data = templates.map((t) => ({
    ...t,
    items: (items ?? [])
      .filter((i) => i.template_id === t.id)
      .map((i) => ({
        id: i.id,
        credential_type_id: i.credential_type_id,
        name: i.credential_type?.name ?? "Unknown",
        category: i.credential_type?.category ?? "other",
        is_required: i.is_required,
        sort_order: i.sort_order,
      })),
  }));

  return { data };
}

export async function createRoleTemplate(input: {
  role: string;
  items: { credential_type_id: string; is_required: boolean }[];
}) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: typeRows } = await supabase
    .from("credential_types")
    .select("id")
    .in("id", parsed.data.items.map((i) => i.credential_type_id))
    .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);
  const validIds = new Set((typeRows ?? []).map((t) => t.id));
  if (parsed.data.items.some((i) => !validIds.has(i.credential_type_id))) {
    return { error: "One or more credential types are not available to this clinic." };
  }

  const { data: template, error: tErr } = await supabase
    .from("role_templates")
    .insert({ clinic_id: clinicId, role: parsed.data.role, is_active: true })
    .select("id")
    .single();

  if (tErr || !template) {
    Sentry.captureException(tErr);
    return { error: "Failed to create role template." };
  }

  const rows = parsed.data.items.map((item, idx) => ({
    template_id: template.id,
    credential_type_id: item.credential_type_id,
    is_required: item.is_required,
    sort_order: idx,
  }));

  const { error: iErr } = await supabase.from("role_template_items").insert(rows);
  if (iErr) {
    Sentry.captureException(iErr);
    await supabase.from("role_templates").delete().eq("id", template.id);
    return { error: "Failed to save template items." };
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true, id: template.id };
}

async function restoreTemplateItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  oldItems: { credential_type_id: string; is_required: boolean; sort_order: number }[],
) {
  if (oldItems.length === 0) return;
  const { error } = await supabase.from("role_template_items").insert(
    oldItems.map((item) => ({ ...item, template_id: templateId })),
  );
  if (error) {
    Sentry.captureException(error);
  }
}

export async function updateRoleTemplate(
  templateId: string,
  input: { items: { credential_type_id: string; is_required: boolean }[] },
) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("role_templates")
    .select("id, clinic_id")
    .eq("id", templateId)
    .single();
  if (!template) return { error: "Template not found" };
  if (template.clinic_id !== clinicId) return { error: "Insufficient permissions" };

  const { data: typeRows } = await supabase
    .from("credential_types")
    .select("id")
    .in("id", parsed.data.items.map((i) => i.credential_type_id))
    .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);
  const validIds = new Set((typeRows ?? []).map((t) => t.id));
  if (parsed.data.items.some((i) => !validIds.has(i.credential_type_id))) {
    return { error: "One or more credential types are not available to this clinic." };
  }

  const { data: oldItems } = await supabase
    .from("role_template_items")
    .select("credential_type_id, is_required, sort_order")
    .eq("template_id", templateId);

  const { error: delErr } = await supabase
    .from("role_template_items")
    .delete()
    .eq("template_id", templateId);
  if (delErr) {
    Sentry.captureException(delErr);
    return { error: "Failed to update template items." };
  }

  const rows = parsed.data.items.map((item, idx) => ({
    template_id: templateId,
    credential_type_id: item.credential_type_id,
    is_required: item.is_required,
    sort_order: idx,
  }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("role_template_items").insert(rows);
    if (insErr) {
      Sentry.captureException(insErr);
      await restoreTemplateItems(supabase, templateId, oldItems ?? []);
      return { error: "Failed to update template items. Previous template restored." };
    }
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function deleteRoleTemplate(templateId: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("role_templates")
    .select("id, clinic_id")
    .eq("id", templateId)
    .single();
  if (!template) return { error: "Template not found" };
  if (template.clinic_id !== clinicId) return { error: "Insufficient permissions" };

  const { error } = await supabase.from("role_templates").delete().eq("id", templateId);
  if (error) {
    Sentry.captureException(error);
    return { error: "Failed to delete role template." };
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function getTemplateSyncPreview(role: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  let template;
  try {
    template = await getResolvedTemplate(clinicId, role);
  } catch (err) {
    Sentry.captureException(err);
    return { error: "Failed to load role template." };
  }
  if (!template) return { data: { staff: [], count: 0 } };

  const requiredIds = template.required.map((r) => r.credentialTypeId);
  if (requiredIds.length === 0) return { data: { staff: [], count: 0 } };

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("role", role)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if (!staff || staff.length === 0) return { data: { staff: [], count: 0 } };

  const staffIds = staff.map((s) => s.id);

  const { data: items } = await supabase
    .from("onboarding_items")
    .select("staff_member_id, credential_type_id")
    .in("staff_member_id", staffIds)
    .in("credential_type_id", requiredIds);

  const existingByStaff: Record<string, Set<string>> = {};
  for (const item of items ?? []) {
    if (!existingByStaff[item.staff_member_id]) existingByStaff[item.staff_member_id] = new Set();
    existingByStaff[item.staff_member_id]!.add(item.credential_type_id);
  }

  const { data: creds } = await supabase
    .from("credentials")
    .select("staff_member_id, credential_type_id")
    .in("staff_member_id", staffIds)
    .in("credential_type_id", requiredIds)
    .is("deleted_at", null)
    .is("suspended_at", null);

  const credsByStaff: Record<string, Set<string>> = {};
  for (const c of creds ?? []) {
    if (!credsByStaff[c.staff_member_id]) credsByStaff[c.staff_member_id] = new Set();
    credsByStaff[c.staff_member_id]!.add(c.credential_type_id);
  }

  const affected = staff.filter((s) => {
    const existing = existingByStaff[s.id] ?? new Set<string>();
    const heldCreds = credsByStaff[s.id] ?? new Set<string>();
    return requiredIds.some((id) => !existing.has(id) && !heldCreds.has(id));
  });

  return {
    data: {
      staff: affected.map((s) => ({ id: s.id, name: s.name })),
      count: affected.length,
    },
  };
}

export async function getRoleChangePreview(
  staffMemberId: string,
  newRole: string,
): Promise<{
  data?: { kept: number; added: { name: string }[]; removed: { name: string }[] };
  error?: string;
}> {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  // Validate the role against the known set before any data access — a
  // malformed value must not silently render "Nothing is reset" (review
  // 2026-08-03).
  const parsedRole = z.enum(ROLE_VALUES).safeParse(newRole);
  if (!parsedRole.success) return { error: "Invalid role." };

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, role")
    .eq("id", staffMemberId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();
  if (!staff || !staff.role) return { error: "Staff member not found." };
  if (staff.role === parsedRole.data) return { data: { kept: 0, added: [], removed: [] } };

  let template;
  try {
    template = await getResolvedTemplate(clinicId, parsedRole.data);
  } catch (err) {
    captureFlowError(err, "role-change-preview");
    return { error: "Failed to load role template." };
  }
  // Honest error, matching the reconcile/sync paths — a role with no template
  // row must never be presented as "nothing changes".
  if (!template) return { error: "Role template not found." };

  const templateTypeIds = new Set([
    ...template.required.map((r) => r.credentialTypeId),
    ...template.optional.map((o) => o.credentialTypeId),
  ]);
  const templateTypeNames = new Map<string, string>([
    ...template.required.map((r) => [r.credentialTypeId, r.name] as const),
    ...template.optional.map((o) => [o.credentialTypeId, o.name] as const),
  ]);

  const { data: items } = await supabase
    .from("onboarding_items")
    .select(`
      credential_type_id,
      credential_type:credential_types!onboarding_items_credential_type_id_fkey(name)
    `)
    .eq("staff_member_id", staffMemberId)
    .eq("clinic_id", clinicId);

  const itemTypeIds = new Set((items ?? []).map((i) => i.credential_type_id));

  const kept = (items ?? []).filter((i) => templateTypeIds.has(i.credential_type_id)).length;
  const added = [...templateTypeIds]
    .filter((id) => !itemTypeIds.has(id))
    .map((id) => ({ name: templateTypeNames.get(id) ?? "Unknown" }));
  const removed = (items ?? [])
    .filter((i) => !templateTypeIds.has(i.credential_type_id))
    .map((i) => ({ name: i.credential_type?.name ?? "Unknown" }));

  return { data: { kept, added, removed } };
}

export async function syncStaffToTemplate(staffMemberId: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, role")
    .eq("id", staffMemberId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();
  if (!staff || !staff.role) return { error: "Staff member not found." };

  // Sync is the explicit admin path: insert-only (never removes), backfills
  // completion from held credentials with the credential's created_at, and
  // refreshes is_required — exactly the shared engine's no-delete executor
  // (one algorithm with role-change regeneration, review 2026-08-03).
  const result = await createOnboardingItems(staffMemberId, clinicId, staff.role, { requireTemplate: true, flow: "sync-staff" });
  if (result.error) return { error: result.error };

  revalidatePath(`/dashboard/staff/${staffMemberId}`);
  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/onboarding");
  revalidatePath("/dashboard/settings/role-templates");
  return { success: true, added: result.added ?? 0 };
}

export async function syncStaffToRoleTemplate(role: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { clinicId, userId } = clinicData;

  // Validate the role against the known set before any data access (parity
  // with the other template actions, review 2026-08-03).
  const parsedRole = z.enum(ROLE_VALUES).safeParse(role);
  if (!parsedRole.success) return { error: "Invalid role." };

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("role", parsedRole.data)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if (!staff || staff.length === 0) return { success: true, synced: 0 };

  // Span measures the acknowledged N×M backfill-loop trade-off (N staff × M
  // template items, sequential updates): a latency spike here is visible in
  // Sentry Performance before it becomes a user complaint, and is the signal
  // for batching the backfill (see plan Review Findings, accepted note).
  return Sentry.startSpan({ name: "staff.sync.role-wide", op: "db" }, async () => {
    let synced = 0;
    for (const s of staff) {
      const result = await createOnboardingItems(s.id, clinicId, parsedRole.data, { requireTemplate: true, flow: "sync-role" });
      if (result.error) return { error: result.error };
      synced += result.added ?? 0;
    }

    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/settings/role-templates");
    return { success: true, synced };
  });
}
