import { createClient } from "npm:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@^8";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    defaultIntegrations: false,
    tracesSampleRate: 1.0,
  });
  Sentry.setTag("region", Deno.env.get("SB_REGION") ?? "local");
  Sentry.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "local");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Compliance Alerts <onboarding@resend.dev>";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface RequestBody {
  clinic_id: string;
  clinic_name: string;
}

function validateBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.clinic_id === "string" && b.clinic_id.length > 0 &&
         typeof b.clinic_name === "string" && b.clinic_name.length > 0;
}

function isAuthorizedCaller(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const header = req.headers.get("x-cron-secret");
  if (!header) return false;
  try {
    const enc = new TextEncoder();
    const a = enc.encode(header);
    const b = enc.encode(CRON_SECRET);
    if (a.byteLength !== b.byteLength) return false;
    return crypto.subtle.timingSafeEqual(a, b);
  } catch {
    return header === CRON_SECRET;
  }
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#x27;",
};

function htmlEscape(str: string): string {
  return str.replace(/[&<>\"']/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  try {
    if (!isAuthorizedCaller(req)) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (!validateBody(body)) {
      return json({
        success: false,
        error: "Missing required fields: clinic_id (string), clinic_name (string)",
      }, 400);
    }

    const { clinic_id, clinic_name } = body;
    const safeName = htmlEscape(clinic_name);

    const { data: owner } = await supabase
      .from("users")
      .select("email")
      .eq("clinic_id", clinic_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (!owner?.email) {
      Sentry.captureMessage(`[send-audit-reminder] No owner email for clinic ${clinic_id}`, { level: "warning" });
      await Sentry.flush(2000);
      return json({ success: false, error: "No owner email found" }, 200);
    }

    const auditUrl = `${APP_URL}/dashboard/audit`;

    const emailResult = await sendEmailWithRetry(
      owner.email,
      `Quarterly Audit Reminder — ${safeName}`,
      buildEmailHtml(safeName, auditUrl),
    );

    if (!emailResult.success) {
      await Sentry.flush(2000);
      return json({ success: false, error: "Failed to send email" }, 500);
    }

    // ponytail: alert_logs requires credential_id FK — audit reminders have no
    // associated credential. Add a separate email_logs table if audit-trail
    // persistence is needed for non-credential emails.

    return json({ success: true, messageId: emailResult.messageId }, 200);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err instanceof Error ? err : new Error(errorMsg));
    await Sentry.flush(2000);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});

function json(data: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildEmailHtml(safeClinicName: string, auditUrl: string): string {
  return `
    <p>Your quarterly inspection-readiness audit is overdue.</p>
    <p>State board inspectors expect med spas to review compliance quarterly.
    Your last completed audit for <strong>${safeClinicName}</strong> was more than 90 days ago.</p>
    <p><a href="${auditUrl}" style="color: #9C6B5D; text-decoration: underline;">
      Run your readiness audit now
    </a></p>
    <p style="color: #8B7D78; font-size: 12px; margin-top: 16px;">
      This is an automated reminder from your compliance tracking system.
    </p>
  `;
}

async function sendEmailWithRetry(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; messageId?: string }> {
  const MAX_RETRIES = 2;
  const INITIAL_DELAY_MS = 1000;

  if (!RESEND_API_KEY) return { success: false };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
      });

      const data = await res.json();

      if (res.ok && data?.id) return { success: true, messageId: data.id };

      const errorMsg = data?.message || `HTTP ${res.status}`;

      if (errorMsg.includes("invalid") || errorMsg.includes("blocked") || res.status === 422) {
        Sentry.captureMessage(`Resend permanent failure: ${errorMsg}`, {
          level: "error",
          extra: { recipient: to },
        });
        return { success: false };
      }

      if (attempt < MAX_RETRIES) await sleep(INITIAL_DELAY_MS * Math.pow(2, attempt));
    } catch (err) {
      if (attempt < MAX_RETRIES) await sleep(INITIAL_DELAY_MS * Math.pow(2, attempt));
    }
  }

  Sentry.captureMessage("Resend email failed after max retries", {
    level: "error",
    extra: { recipient: to, subject },
  });

  return { success: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
