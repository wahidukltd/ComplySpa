import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";

export async function getClinicId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data?.clinic_id ?? null;
}

export async function getClinicIdAndUser(): Promise<{
  clinicId: string;
  userId: string;
  internalUserId: string | null;
} | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.id) return null;
  const { data } = await supabase
    .from("users")
    .select("id, clinic_id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (!data) return null;
  return { clinicId: data.clinic_id, userId: authUser.id, internalUserId: data.id };
}

export async function getClinicIdAndPlan(): Promise<{
  clinicId: string;
  plan: string;
  userId: string;
} | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser?.id) return null;
  const { data: userData, error: userErr } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (userErr || !userData) {
    if (userErr) Sentry.captureException(userErr);
    return null;
  }

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", userData.clinic_id)
    .maybeSingle();

  if (clinicErr) {
    Sentry.captureException(clinicErr);
    return null;
  }

  return { clinicId: userData.clinic_id, plan: clinic?.plan ?? "trial", userId: authUser.id };
}

