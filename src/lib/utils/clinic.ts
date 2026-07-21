import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

export async function getClinicId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const supabase = await createClient();
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
  const authResult = await auth();
  if (!authResult.userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, clinic_id")
    .eq("clerk_user_id", authResult.userId)
    .single();
  if (!data) return null;
  return { clinicId: data.clinic_id, userId: authResult.userId, internalUserId: data.id };
}

export async function getClinicIdAndPlan(): Promise<{
  clinicId: string;
  plan: string;
} | null> {
  const authResult = await auth();
  if (!authResult.userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("clinic_id, clinics:clinics(plan)")
    .eq("clerk_user_id", authResult.userId)
    .single();
  if (!data) return null;
  const plan = ((data.clinics as unknown) as { plan: string } | null)?.plan ?? "trial";
  return { clinicId: data.clinic_id, plan };
}
