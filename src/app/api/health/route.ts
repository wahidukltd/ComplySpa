import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  let overall = "ok";

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("clinics").select("id").limit(1).maybeSingle();
    if (error) throw error;
    checks.postgres = "ok";
  } catch (e) {
    checks.postgres = "error";
    overall = "error";
    Sentry.captureException(e, { tags: { check: "supabase_postgres" } });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();
    if (error) throw error;
    checks.auth = "ok";
  } catch (e) {
    checks.auth = "error";
    overall = "error";
    Sentry.captureException(e, { tags: { check: "supabase_auth" } });
  }

  if (overall === "error") {
    Sentry.captureMessage("Health check failed", {
      level: "error",
      extra: checks,
    });
  }

  return NextResponse.json(
    { status: overall, checks, timestamp: new Date().toISOString() },
    { status: overall === "ok" ? 200 : 503 },
  );
}
