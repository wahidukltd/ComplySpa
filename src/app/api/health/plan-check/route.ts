import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/utils/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ blocked: true });

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!userRecord) return NextResponse.json({ blocked: true });

  const { data: clinic } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", userRecord.clinic_id)
    .maybeSingle();

  if (!clinic) return NextResponse.json({ blocked: true });

  return NextResponse.json({ blocked: getEntitlements(clinic.plan).blocked });
}
