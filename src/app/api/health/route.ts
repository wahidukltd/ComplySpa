import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MONITOR_SLUG = "app-health";

const healthRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = healthRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    healthRateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of healthRateLimit) {
    if (now > entry.resetAt) healthRateLimit.delete(ip);
  }
}, 300_000);

async function checkSupabase() {
  const supabase = await createClient();
  const checks: Record<string, "ok" | "error"> = {};

  try {
    const { error } = await supabase.from("clinics").select("id").limit(1).maybeSingle();
    if (error) throw error;
    checks.postgres = "ok";
  } catch (e) {
    checks.postgres = "error";
    Sentry.captureException(e, { tags: { check: "supabase_postgres", monitor: MONITOR_SLUG } });
  }

  try {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    checks.auth = "ok";
  } catch (e) {
    checks.auth = "error";
    Sentry.captureException(e, { tags: { check: "supabase_auth", monitor: MONITOR_SLUG } });
  }

  return checks;
}

async function checkCronJob(name: string, maxStaleHours: number): Promise<"ok" | "error"> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_cron_health", {
      p_jobname: name,
      p_max_stale_hours: maxStaleHours,
    });
    if (error) throw error;
    return data ? "ok" : "error";
  } catch (e) {
    Sentry.captureException(e, { tags: { check: "cron_health", cron_job: name, monitor: MONITOR_SLUG } });
    return "error";
  }
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ status: "error", error: "Too many requests" }, { status: 429 });
  }

  const healthSecret = process.env.CRON_SECRET;
  if (healthSecret) {
    const provided = req.headers.get("x-health-check-secret");
    if (!provided || provided !== healthSecret) {
      return NextResponse.json({ status: "error" }, { status: 403 });
    }
  }

  const overallCheckInId = Sentry.captureCheckIn?.({ monitorSlug: MONITOR_SLUG, status: "in_progress" }) ?? null;

  const checks: Record<string, "ok" | "error"> = {};
  let overall = "ok";

  // Supabase Postgres + Auth
  const supabaseChecks = await checkSupabase();
  Object.assign(checks, supabaseChecks);
  if (supabaseChecks.postgres === "error" || supabaseChecks.auth === "error") overall = "error";

  // Verify pg_cron jobs ran on schedule
  const cronJobs = [
    { slug: "cron-credential-status", jobname: "daily-credential-status-update", maxStale: 26 },
    { slug: "cron-credential-scan", jobname: "daily-credential-scan", maxStale: 26 },
    { slug: "cron-escalation-scan", jobname: "daily-escalation-scan", maxStale: 25 },
    { slug: "cron-trial-expiry", jobname: "daily-trial-expiry-check", maxStale: 26 },
    { slug: "cron-inactive-cleanup", jobname: "daily-inactive-cleanup", maxStale: 26 },
  ];

  for (const job of cronJobs) {
    const status = await checkCronJob(job.jobname, job.maxStale);
    checks[job.slug] = status;
    if (status === "error") overall = "error";

    // Send Sentry cron check-in for each cron job
    Sentry.captureCheckIn?.({
      monitorSlug: job.slug,
      status: status === "ok" ? "ok" : "error",
      duration: 0,
    });
  }

  // Complete overall health check-in
  if (overallCheckInId) {
    Sentry.captureCheckIn({
      monitorSlug: MONITOR_SLUG,
      status: overall === "ok" ? "ok" : "error",
      checkInId: overallCheckInId,
    });
  }

  if (overall === "error") {
    Sentry.captureMessage("Health check failed", { level: "error", extra: checks });
  }

  return NextResponse.json(
    { status: overall, checks, timestamp: new Date().toISOString() },
    { status: overall === "ok" ? 200 : 503 },
  );
}
