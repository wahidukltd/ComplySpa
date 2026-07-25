import { createClient } from "npm:@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/deno@^8";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    defaultIntegrations: false,
    tracesSampleRate: 1.0,
    sampleRate: 1.0,
    normalizeDepth: 10,
    beforeSend(event) {
      if (event.level === "info" || event.level === "debug" || event.level === "log") {
        event.level = "warning";
      }
      return event;
    },
  });
  Sentry.setTag("region", Deno.env.get("SB_REGION") ?? "local");
  Sentry.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "local");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Compliance Alerts <alerts@complyspa.com>";

const ACTIVE_PLANS = new Set(["trial", "solo", "practice", "multi_location"]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  Sentry.captureMessage("send-credential-alert: Missing Supabase credentials", { level: "error" });
  throw new Error("Missing Supabase credentials");
}

interface RequestBody {
  credential_id: string;
  clinic_id: string;
  days_before: number;
}

interface CredentialWithRelations {
  id: string;
  staff_member_id: string;
  clinic_id: string;
  license_number: string | null;
  expiration_date: string;
  staff_member: { name: string | null; deleted_at: string | null; suspended_at: string | null } | null;
  credential_type: { name: string | null } | null;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function validateBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.credential_id === "string" && b.credential_id.length > 0 &&
    typeof b.clinic_id === "string" && b.clinic_id.length > 0 &&
    typeof b.days_before === "number"
  );
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function htmlEscape(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

function isAuthorizedCaller(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const header = req.headers.get("x-cron-secret");
  if (!header) return false;
  const enc = new TextEncoder();
  const a = enc.encode(header);
  const b = enc.encode(CRON_SECRET);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

function layoutHtml(previewText: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <style>body,table,td,p,a,li,blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}@media only screen and (max-width:560px){.email-table{width:100%!important;}.email-pad{padding:24px 20px!important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#FFFFFF;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${htmlEscape(previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="email-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function cardHtml(borderTop: string | null, children: string): string {
  const border = borderTop ? `border-top:4px solid ${borderTop};` : "";
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid rgba(0,0,0,0.12);${border}border-radius:0 0 8px 8px;">
  <tr><td class="email-pad" style="padding:32px 28px;">
    ${children}
  </td></tr>
</table></td></tr>`;
}

function headerHtml(label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="width:4px;height:28px;background:#6E97A7;"></td>
    <td style="padding-left:12px;">
      <p style="margin:0;font-size:13px;color:rgba(0,0,0,0.55);letter-spacing:0.5px;">${htmlEscape(label)}</p>
    </td>
  </tr>
</table>`;
}

function headingHtml(text: string): string {
  return `<h2 style="color:#000000;font-size:20px;font-weight:600;margin:12px 0 16px;">${text}</h2>`;
}

function buttonHtml(href: string, text: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td align="center" style="border-radius:6px;background:${color};">
      <a href="${htmlEscape(href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:500;color:#FFFFFF;text-decoration:none;border-radius:6px;background:${color};mso-hide:none;">${htmlEscape(text)}</a>
    </td>
  </tr>
</table>`;
}

function buildAlertEmailHtml(
  staffName: string, _credentialType: string, credentialLabel: string,
  expirationDate: string, daysBeforeExpiration: number, dashboardLink: string,
): string {
  const urgencyMsg = daysBeforeExpiration <= 7
    ? "Expires this week. Renew immediately."
    : daysBeforeExpiration <= 30
      ? "Expiring soon. Schedule renewal now."
      : "Plan ahead for renewal.";

  return layoutHtml(
    `${staffName}'s credential expires in ${daysBeforeExpiration} days`,
    `${headerHtml("COMPLIANCE ALERT")}
    ${cardHtml(null, `
      ${headingHtml(`${staffName}'s credential expires in ${daysBeforeExpiration} days`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F4F5;border-radius:6px;padding:16px;margin:0 0 20px;">
        <tr><td>
          <p style="color:#000000;font-size:14px;margin:0 0 4px;"><strong>${credentialLabel}</strong></p>
          <p style="color:rgba(0,0,0,0.55);font-size:13px;margin:0 0 4px;">Expiration date: <strong>${expirationDate}</strong></p>
          <p style="color:#6E97A7;font-size:13px;margin:0;">${urgencyMsg}</p>
        </td></tr>
      </table>
      <p style="color:#000000;font-size:14px;line-height:1.6;margin:0 0 16px;">Renew at the state board website before the expiration date. Once renewed, upload the new certificate in the dashboard. Expired credentials can mean fines, license suspension, or a board investigation.</p>
      ${buttonHtml(dashboardLink, "View in dashboard", "#6E97A7")}
      <hr style="border:none;border-top:1px solid rgba(0,0,0,0.12);margin:0 0 16px;">
      <p style="color:rgba(0,0,0,0.45);font-size:11px;line-height:1.5;margin:0;">This is an automated alert from your compliance tracker. Alerts are sent at 90, 60, 30, and 7 days before each expiration.</p>
    `)}
    <tr><td style="padding:16px 0 0;">
      <p style="color:rgba(0,0,0,0.45);font-size:11px;line-height:1.5;margin:0 0 4px;">ComplySpa \u2014 Med Spa Compliance</p>
    </td></tr>`,
  );
}

function buildEscalationEmailHtml(
  staffName: string, _credentialType: string, credentialLabel: string,
  expirationDate: string, daysBeforeExpiration: number, dashboardLink: string,
): string {
  return layoutHtml(
    `CREDENTIAL EXPIRED: ${staffName}'s credential has expired`,
    `${headerHtml("ESCALATION \u2014 CREDENTIAL EXPIRED")}
    ${cardHtml("#B8443A", `
      ${headingHtml(`${staffName}'s credential has expired`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FCE8E5;border:1px solid #B8443A;border-radius:6px;padding:16px;margin:0 0 20px;">
        <tr><td>
          <p style="color:#7A2A26;font-size:14px;margin:0 0 4px;"><strong>${credentialLabel}</strong></p>
          <p style="color:#7A2A26;font-size:13px;margin:0 0 4px;">Expired: <strong>${expirationDate}</strong></p>
          <p style="color:#B8443A;font-size:13px;font-weight:500;margin:0;">${Math.abs(daysBeforeExpiration)} days past expiration. Renew immediately.</p>
        </td></tr>
      </table>
      <p style="color:#000000;font-size:14px;line-height:1.6;margin:0 0 16px;">This staff member cannot legally perform procedures that require this credential. That is a direct liability for your clinic. Expired credentials are the most common trigger for board investigations, fines, and licensing actions against med spas.</p>
      ${buttonHtml(dashboardLink, "View in dashboard", "#B8443A")}
      <hr style="border:none;border-top:1px solid rgba(0,0,0,0.12);margin:0 0 16px;">
      <p style="color:rgba(0,0,0,0.45);font-size:11px;line-height:1.5;margin:0;">This is an automated escalation alert. If you have already renewed this credential, update it in the dashboard to stop receiving alerts.</p>
    `)}
    <tr><td style="padding:16px 0 0;">
      <p style="color:rgba(0,0,0,0.45);font-size:11px;line-height:1.5;margin:0 0 4px;">ComplySpa \u2014 Med Spa Compliance</p>
    </td></tr>`,
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();

  const MONITOR_SLUG = "credential-alert";

  const checkInId = SENTRY_DSN ? Sentry.captureCheckIn({
    monitorSlug: MONITOR_SLUG,
    status: "in_progress",
  }) : null;

  try {
    if (!isAuthorizedCaller(req)) {
      const res = json({ success: false, error: "Unauthorized" }, 401);
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "error",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      await Sentry.flush(2000);
      return res;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      const res = json({ success: false, error: "Invalid JSON body" }, 400);
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "error",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      await Sentry.flush(2000);
      return res;
    }

    if (!validateBody(body)) {
      const res = json({
        success: false,
        error: "Missing required fields: credential_id (string), clinic_id (string), days_before (number)",
      }, 400);
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "error",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      await Sentry.flush(2000);
      return res;
    }

    const { credential_id, clinic_id, days_before } = body;

    const { data: credential, error: credError } = await supabase
      .from("credentials")
      .select(
        "id, staff_member_id, credential_type_id, clinic_id, license_number, state, expiration_date, staff_member:staff_members!credentials_staff_member_id_fkey(name, deleted_at, suspended_at), credential_type:credential_types!credentials_credential_type_id_fkey(name)",
      )
      .eq("id", credential_id)
      .eq("clinic_id", clinic_id)
      .is("suspended_at", null)
      .single<CredentialWithRelations>();

    if (credError || !credential) {
      Sentry.captureMessage("Edge Function: credential not found", {
        level: "warning",
        extra: { credential_id, clinic_id },
      });
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "ok",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      await Sentry.flush(2000);
      return json({ success: false, error: "Credential not found" }, 404);
    }

    if (credential.staff_member?.deleted_at || credential.staff_member?.suspended_at) {
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "ok",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      return json({ success: true, data: { email_sent: false } }, 200);
    }

    const { data: owners, error: ownerError } = await supabase
      .from("users")
      .select("email")
      .eq("clinic_id", clinic_id)
      .eq("role", "owner")
      .limit(1);

    if (ownerError || !owners || owners.length === 0) {
      Sentry.captureMessage("Edge Function: no clinic owner found", {
        level: "warning",
        extra: { clinic_id },
      });
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "ok",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      await Sentry.flush(2000);
      return json({ success: false, error: "No clinic owner found" }, 404);
    }

    const ownerEmail = owners[0].email;

    const { data: alertRecipients } = await supabase
      .from("alert_recipients")
      .select("email")
      .eq("clinic_id", clinic_id)
      .eq("is_active", true);

    const allRecipients = [...new Set([ownerEmail, ...(alertRecipients?.map((r) => r.email) ?? [])])].filter(Boolean);

    const { data: clinic } = await supabase
      .from("clinics")
      .select("plan, name")
      .eq("id", clinic_id)
      .single();

    if (!clinic) {
      return json({ success: false, error: "Clinic not found" }, 404);
    }

    if (!ACTIVE_PLANS.has(clinic.plan)) {
      Sentry.captureMessage("send-credential-alert: Skipping inactive clinic", { level: "info", extra: { clinic_id, plan: clinic.plan } });
      if (checkInId) {
        Sentry.captureCheckIn({
          monitorSlug: MONITOR_SLUG,
          status: "ok",
          checkInId,
          duration: Date.now() - startTime,
        });
      }
      return json({ success: true, data: { email_sent: false } }, 200);
    }

    const staffName = htmlEscape(credential.staff_member?.name ?? "Unknown");
    const credentialType = htmlEscape(credential.credential_type?.name ?? "Credential");
    const licenseLabel = htmlEscape(
      credential.license_number
        ? `${credential.credential_type?.name ?? ""} #${credential.license_number}`
        : credential.credential_type?.name ?? "Credential",
    );
    const expDate = new Date(credential.expiration_date).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
    const dashboardLink = `${APP_URL}/dashboard/credentials`;

    const isEscalation = days_before < 0;
    const subject = isEscalation
      ? `CREDENTIAL EXPIRED: ${staffName}'s ${credentialType}`
      : `${staffName}'s ${credentialType} expires in ${days_before} days`;

    const emailHtml = isEscalation
      ? buildEscalationEmailHtml(staffName, credentialType, licenseLabel, expDate, days_before, dashboardLink)
      : buildAlertEmailHtml(staffName, credentialType, licenseLabel, expDate, days_before, dashboardLink);

    let anySuccess = false;

    for (const recipient of allRecipients) {
      const result = await sendEmailWithRetry(recipient, subject, emailHtml);
      if (result.success) anySuccess = true;

      const { error: emailLogError } = await supabase.from("alert_logs").insert({
        credential_id,
        clinic_id,
        alert_type: "email",
        days_before_expiration: days_before,
        recipient,
        delivery_status: result.success ? "pending" : "failed",
        resend_webhook_id: result.messageId ?? null,
      });

      if (emailLogError) {
        Sentry.captureMessage("Edge Function: failed to log email alert to alert_logs", {
          level: "error",
          extra: { credential_id, recipient, error: emailLogError.message },
        });
      }
    }

    const duration = Date.now() - startTime;
    Sentry.captureMessage("send-credential-alert: OK", { level: "info", extra: { credential_id, clinic_id, duration_ms: duration } });

    if (checkInId) {
      Sentry.captureCheckIn({
        monitorSlug: MONITOR_SLUG,
        status: "ok",
        checkInId,
        duration,
      });
    }

    return json({
      success: true,
      data: {
        email_sent: anySuccess,
        email_message_id: null,
      },
    }, 200);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err instanceof Error ? err : new Error(errorMsg));
    Sentry.captureMessage("send-credential-alert: Unhandled error", { level: "error", extra: { error: errorMsg } });

    if (checkInId) {
      Sentry.captureCheckIn({
        monitorSlug: MONITOR_SLUG,
        status: "error",
        checkInId,
        duration: Date.now() - startTime,
      });
    }

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
