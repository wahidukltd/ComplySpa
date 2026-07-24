import { NextRequest, NextResponse } from "next/server";
import { sendEmailWithAttachment } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getEntitlements } from "@/lib/utils/entitlements";

const emailReportSchema = z.object({
  reportUrl: z.string(),
  reportId: z.string().uuid(),
  clinicName: z.string().max(255),
});

const reportRateLimit = new Map<string, { count: number; resetAt: number }>();
const REPORT_RATE_LIMIT_MAX = 5;
const REPORT_RATE_LIMIT_WINDOW_MS = 3600000;

function checkReportRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = reportRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    reportRateLimit.set(key, { count: 1, resetAt: now + REPORT_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= REPORT_RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of reportRateLimit) {
    if (now > entry.resetAt) reportRateLimit.delete(key);
  }
}, 300000);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin && !referer) {
      return NextResponse.json({ error: "Missing origin" }, { status: 403 });
    }
    if (origin && new URL(origin).origin !== new URL(appUrl ?? "").origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    if (referer && !origin && new URL(referer).origin !== new URL(appUrl ?? "").origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const bodyText = await req.text();
    if (bodyText.length > 100 * 1024) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const supabase = await createClient();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = emailReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { reportUrl, reportId, clinicName } = parsed.data;

    const { data: userRecord } = await supabase
      .from("users")
      .select("email, role, clinic_id")
      .eq("auth_user_id", userId)
      .single();

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (userRecord.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { data: clinicRow } = await supabase
      .from("clinics")
      .select("plan")
      .eq("id", userRecord.clinic_id)
      .single();

    if (!clinicRow) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const entitlements = getEntitlements(clinicRow.plan);
    if (!entitlements.canEmailReports) {
      return NextResponse.json({ error: "Emailing reports requires Practice plan or higher" }, { status: 403 });
    }

    const isWhiteLabel = entitlements.reportTier === "white_label";
    const emailSubject = isWhiteLabel
      ? `Compliance Report — ${escapeHtml(clinicName)}`
      : `Compliance Audit Report — ${escapeHtml(clinicName)}`;

    if (!checkReportRateLimit(userRecord.email)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { data: report } = await supabase
      .from("audit_reports")
      .select("clinic_id")
      .eq("id", reportId)
      .single();

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.clinic_id !== userRecord.clinic_id) {
      return NextResponse.json({ error: "Report does not belong to your clinic" }, { status: 403 });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("documents")
      .createSignedUrl(reportUrl, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      Sentry.captureMessage(`Report email: failed to generate signed URL`, {
        level: "error",
        extra: { reportUrl, reportId, error: signedUrlError?.message },
      });
      return NextResponse.json({ error: "Failed to retrieve report file" }, { status: 500 });
    }

    const response = await fetch(signedUrlData.signedUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      Sentry.captureMessage(`Report email: failed to download PDF from storage`, {
        level: "error",
        extra: { reportUrl, reportId, status: response.status },
      });
      return NextResponse.json({ error: "Failed to retrieve report file" }, { status: 500 });
    }

    const pdfBuffer = await response.arrayBuffer();
    if (pdfBuffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const base64Content = Buffer.from(pdfBuffer).toString("base64");

    const emailHeading = isWhiteLabel ? "Compliance Report" : "Compliance Audit Report";
    const result = await sendEmailWithAttachment({
      to: userRecord.email,
      subject: emailSubject,
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F5F5;padding:24px 0;">
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background:#FFFFFF;border-radius:8px;">
                <tr>
                  <td style="padding:32px 32px 0 32px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="width:4px;height:32px;background:#6E97A7;"></td>
                        <td style="padding-left:12px;">
                          <p style="margin:0;font-size:16px;font-weight:600;color:#000000;">${escapeHtml(emailHeading)}</p>
                          <p style="margin:2px 0 0 0;font-size:13px;color:rgba(0,0,0,0.55);">${escapeHtml(clinicName)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="padding:24px 32px 0 32px;border-top:1px solid rgba(0,0,0,0.08);">
                  <p style="margin:0;font-size:14px;color:#000000;">Hello,</p>
                  <p style="margin:12px 0 0 0;font-size:14px;color:#000000;line-height:1.5;">
                    Your ${isWhiteLabel ? "compliance report" : "compliance audit report"} has been generated and is attached to this email.
                  </p>
                  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:#F8FAFB;border-radius:6px;padding:16px;font-size:13px;color:#000000;width:100%;">
                    <tr><td style="padding:4px 0;color:rgba(0,0,0,0.55);width:100px;">Clinic</td><td style="padding:4px 0;font-weight:500;">${escapeHtml(clinicName)}</td></tr>
                    <tr><td style="padding:4px 0;color:rgba(0,0,0,0.55);">Report ID</td><td style="padding:4px 0;font-weight:500;font-family:monospace;font-size:12px;">${reportId}</td></tr>
                  </table>
                </td></tr>
                <tr><td style="padding:24px 32px 32px 32px;">
                  <p style="margin:0;font-size:12px;color:rgba(0,0,0,0.45);line-height:1.5;">
                    This report was generated from ${isWhiteLabel ? "your credential tracking system." : "your credential tracking system at ComplySpa."}
                    ${isWhiteLabel ? "" : "Please verify all information before submitting to a regulatory body."}
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
      attachment: {
        content: base64Content,
        filename: `${isWhiteLabel ? "" : "compliance-"}report-${clinicName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.pdf`,
      },
    });

    if (!result.success) {
      Sentry.captureMessage(`Report email: Resend send failed`, {
        level: "error",
        extra: { reportId, error: result.error, recipient: userRecord.email },
      });
      return NextResponse.json(
        { error: "Failed to send email. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

