import { createClient } from "@/lib/supabase/server";
import { getStaffReadinessBulk, type ReadinessResult } from "@/lib/staff/readiness";
import type { ActionUrgency } from "@/types";
import * as Sentry from "@sentry/nextjs";

export interface ComplianceAction {
  id: string;
  staffMemberId: string;
  staffName: string;
  role: string;
  actionType: "renew_expired" | "renew_expiring" | "add_missing" | "verify_recommended";
  credentialName: string;
  credentialId?: string;
  urgency: ActionUrgency;
  description: string;
  risk: string;
  actionLabel: string;
  actionHref: string;
}

export interface ActionsSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
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
    if (readiness.status === "ready" || readiness.status === "pending") continue;

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
    const { data: typeRows } = await supabase
      .from("credential_types")
      .select("id, name")
      .in("name", Array.from(credentialTypeNames));
    if (typeRows) {
      for (const t of typeRows) requiredTypeIds.add(t.id);
    }
  }

  if (requiredTypeIds.size > 0) {
    const { data: staleCreds } = await supabase
      .from("credentials")
      .select("id, staff_member_id, credential_type_id, last_verified_date, credential_type:credential_types!credentials_credential_type_id_fkey(name)")
      .eq("clinic_id", clinicId)
      .in("staff_member_id", staffIds)
      .in("credential_type_id", Array.from(requiredTypeIds))
      .is("deleted_at", null)
      .is("suspended_at", null)
      .lt("last_verified_date", new Date(Date.now() - 180 * 86400000).toISOString());

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

export async function getComplianceActions(): Promise<ComplianceAction[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: userRecord } = await supabase
      .from("users")
      .select("clinic_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!userRecord) return [];

    const { data: staffRows } = await supabase
      .from("staff_members")
      .select("id, name, role")
      .eq("clinic_id", userRecord.clinic_id)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .order("name");

    if (!staffRows || staffRows.length === 0) return [];

    const staffIds = staffRows.map((s) => s.id);
    const readinessMap = await getStaffReadinessBulk(staffIds);

    return buildComplianceActionsFromReadiness(staffRows, readinessMap, userRecord.clinic_id);
  } catch (err) {
    Sentry.captureException(err);
    return [];
  }
}

export async function getActionsSummary(): Promise<ActionsSummary> {
  const actions = await getComplianceActions();
  const critical = actions.filter((a) => a.urgency === "critical").length;
  const warning = actions.filter((a) => a.urgency === "warning").length;
  const info = actions.filter((a) => a.urgency === "info").length;
  return { total: actions.length, critical, warning, info };
}
