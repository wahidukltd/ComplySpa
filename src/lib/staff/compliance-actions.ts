import { createClient } from "@/lib/supabase/server";
import type { ReadinessResult } from "@/lib/staff/readiness";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";
import type { ActionUrgency } from "@/types";

export interface ComplianceAction {
  id: string;
  staffMemberId: string;
  staffName: string;
  role: string;
  actionType: "renew_expired" | "renew_expiring" | "add_missing" | "verify_recommended" | "complete_onboarding";
  credentialName: string;
  credentialId?: string;
  urgency: ActionUrgency;
  description: string;
  risk: string;
  actionLabel: string;
  actionHref: string;
}

function generateActionsForStaff(
  staffMemberId: string,
  staffName: string,
  role: string,
  readiness: ReadinessResult,
): ComplianceAction[] {
  const actions: ComplianceAction[] = [];
  const roleLabel = role;

  for (const mc of readiness.missingCredentials) {
    actions.push({
      id: `${staffMemberId}-missing-${mc.name}`,
      staffMemberId,
      staffName,
      role: roleLabel,
      actionType: "add_missing",
      credentialName: mc.name,
      urgency: "critical",
      description: `${mc.name} — missing`,
      risk: "Cannot verify qualification for this role requirement.",
      actionLabel: "Add now",
      actionHref: `/dashboard/staff/${staffMemberId}/credentials/new`,
    });
  }

  for (const ec of readiness.expiredCredentials) {
    actions.push({
      id: `${staffMemberId}-expired-${ec.credentialId}`,
      staffMemberId,
      staffName,
      role: roleLabel,
      actionType: "renew_expired",
      credentialName: ec.name,
      credentialId: ec.credentialId,
      urgency: "critical",
      description: `${ec.name} — expired`,
      risk: "Cannot legally perform procedures requiring this credential.",
      actionLabel: "Renew",
      actionHref: `/dashboard/credentials/${ec.credentialId}/renew`,
    });
  }

  for (const ec of readiness.expiringCredentials) {
    actions.push({
      id: `${staffMemberId}-expiring-${ec.credentialId}`,
      staffMemberId,
      staffName,
      role: roleLabel,
      actionType: "renew_expiring",
      credentialName: ec.name,
      credentialId: ec.credentialId,
      urgency: "warning",
      description: `${ec.name} — expires soon`,
      risk: "Will become non-compliant if not renewed.",
      actionLabel: "Renew",
      actionHref: `/dashboard/credentials/${ec.credentialId}/renew`,
    });
  }

  return actions;
}

export async function buildComplianceActionsFromReadiness(
  staffRows: { id: string; name: string; role: string | null }[],
  readinessMap: Record<string, ReadinessResult>,
  clinicId: string,
  onboardingState?: Record<string, OnboardingStaffState> | null,
): Promise<ComplianceAction[]> {
  const supabase = await createClient();
  const staffIds = staffRows.map((s) => s.id);
  const nameMap: Record<string, string> = {};
  const roleMap: Record<string, string> = {};
  for (const s of staffRows) {
    nameMap[s.id] = s.name;
    if (s.role) roleMap[s.id] = s.role;
  }

  const allActions: ComplianceAction[] = [];

  for (const id of staffIds) {
    const readiness = readinessMap[id];
    if (!readiness) continue;
    if (readiness.status === "ready") continue;

    // Onboarding surfacing: staff whose readiness engine reports `pending`
    // (no credentials tracked) have no individual missing/expired actions, so
    // they would otherwise be invisible. Emit one aggregated onboarding card
    // per such staff member — never for at_risk/non_compliant staff, who
    // already get individual actions (avoids duplicate cards for one person).
    if (readiness.status === "pending" && roleMap[id]) {
      // onboardingState === null (or omitted) means the onboarding section
      // failed to load — never fabricate cards from missing data; a failed
      // section must not masquerade as "not started".
      if (onboardingState == null) continue;

      const state = onboardingState[id];
      const pendingNames = state?.missingNames ?? [];
      const requiredPending = state?.requiredPending ?? 0;

      let description: string;
      let actionLabel: string;
      if (requiredPending > 0) {
        if (pendingNames.length > 0) {
          const shown = pendingNames.slice(0, 3).join(", ");
          const more = pendingNames.length > 3 ? ` +${pendingNames.length - 3} more` : "";
          description = `Onboarding incomplete — ${shown}${more} pending`;
        } else {
          // Pending items whose credential type name is unknown — fall back to
          // a count rather than rendering an empty list.
          description = `Onboarding incomplete — ${requiredPending} requirement${requiredPending === 1 ? "" : "s"} pending`;
        }
        actionLabel = "Continue onboarding";
      } else {
        description = "Onboarding not started — no requirements generated yet";
        actionLabel = "Start onboarding";
      }

      allActions.push({
        id: `${id}-complete-onboarding`,
        staffMemberId: id,
        staffName: nameMap[id] ?? "Unknown",
        role: roleMap[id] ?? "",
        actionType: "complete_onboarding",
        credentialName: "",
        urgency: "warning",
        description,
        risk: "Cannot start work until these requirements are completed.",
        actionLabel,
        actionHref: `/dashboard/staff/${id}#onboarding`,
      });
      continue;
    }

    const actions = generateActionsForStaff(
      id,
      nameMap[id] ?? "Unknown",
      roleMap[id] ?? "",
      readiness,
    );
    allActions.push(...actions);
  }

  const requiredTypeIds = new Set<string>();
  const credentialTypeNames = new Set<string>();
  for (const action of allActions) {
    if (action.credentialName) credentialTypeNames.add(action.credentialName);
  }

  if (credentialTypeNames.size > 0) {
    // Explicit global-or-own-clinic scoping (RLS backstops it) — matches the
    // tenant-boundary pattern used across the readiness/overview path.
    const { data: typeRows, error: typeErr } = await supabase
      .from("credential_types")
      .select("id, name")
      .in("name", Array.from(credentialTypeNames))
      .or(`clinic_id.is.null,clinic_id.eq.${clinicId}`);
    if (typeErr) throw new Error(typeErr.message);
    if (typeRows) {
      for (const t of typeRows) requiredTypeIds.add(t.id);
    }
  }

  if (requiredTypeIds.size > 0) {
    const { data: staleCreds, error: staleErr } = await supabase
      .from("credentials")
      .select("id, staff_member_id, credential_type_id, last_verified_date, credential_type:credential_types!credentials_credential_type_id_fkey(name)")
      .eq("clinic_id", clinicId)
      .in("staff_member_id", staffIds)
      .in("credential_type_id", Array.from(requiredTypeIds))
      .is("deleted_at", null)
      .is("suspended_at", null)
      .not("status", "eq", "expired")
      .lt("last_verified_date", new Date(Date.now() - 180 * 86400000).toISOString())
      .limit(100);
    if (staleErr) throw new Error(staleErr.message);

    if (staleCreds) {
      for (const sc of staleCreds) {
        const staffName = nameMap[sc.staff_member_id] ?? "Unknown";
        const staffRole = roleMap[sc.staff_member_id] ?? "";
        const credName = sc.credential_type?.name ?? "Credential";
        const monthsSince = Math.floor(
          (Date.now() - new Date(sc.last_verified_date!).getTime()) / (30 * 86400000),
        );

        allActions.push({
          id: `${sc.staff_member_id}-verify-${sc.id}`,
          staffMemberId: sc.staff_member_id,
          staffName,
          role: staffRole,
          actionType: "verify_recommended",
          credentialName: credName,
          credentialId: sc.id,
          urgency: "info",
          description: `${credName} — not verified in ${monthsSince} months`,
          risk: "Verification status is stale. Recommended every 6 months.",
          actionLabel: "Verify",
          actionHref: `/dashboard/credentials/${sc.id}`,
        });
      }
    }
  }

  allActions.sort((a, b) => {
    const urgencyOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const aOrder = urgencyOrder[a.urgency] ?? 99;
    const bOrder = urgencyOrder[b.urgency] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.staffName.localeCompare(b.staffName);
  });

  return allActions;
}
