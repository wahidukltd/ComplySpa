import { createClient } from "@/lib/supabase/server";
import { ROLE_CREDENTIAL_REQUIRED_MAP } from "@/lib/staff/role-credential-defaults";
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

async function resolveTypeNameToId(
  requiredNames: string[],
): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data: typeRows } = await supabase
    .from("credential_types")
    .select("id, name")
    .in("name", requiredNames);

  const map: Record<string, string> = {};
  for (const t of typeRows ?? []) {
    map[t.name] = t.id;
  }
  return map;
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
      .select("role")
      .eq("id", staffMemberId)
      .is("deleted_at", null)
      .is("suspended_at", null)
      .single();

    if (!staff) {
      return { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
    }

    const requiredNames = staff.role ? ROLE_CREDENTIAL_REQUIRED_MAP[staff.role] : undefined;
    if (!requiredNames || requiredNames.length === 0) {
      return { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
    }

    const typeNameToId = await resolveTypeNameToId(requiredNames);

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
): Promise<Record<string, ReadinessResult>> {
  const result: Record<string, ReadinessResult> = {};

  if (staffMemberIds.length === 0) return result;

  try {
    const supabase = await createClient();

    const { data: staffRows } = await supabase
      .from("staff_members")
      .select("id, role")
      .in("id", staffMemberIds)
      .is("deleted_at", null)
      .is("suspended_at", null);

    if (!staffRows || staffRows.length === 0) return result;

    const roleMap: Record<string, string | null> = {};
    const roleStaffMap: Record<string, string[]> = {};
    for (const s of staffRows) {
      roleMap[s.id] = s.role;
      const roleKey = s.role ?? "__none__";
      if (!roleStaffMap[roleKey]) roleStaffMap[roleKey] = [];
      roleStaffMap[roleKey].push(s.id);
    }

    const allRequiredNames = new Set<string>();
    for (const roleKey of Object.keys(roleStaffMap)) {
      if (roleKey === "__none__") continue;
      const names = ROLE_CREDENTIAL_REQUIRED_MAP[roleKey];
      if (names) names.forEach((n) => allRequiredNames.add(n));
    }

    let globalTypeNameToId: Record<string, string> = {};
    if (allRequiredNames.size > 0) {
      globalTypeNameToId = await resolveTypeNameToId(Array.from(allRequiredNames));
    }

    const { data: allCredentials } = await supabase
      .from("credentials")
      .select("staff_member_id, credential_type_id, status, id, credential_type:credential_types!credentials_credential_type_id_fkey(name)")
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
      const role = roleMap[id] ?? null;
      const creds = credsByStaff[id] ?? [];

      const requiredNames = role ? ROLE_CREDENTIAL_REQUIRED_MAP[role] : undefined;
      if (!requiredNames || requiredNames.length === 0) {
        result[id] = { status: "ready", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
        continue;
      }

      if (creds.length === 0) {
        result[id] = { status: "pending", missingCredentials: [], expiredCredentials: [], expiringCredentials: [] };
        continue;
      }

      const credsByType = groupCredentialsByType(creds);
      result[id] = computeReadinessFromMaps(requiredNames, globalTypeNameToId, credsByType);
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
