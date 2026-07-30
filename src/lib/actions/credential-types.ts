"use server";

import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import * as Sentry from "@sentry/nextjs";

const addCredentialTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  category: z.enum(["license", "training", "insurance", "agreement"]),
  renewal_days: z.coerce.number().int().positive().optional(),
});

export async function addCustomCredentialType(input: {
  name: string;
  category: string;
  renewal_days?: number;
}) {
  const clinicData = await getClinicIdAndPlan();
  if (!clinicData) return { error: "Unauthorized" };

  const { clinicId, userId } = clinicData;

  const parsed = addCredentialTypeSchema.safeParse(input);
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
  if (user.role === "viewer") return { error: "Insufficient permissions" };

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
    Sentry.captureException(error);
    return { error: "Failed to create credential type." };
  }

  return { data: newType };
}
