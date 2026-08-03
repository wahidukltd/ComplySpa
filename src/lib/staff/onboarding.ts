import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate } from "@/lib/staff/role-templates";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Report an engine error with flow attribution. Every capture carries
 * feature + flow tags so production errors are queryable by the pipeline that
 * produced them (staff-add / add-staff-wizard / role-change / sync-* /
 * onboarding-item / credential-delete). */
export function captureFlowError(error: unknown, flow: string): void {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "staff-onboarding");
    scope.setTag("flow", flow);
    Sentry.captureException(error);
  });
}

export interface OnboardingStaffState {
  requiredTotal: number;
  requiredCompleted: number;
  requiredPending: number;
  optionalTotal: number;
  optionalCompleted: number;
  optionalPending: number;
  missingNames: string[];
}

export const EMPTY_ONBOARDING_STATE: OnboardingStaffState = {
  requiredTotal: 0,
  requiredCompleted: 0,
  requiredPending: 0,
  optionalTotal: 0,
  optionalCompleted: 0,
  optionalPending: 0,
  missingNames: [],
};

/** True when the staff member's checklist has outstanding items (required or
 * optional). Single source for the "Continue onboarding" CTA rule (staff list
 * and Overview cards) — a CTA must never appear for an employee whose
 * checklist is fully addressed (e.g. In Progress from a lapsed credential).
 * Lives in work-status.ts (not here) because client components render the
 * staff table and this module imports the server-only Supabase client. */
export { hasPendingOnboardingItems } from "@/lib/utils/work-status";

// ── Reconciliation planner (pure — no DB calls, fully unit-testable) ──

export interface OnboardingItemSummary {
  id: string;
  credentialTypeId: string;
  isRequired: boolean;
  status: string;
}

export interface OnboardingReconciliationPlan {
  /** Item ids left untouched (completion history preserved). */
  keep: string[];
  /** Items to insert: new template requirements, completed when a live credential of the type is held. */
  insert: { credentialTypeId: string; isRequired: boolean; status: "pending" | "completed"; completedAt: string | null }[];
  /** Existing items to fix: completedAt set → also mark completed (requirement
   * met by a held credential); completedAt null → only refresh is_required
   * (template requiredness changed, completion untouched). */
  backfill: { itemId: string; completedAt: string | null; isRequired: boolean }[];
  /** Item ids whose type is no longer in the template (obsolete requirements). */
  delete: string[];
}

/** Pure decision table for reconciling a staff member's onboarding items to a
 * role template. `heldCredentialCreatedAt` maps credential_type_id → earliest
 * created_at of a live credential (deleted_at/suspended_at filters applied by
 * the caller). Used by createOnboardingItems (no deletes) and role-change
 * regeneration (with deletes) — one planner, two executors. */
export function planOnboardingReconciliation(
  currentItems: OnboardingItemSummary[],
  template: { required: { credentialTypeId: string }[]; optional: { credentialTypeId: string }[] } | null,
  heldCredentialCreatedAt: Map<string, string>,
): OnboardingReconciliationPlan {
  const plan: OnboardingReconciliationPlan = { keep: [], insert: [], backfill: [], delete: [] };

  if (!template) {
    plan.delete = currentItems.map((i) => i.id);
    return plan;
  }

  const requiredIds = new Set(template.required.map((r) => r.credentialTypeId));
  const templateTypeIds = new Set([
    ...requiredIds,
    ...template.optional.map((o) => o.credentialTypeId),
  ]);

  const currentByType = new Map(currentItems.map((i) => [i.credentialTypeId, i]));

  for (const item of currentItems) {
    if (!templateTypeIds.has(item.credentialTypeId)) {
      plan.delete.push(item.id);
      continue;
    }
    plan.keep.push(item.id);
    const heldAt = heldCredentialCreatedAt.get(item.credentialTypeId);
    const templateRequired = requiredIds.has(item.credentialTypeId);
    const needsCompletion = heldAt && (item.status === "pending" || item.status === "skipped");
    const needsFlagFix = item.isRequired !== templateRequired;
    if (needsCompletion || needsFlagFix) {
      plan.backfill.push({
        itemId: item.id,
        completedAt: needsCompletion ? heldAt! : null,
        isRequired: templateRequired,
      });
    }
  }

  for (const typeId of templateTypeIds) {
    if (currentByType.has(typeId)) continue;
    const heldAt = heldCredentialCreatedAt.get(typeId);
    plan.insert.push({
      credentialTypeId: typeId,
      isRequired: requiredIds.has(typeId),
      status: heldAt ? "completed" : "pending",
      completedAt: heldAt ?? null,
    });
  }

  return plan;
}

/** Live credentials of the staff member: credential_type_id → earliest created_at.
 * "Live" matches the readiness engine and backfill definitions (deleted_at and
 * suspended_at both null). Errors are surfaced (never swallowed) so callers
 * can fail instead of reconciling against an empty credential set. */
async function loadHeldCredentialCreatedAt(
  supabase: SupabaseClient,
  staffMemberId: string,
): Promise<{ map: Map<string, string>; error: string | null }> {
  const { data, error } = await supabase
    .from("credentials")
    .select("credential_type_id, created_at")
    .eq("staff_member_id", staffMemberId)
    .is("deleted_at", null)
    .is("suspended_at", null);

  if (error) return { map: new Map(), error: error.message };

  const map = new Map<string, string>();
  for (const c of data ?? []) {
    const current = map.get(c.credential_type_id);
    if (!current || c.created_at < current) map.set(c.credential_type_id, c.created_at);
  }
  return { map, error: null };
}

/** Defense-in-depth: pin the staff row to the clinic before this module
 * inserts/deletes onboarding_items (RLS checks clinic_id only; a future
 * caller passing a mismatched pair must fail, not write cross-clinic rows). */
async function assertStaffInClinic(
  supabase: SupabaseClient,
  staffMemberId: string,
  clinicId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff_members")
    .select("id")
    .eq("id", staffMemberId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Staff member not found.";
  return null;
}

async function applyReconciliationPlan(
  staffMemberId: string,
  clinicId: string,
  plan: OnboardingReconciliationPlan,
  allowDelete: boolean,
  flow: string,
): Promise<{ error?: string; added: number; removed: number; backfilled: number }> {
  const result = { added: 0, removed: 0, backfilled: 0 };
  const supabase = await createClient();

  if (plan.insert.length > 0) {
    const rows = plan.insert.map((item) => ({
      staff_member_id: staffMemberId,
      clinic_id: clinicId,
      credential_type_id: item.credentialTypeId,
      is_required: item.isRequired,
      status: item.status,
      completed_at: item.completedAt,
    }));
    // Upsert with ignoreDuplicates: a concurrent run (retry, double-save)
    // would otherwise race the UNIQUE (staff_member_id, credential_type_id)
    // constraint — same guard syncStaffToTemplate already uses.
    const { error } = await supabase
      .from("onboarding_items")
      .upsert(rows, { onConflict: "staff_member_id,credential_type_id", ignoreDuplicates: true });
    if (error) {
      captureFlowError(error, flow);
      return { error: "Failed to create onboarding items.", ...result };
    }
    result.added = plan.insert.length;
  }

  for (const b of plan.backfill) {
    const updates: {
      is_required: boolean;
      status?: string;
      completed_at?: string | null;
      completed_by_user_id?: null;
    } = { is_required: b.isRequired };
    if (b.completedAt) {
      // Requirement met by a held credential — complete the item with the
      // credential's creation time (audit honesty: that's when it was met).
      updates.status = "completed";
      updates.completed_at = b.completedAt;
      updates.completed_by_user_id = null;
    }
    const { error } = await supabase
      .from("onboarding_items")
      .update(updates)
      .eq("id", b.itemId)
      .eq("clinic_id", clinicId);
    if (error) {
      captureFlowError(error, flow);
      return { error: "Failed to update onboarding items.", ...result };
    }
    result.backfilled++;
  }

  if (allowDelete && plan.delete.length > 0) {
    const { error } = await supabase
      .from("onboarding_items")
      .delete()
      .in("id", plan.delete)
      .eq("clinic_id", clinicId);
    if (error) {
      captureFlowError(error, flow);
      return { error: "Failed to remove obsolete onboarding items.", ...result };
    }
    result.removed = plan.delete.length;
  }

  return result;
}

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
      if (item.status === "completed") {
        state.optionalCompleted++;
      } else if (item.status === "pending") {
        state.optionalPending++;
      }
    }
  }

  return map;
}

export async function createOnboardingItems(
  staffMemberId: string,
  clinicId: string,
  role: string,
  opts: { requireTemplate?: boolean; flow?: string } = {},
): Promise<{ error?: string; added?: number; backfilled?: number }> {
  const flow = opts.flow ?? "onboarding-create";
  let template;
  try {
    template = await getResolvedTemplate(clinicId, role);
  } catch (err) {
    captureFlowError(err, flow);
    return { error: "Failed to load role template." };
  }
  // No resolved template for this role (seed gap) — no-op, not an error: staff
  // creation must not fail because a template row is missing. Callers whose
  // contract requires a template (sync) pass requireTemplate to get an honest
  // error instead; the role-change path (reconcileOnboardingItemsToRole)
  // errors because deleting the checklist there would be destructive.
  if (!template) return opts.requireTemplate ? { error: "Role template not found." } : {};

  // Span covers the DB phase only — the acknowledged per-item backfill loop
  // lives inside applyReconciliationPlan, so a latency spike in the
  // role-wide sync (N staff × M items) is visible in Sentry Performance
  // before it ever surfaces as a user complaint.
  return Sentry.startSpan({ name: "staff.onboarding.create", op: "db" }, async () => {
    const supabase = await createClient();

    const notFound = await assertStaffInClinic(supabase, staffMemberId, clinicId);
    if (notFound) return { error: notFound };

    const { data: items, error: itemsErr } = await supabase
      .from("onboarding_items")
      .select("id, credential_type_id, status, is_required")
      .eq("staff_member_id", staffMemberId)
      .eq("clinic_id", clinicId);
    if (itemsErr) {
      captureFlowError(itemsErr, flow);
      return { error: "Failed to load onboarding items." };
    }

    const held = await loadHeldCredentialCreatedAt(supabase, staffMemberId);
    if (held.error) {
      captureFlowError(held.error, flow);
      return { error: "Failed to load credentials." };
    }

    const plan = planOnboardingReconciliation(
      (items ?? []).map((i) => ({ id: i.id, credentialTypeId: i.credential_type_id, isRequired: i.is_required, status: i.status })),
      template,
      held.map,
    );
    const result = await applyReconciliationPlan(staffMemberId, clinicId, plan, false, flow);

    if (result.error) return { error: result.error };
    return { added: result.added, backfilled: result.backfilled };
  });
}

/** Full reconciliation of a staff member's onboarding items to their role's
 * template: keeps retained items (completion preserved), inserts new
 * requirements (completed + backfilled when a live credential is held),
 * backfills pending/skipped items whose requirement is already met and
 * refreshes is_required on kept items, and deletes obsolete items. Returns
 * actual planned counts for honest toasts. Used by updateStaffMember on role
 * change (D3). */
export async function reconcileOnboardingItemsToRole(
  staffMemberId: string,
  clinicId: string,
  role: string,
  flow = "role-change",
): Promise<{ error?: string; added: number; removed: number; backfilled: number }> {
  let template;
  try {
    template = await getResolvedTemplate(clinicId, role);
  } catch (err) {
    captureFlowError(err, flow);
    return { error: "Failed to load role template.", added: 0, removed: 0, backfilled: 0 };
  }
  // Honest error, matching the sync path: a role with no template row must not
  // silently wipe the checklist. (The seeded `other` role HAS a template row
  // with zero items — that correctly delete-alls via the planner.)
  if (!template) return { error: "Role template not found.", added: 0, removed: 0, backfilled: 0 };

  return Sentry.startSpan({ name: "staff.onboarding.reconcile", op: "db" }, async () => {
    const supabase = await createClient();

    const notFound = await assertStaffInClinic(supabase, staffMemberId, clinicId);
    if (notFound) return { error: notFound, added: 0, removed: 0, backfilled: 0 };

    const { data: items, error: itemsErr } = await supabase
      .from("onboarding_items")
      .select("id, credential_type_id, status, is_required")
      .eq("staff_member_id", staffMemberId)
      .eq("clinic_id", clinicId);
    if (itemsErr) {
      captureFlowError(itemsErr, flow);
      return { error: "Failed to load onboarding items.", added: 0, removed: 0, backfilled: 0 };
    }

    const held = await loadHeldCredentialCreatedAt(supabase, staffMemberId);
    if (held.error) {
      captureFlowError(held.error, flow);
      return { error: "Failed to load credentials.", added: 0, removed: 0, backfilled: 0 };
    }

    const plan = planOnboardingReconciliation(
      (items ?? []).map((i) => ({ id: i.id, credentialTypeId: i.credential_type_id, isRequired: i.is_required, status: i.status })),
      template,
      held.map,
    );

    return applyReconciliationPlan(staffMemberId, clinicId, plan, true, flow);
  });
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
  flow = "onboarding-item",
) {
  const supabase = await createClient();

  // Resolve the item (RLS-scoped) so the update is pinned to its clinic —
  // explicit clinic filter as defense-in-depth, matching every other server
  // action in this codebase (documented should-fix, now closed).
  const { data: item } = await supabase
    .from("onboarding_items")
    .select("clinic_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { error: "Onboarding item not found." };

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
    .eq("id", itemId)
    .eq("clinic_id", item.clinic_id);

  if (error) {
    captureFlowError(error, flow);
    return { error: "Failed to update onboarding item." };
  }

  return { success: true };
}
