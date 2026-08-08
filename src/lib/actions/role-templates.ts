"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { roleNameSchema } from "@/lib/utils/roles";
import { getResolvedTemplate } from "@/lib/staff/role-templates";
import { createOnboardingItems, captureFlowError } from "@/lib/staff/onboarding";
import * as Sentry from "@sentry/nextjs";

const templateItemSchema = z.object({
  credential_type_id: z.string().uuid(),
  is_required: z.boolean(),
});

const itemsSchema = z.array(templateItemSchema).max(50);

const createTemplateSchema = z.object({
  role: roleNameSchema,
  items: itemsSchema,
});

const updateTemplateSchema = z.object({
  items: itemsSchema,
});

/** Map a PostgREST RPC error to friendly copy. The RPCs raise P0001 with
 * stable human-readable messages (057 error contract); 23505 is the
 * case-insensitive duplicate-role index. Anything unrecognized falls back to
 * the generic message and is captured by the caller. */
function mapRpcError(error: { code?: string | null; message?: string | null } | null): string | null {
  if (!error) return null;
  if (error.code === "23505") {
    return "A role with this name already exists in your clinic.";
  }
  if (error.code === "23514") {
    // Pattern violation of role_templates_role_check — the RPCs pre-check
    // length only, so 23514 means the character pattern (re-review note).
    return "Invalid role name.";
  }
  if (error.code === "P0001") {
    const message = error.message ?? "";
    if (message.includes("already exists")) return "A role with this name already exists in your clinic.";
    if (message.includes("credential types are not available")) {
      return "One or more credential types are not available to this clinic.";
    }
    if (message.includes("Template not found")) return "Template not found.";
    // In-use delete guard and name-format messages are already friendly.
    return message || "Failed to save role template.";
  }
  return null;
}

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
    .order("role")
    // Deterministic global-before-clinic order within a role (057): consumers
    // that resolve clinic-wins must not depend on unspecified row order.
    .order("clinic_id", { ascending: false });

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

/** Create a template. Same-name-as-global is the explicit override flow
 * (allowed); the RPC rejects case-insensitive duplicates against the clinic's
 * OWN templates and validates every item's credential-type scope. Atomic. */
export async function createRoleTemplate(input: {
  role: string;
  items: { credential_type_id: string; is_required: boolean }[];
}) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_role_template", {
    p_role: parsed.data.role,
    p_items: parsed.data.items.map((item) => ({
      credential_type_id: item.credential_type_id,
      is_required: item.is_required,
    })),
  });

  if (error) {
    const friendly = mapRpcError(error);
    if (!friendly) {
      Sentry.captureException(error);
      return { error: "Failed to create role template." };
    }
    return { error: friendly };
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true, id: data as string };
}

/** Replace a template's items atomically (single transaction — no empty-reader
 * window, no best-effort restore). Template must belong to the caller's clinic. */
export async function updateRoleTemplate(
  templateId: string,
  input: { items: { credential_type_id: string; is_required: boolean }[] },
) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_role_template_items", {
    p_template_id: templateId,
    p_items: parsed.data.items.map((item) => ({
      credential_type_id: item.credential_type_id,
      is_required: item.is_required,
    })),
  });

  if (error) {
    const friendly = mapRpcError(error);
    if (!friendly) {
      Sentry.captureException(error);
      return { error: "Failed to update template items." };
    }
    return { error: friendly };
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true };
}

/** Rename a custom role. The RPC moves the template AND every staff row
 * holding the old role in one transaction (their requirements are untouched),
 * with collision guards against every global and own-clinic role name. Returns
 * the number of staff moved. */
export async function renameRoleTemplate(templateId: string, newRole: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const parsed = roleNameSchema.safeParse(newRole);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_role_template", {
    p_template_id: templateId,
    p_new_role: parsed.data,
  });

  if (error) {
    const friendly = mapRpcError(error);
    if (!friendly) {
      // Flow-attributed (plan §10): rename failures are queryable in Sentry by
      // feature=staff-onboarding + flow=role-rename.
      captureFlowError(error, "role-rename");
      return { error: "Failed to rename role." };
    }
    return { error: friendly };
  }

  revalidatePath("/dashboard/settings/role-templates");
  revalidatePath("/dashboard/staff");
  return { success: true, moved: data as number };
}

/** Delete a clinic template. Custom roles held by active staff are blocked by
 * the RPC (the message includes the staff count); overrides delete freely —
 * that is the deterministic "reset to global default" path. */
export async function deleteRoleTemplate(templateId: string) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };
  const { userId } = clinicData;

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_role_template", {
    p_template_id: templateId,
  });

  if (error) {
    const friendly = mapRpcError(error);
    if (!friendly) {
      Sentry.captureException(error);
      return { error: "Failed to delete role template." };
    }
    return { error: friendly };
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

  const parsedRole = roleNameSchema.safeParse(role);
  if (!parsedRole.success) return { error: "Invalid role name." };

  const supabase = await createClient();

  let template;
  try {
    template = await getResolvedTemplate(clinicId, parsedRole.data);
  } catch (err) {
    Sentry.captureException(err);
    return { error: "Failed to load role template." };
  }
  // Honest preview: a role with no template must not render as "no staff need
  // syncing" — the sync action itself would then fail.
  if (!template) return { error: "Role template not found." };

  // The engine adds BOTH required and optional items (planOnboardingReconciliation
  // inserts every template type), so the preview must count staff missing any
  // of them — a required-only filter would disable sync for all-optional
  // templates and undercount everywhere else (review finding SF6).
  const allTypeIds = [
    ...template.required.map((r) => r.credentialTypeId),
    ...template.optional.map((o) => o.credentialTypeId),
  ];
  if (allTypeIds.length === 0) return { data: { staff: [], count: 0 } };

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("role", parsedRole.data)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if (!staff || staff.length === 0) return { data: { staff: [], count: 0 } };

  const staffIds = staff.map((s) => s.id);

  const { data: items } = await supabase
    .from("onboarding_items")
    .select("staff_member_id, credential_type_id")
    .in("staff_member_id", staffIds)
    .in("credential_type_id", allTypeIds);

  const existingByStaff: Record<string, Set<string>> = {};
  for (const item of items ?? []) {
    if (!existingByStaff[item.staff_member_id]) existingByStaff[item.staff_member_id] = new Set();
    existingByStaff[item.staff_member_id]!.add(item.credential_type_id);
  }

  const { data: creds } = await supabase
    .from("credentials")
    .select("staff_member_id, credential_type_id")
    .in("staff_member_id", staffIds)
    .in("credential_type_id", allTypeIds)
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
    return allTypeIds.some((id) => !existing.has(id) && !heldCreds.has(id));
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

  // Validate the role name format before any data access — a malformed value
  // must not silently render "Nothing is reset" (review 2026-08-03).
  const parsedRole = roleNameSchema.safeParse(newRole);
  if (!parsedRole.success) return { error: "Invalid role name." };

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

  // Validate the role name format before any data access (parity with the
  // other template actions, review 2026-08-03).
  const parsedRole = roleNameSchema.safeParse(role);
  if (!parsedRole.success) return { error: "Invalid role name." };

  const permError = await requireOwnerOrManager(userId);
  if (permError) return { error: permError };

  const supabase = await createClient();

  // Template-existence check (parity with getRoleChangePreview): syncing a
  // role with no template must fail honestly, not report "synced 0".
  let template;
  try {
    template = await getResolvedTemplate(clinicId, parsedRole.data);
  } catch (err) {
    Sentry.captureException(err);
    return { error: "Failed to load role template." };
  }
  if (!template) return { error: "Role template not found." };

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("role", parsedRole.data)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if (!staff || staff.length === 0) return { success: true, synced: 0, added: 0 };

  // Span measures the acknowledged N×M backfill-loop trade-off (N staff × M
  // template items, sequential updates): a latency spike here is visible in
  // Sentry Performance before it becomes a user complaint, and is the signal
  // for batching the backfill (see plan Review Findings, accepted note).
  return Sentry.startSpan({ name: "staff.sync.role-wide", op: "db" }, async () => {
    let added = 0;
    for (const s of staff) {
      const result = await createOnboardingItems(s.id, clinicId, parsedRole.data, { requireTemplate: true, flow: "sync-role" });
      if (result.error) return { error: result.error };
      added += result.added ?? 0;
    }

    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/settings/role-templates");
    // Distinct units (review finding SF5): `synced` = staff processed,
    // `added` = onboarding items actually created — the toast must not blur
    // them ("6 staff members synced" for 2 staff × 3 items).
    return { success: true, synced: staff.length, added };
  });
}
