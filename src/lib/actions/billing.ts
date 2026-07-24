"use server";
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createCheckoutLink, type PlanId } from "@/lib/polar/checkout";
import { createCustomerPortalUrl } from "@/lib/polar/customer-portal";
import * as Sentry from "@sentry/nextjs";

export async function getCheckoutUrl(plan: PlanId): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userRecord } = await supabase
      .from("users")
      .select("id, clinic_id")
      .eq("auth_user_id", user.id)
      .single();
    if (!userRecord) return null;

    const { data: clinic } = await supabase
      .from("clinics")
      .select("id, polar_customer_id")
      .eq("id", userRecord.clinic_id)
      .single();
    if (!clinic) return null;

    const result = await createCheckoutLink(plan, clinic.polar_customer_id ?? undefined, {
      clinic_id: clinic.id,
    });

    return result.url;
  } catch (err) {
    Sentry.captureException(err, { extra: { plan } });
    return null;
  }
}

export async function getPortalUrl(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userRecord } = await supabase
      .from("users")
      .select("clinic_id")
      .eq("auth_user_id", user.id)
      .single();
    if (!userRecord) return null;

    const { data: clinic } = await supabase
      .from("clinics")
      .select("polar_customer_id")
      .eq("id", userRecord.clinic_id)
      .single();
    if (!clinic?.polar_customer_id) return null;

    const result = await createCustomerPortalUrl(clinic.polar_customer_id);
    return result.url;
  } catch (err) {
    Sentry.captureException(err);
    return null;
  }
}
