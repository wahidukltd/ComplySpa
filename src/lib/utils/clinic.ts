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
    .eq("clerk_user_id", userId)
    .single();
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
    .eq("clerk_user_id", authUser.id)
    .single();
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
  const { data, error } = await supabase
    .from("users")
    .select("clinic_id, clinics:clinics(plan)")
    .eq("clerk_user_id", authUser.id)
    .single();
  if (error) {
    Sentry.captureException(error);
    return null;
  }
  if (!data) return null;
  const plan = ((data.clinics as unknown) as { plan: string } | null)?.plan ?? "trial";
  return { clinicId: data.clinic_id, plan, userId: authUser.id };
}
