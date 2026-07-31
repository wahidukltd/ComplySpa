import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate, getResolvedTemplatesBulk } from "@/lib/staff/role-templates";
import type { ReadinessStatus } from "@/types";
import * as Sentry from "@sentry/nextjs";

export interface ReadinessResult {
  status: ReadinessStatus;
  missingCredentials: { name: string }[];
  expiredCredentials: { name: string; credentialId: string }[];
  expiringCredentials: { name: string; credentialId: string }[];
}

const BEST_STATUS_ORDER: Record<string, number> = {
  valid: 0,
  expiring: 1,
  expired: 2,
};

function bestStatusForType(credentials: { status: string }[]): string {
  let best = "missing";
  for (const c of credentials) {
    const rank = BEST_STATUS_ORDER[c.status] ?? 99;
    const bestRank = BEST_STATUS_ORDER[best] ?? 99;
    if (rank < bestRank) {
      best = c.status;
    }
  }
  return best;
}

function groupCredentialsByType(
  credentials: { credential_type_id: string | null; status: string; id: string; credential_type: { name: string } | null }[],
): Record<string, { status: string; id: string; name: string }[]> {
  const credsByType: Record<string, { status: string; id: string; name: string }[]> = {};
  for (const c of credentials) {
    const typeId = c.credential_type_id;
    if (!typeId) continue;
    if (!credsByType[typeId]) credsByType[typeId] = [];
    credsByType[typeId].push({
      status: c.status,
      id: c.id,
      name: c.credential_type?.name ?? "Unknown",
    });
  }
  return credsByType;
}

function computeReadinessFromMaps(
  requiredNames: string[],
  typeNameToId: Record<string, string>,
  credsByType: Record<string, { status: string; id: string; name: string }[]>,
): ReadinessResult {
  const missingCredentials: { name: string }[] = [];
  const expiredCredentials: { name: string; credentialId: string }[] = [];
  const expiringCredentials: { name: string; credentialId: string }[] = [];
  let finalStatus: ReadinessStatus = "ready";

  for (const name of requiredNames) {
    const typeId = typeNameToId[name];
    if (!typeId) {
      missingCredentials.push({ name });
      finalStatus = "non_compliant";
      continue;
    }

    const matchingCreds = credsByType[typeId];
    if (!matchingCreds || matchingCreds.length === 0) {
      missingCredentials.push({ name });
      finalStatus = "non_compliant";
      continue;
    }

    const best = bestStatusForType(matchingCreds);
    const firstId = matchingCreds[0]?.id;
    if (best === "expired") {
      if (firstId) expiredCredentials.push({ name, credentialId: firstId });
      finalStatus = "non_compliant";
    } else if (best === "expiring") {
      if (firstId) expiringCredentials.push({ name, credentialId: firstId });
      if (finalStatus !== "non_compliant") {
        finalStatus = "at_risk";
      }
    }
  }

  return { status: finalStatus, missingCredentials, expiredCredentials, expiringCredentials };
}

export async function getStaffReadiness(staffMemberId: string): Promise<ReadinessResult> {
  try {
    const supabase = await createClient();

    const { data: staff } = await supabase
      .from("staff_members")
      .select("role, clinic_id")
      .eq("id", staffMemberId)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .single();

    if (!staff || !staff.role) {
      return { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
    }

    const template = await getResolvedTemplate(staff.clinic_id, staff.role);
    if (!template || template.required.length === 0) {
      return { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
    }

    const requiredNames = template.required.map((r) => r.name);
    const typeNameToId: Record<string, string> = {};
    for (const r of template.required) typeNameToId[r.name] = r.credentialTypeId;

    const { data: credentials } = await supabase
      .from("credentials")
      .select("id, credential_type_id, status, credential_type:credential_types!credentials_credential_type_id_fkey(name)")
      .eq("staff_member_id", staffMemberId)
      .is("suspended_at", null)
      .is("deleted_at", null);

    if (!credentials || credentials.length === 0) {
      return { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
    }

    const credsByType = groupCredentialsByType(credentials);
    return computeReadinessFromMaps(requiredNames, typeNameToId, credsByType);
  } catch (err) {
    Sentry.captureException(err);
    return { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
  }
}

export async function getStaffReadinessBulk(
  staffMemberIds: string[],
  clinicId: string,
): Promise<Record<string, ReadinessResult>> {
  const result: Record<string, ReadinessResult> = {};

  if (staffMemberIds.length === 0) return result;

  try {
    const supabase = await createClient();

    // Scope everything to the caller-provided clinic (every caller resolves it
    // from the authenticated user's own `users` row). RLS backstops this —
    // an explicit clinic filter keeps the function safe even if a future
    // caller switches to a service-role client.
    const { data: staffRows } = await supabase
      .from("staff_members")
      .select("id, role, clinic_id")
      .eq("clinic_id", clinicId)
      .in("id", staffMemberIds)
      .is("deleted_at", null)
      .is("suspended_at", null);

    if (!staffRows || staffRows.length === 0) return result;

    const staffMap: Record<string, { role: string | null; clinicId: string }> = {};
    const roles = new Set<string>();

    for (const s of staffRows) {
      staffMap[s.id] = { role: s.role, clinicId: s.clinic_id };
      if (s.role) roles.add(s.role);
    }

    const templatesByRole: Record<string, { requiredNames: string[]; typeNameToId: Record<string, string> }> = {};

    const resolved = await getResolvedTemplatesBulk(clinicId, [...roles]);
    for (const [role, template] of Object.entries(resolved)) {
      const typeNameToId: Record<string, string> = {};
      for (const r of template.required) typeNameToId[r.name] = r.credentialTypeId;
      templatesByRole[`${clinicId}:${role}`] = {
        requiredNames: template.required.map((r) => r.name),
        typeNameToId,
      };
    }

    const { data: allCredentials } = await supabase
      .from("credentials")
      .select("staff_member_id, credential_type_id, status, id, credential_type:credential_types!credentials_credential_type_id_fkey(name)")
      .eq("clinic_id", clinicId)
      .in("staff_member_id", staffMemberIds)
      .is("suspended_at", null)
      .is("deleted_at", null);

    const credsByStaff: Record<string, { staff_member_id: string; credential_type_id: string | null; status: string; id: string; credential_type: { name: string } | null }[]> = {};
    for (const c of allCredentials ?? []) {
      const sid = c.staff_member_id;
      if (!sid) continue;
      let bucket = credsByStaff[sid];
      if (!bucket) {
        bucket = [];
        credsByStaff[sid] = bucket;
      }
      bucket.push(c);
    }

    for (const id of staffMemberIds) {
      const staffInfo = staffMap[id];
      const creds = credsByStaff[id] ?? [];

      const role = staffInfo?.role ?? null;
      if (!role) {
        result[id] = { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
        continue;
      }

      const templateKey = `${clinicId}:${role}`;
      const template = templatesByRole[templateKey];
      if (!template || template.requiredNames.length === 0) {
        result[id] = { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
        continue;
      }

      if (creds.length === 0) {
        result[id] = { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
        continue;
      }

      const credsByType = groupCredentialsByType(creds);
      result[id] = computeReadinessFromMaps(template.requiredNames, template.typeNameToId, credsByType);
    }
  } catch (err) {
    Sentry.captureException(err);
    for (const id of staffMemberIds) {
      if (!result[id]) {
        result[id] = { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
      }
    }
  }

  return result;
}
