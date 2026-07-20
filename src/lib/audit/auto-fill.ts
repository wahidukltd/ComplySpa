import "server-only";

import { createClient } from "@/lib/supabase/server";
import { CHECKLIST_ITEMS } from "./checklist";
import type { ChecklistItemId, AutoFillResult } from "./checklist";

export async function autoFillItem(
  itemId: ChecklistItemId,
  clinicId: string,
): Promise<AutoFillResult> {
  const supabase = await createClient();

  switch (itemId) {
    case "medical_director_agreement": {
      const typeId = await getCredentialTypeId(supabase, "Medical Director Agreement");
      if (!typeId) {
        return { status: "stale", notes: "Medical Director Agreement credential type not found in system." };
      }

      const { data } = await supabase
        .from("credentials")
        .select("status, expiration_date")
        .eq("credential_type_id", typeId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (!data) return { status: "stale", notes: "No Medical Director Agreement credential found." };
      if (data.status === "valid") return { status: "pass", notes: "Active agreement on file." };
      if (data.status === "expiring") return { status: "fail", notes: "Agreement expires soon — renew now." };
      return { status: "fail", notes: "Agreement is expired." };
    }

    case "facility_license": {
      const { data: types } = await supabase
        .from("credential_types")
        .select("id, name")
        .or("name.ilike.%facility%,name.ilike.%state registration%");

      const facilityType = types?.find(
        (t) =>
          t.name.toLowerCase().includes("facility") ||
          t.name.toLowerCase().includes("state registration"),
      );

      if (!facilityType) {
        return {
          status: "manual_attest",
          notes: "No facility license credential type tracked. Add a custom 'Facility License' type or attest manually.",
        };
      }

      const { data } = await supabase
        .from("credentials")
        .select("status, expiration_date")
        .eq("credential_type_id", facilityType.id)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (!data) return { status: "stale", notes: `Credential type "${facilityType.name}" exists but no record filed.` };
      if (data.status === "valid") return { status: "pass", notes: "Facility license is valid." };
      if (data.status === "expiring") return { status: "fail", notes: "Facility license expires soon." };
      return { status: "fail", notes: "Facility license is expired." };
    }

    case "staff_license_verifications": {
      const { data: staff } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null);

      if (!staff || staff.length === 0) {
        return { status: "stale", notes: "No staff members on file." };
      }

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const cutoff = oneYearAgo.toISOString();

      const staffIds = staff.map((s) => s.id);
      const { data: verifiedCreds } = await supabase
        .from("credentials")
        .select("staff_member_id")
        .in("staff_member_id", staffIds)
        .gte("last_verified_date", cutoff);

      const verifiedIds = new Set((verifiedCreds ?? []).map((c) => c.staff_member_id));
      const unverified = staff.filter((s) => !verifiedIds.has(s.id)).map((s) => s.name);

      if (unverified.length === 0) {
        return { status: "pass", notes: `All ${staff.length} staff verified within the last year.` };
      }
      return {
        status: "fail",
        notes: `${unverified.length} staff not verified in 365 days: ${unverified.join(", ")}`,
      };
    }

    case "dea_registration": {
      const typeId = await getCredentialTypeId(supabase, "DEA Registration");
      if (!typeId) return { status: "stale", notes: "DEA Registration credential type not found in system." };

      const { data } = await supabase
        .from("credentials")
        .select("status, expiration_date")
        .eq("credential_type_id", typeId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (!data) return { status: "stale", notes: "No DEA Registration credential found." };
      if (data.status === "valid") return { status: "pass", notes: "DEA registration is valid." };
      if (data.status === "expiring") return { status: "fail", notes: "DEA registration expires soon." };
      return { status: "fail", notes: "DEA registration is expired." };
    }

    case "signed_treatment_protocols":
    case "patient_chart_sample":
    case "advertising_file":
      return { status: "manual_attest", notes: "Requires manual confirmation." };

    default:
      return { status: "manual_attest", notes: "Unknown checklist item." };
  }
}

async function getCredentialTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("credential_types")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  return data?.id ?? null;
}

export async function autoFillAll(
  clinicId: string,
): Promise<Map<ChecklistItemId, AutoFillResult>> {
  const results = new Map<ChecklistItemId, AutoFillResult>();

  for (const item of CHECKLIST_ITEMS) {
    if (item.autoFill === false) continue;
    const result = await autoFillItem(item.id, clinicId);
    results.set(item.id, result);
  }

  return results;
}
