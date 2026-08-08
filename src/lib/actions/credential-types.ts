"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import { customCredentialTypeSchema } from "@/lib/validations/settings";
import * as Sentry from "@sentry/nextjs";

/**
 * Single implementation of custom credential type creation (plan §4.7) —
 * used by both the Settings "Credential Types" tab and the credential
 * form's inline custom-type dialog. The Settings page's former duplicate
 * action was removed; this is the only one.
 */
export async function addCustomCredentialType(input: {
  name: string;
  category: string;
  renewal_days?: number;
}) {
  const clinicData = await getClinicIdAndUser();
  if (!clinicData) return { error: "Unauthorized" };

  const { clinicId, userId } = clinicData;

  const parsed = customCredentialTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!user) return { error: "Unauthorized" };
  if (!["owner", "manager"].includes(user.role)) return { error: "Insufficient permissions" };

  const { data: newType, error } = await supabase
    .from("credential_types")
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      default_renewal_cycle_days: parsed.data.renewal_days ?? null,
      is_custom: true,
      clinic_id: clinicId,
    })
    .select("id, name, category, default_renewal_cycle_days")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique index (name, COALESCE(clinic_id, zero)) — a true duplicate
      // within this clinic's custom set. Globals and same-name customs from
      // other clinics are untouched by design (international-first).
      return { error: "A credential type with this name already exists in your clinic." };
    }
    Sentry.captureException(error);
    return { error: "Failed to create credential type." };
  }

  revalidatePath("/dashboard/settings");
  return { data: newType };
}
