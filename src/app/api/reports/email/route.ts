import { NextRequest, NextResponse } from "next/server";
import { sendEmailWithAttachment } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const emailReportSchema = z.object({
  reportUrl: z.string(),
  reportId: z.string().uuid(),
  clinicName: z.string().max(255),
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = parseInt(req.headers.get("content-length") ?? "0");
    if (contentLength > 100 * 1024) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
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

    const { count: recentRequests } = await supabase
      .from("alert_logs")
      .select("id", { count: "exact", head: true })
      .eq("recipient", userRecord.email)
      .gte("sent_at", new Date(Date.now() - 3600000).toISOString());

    if ((recentRequests ?? 0) > 5) {
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

    const result = await sendEmailWithAttachment({
      to: userRecord.email,
      subject: `Compliance Audit Report — ${escapeHtml(clinicName)}`,
      html: `
        <p>Your compliance audit report is attached.</p>
        <p>Clinic: ${escapeHtml(clinicName)}</p>
        <p>Report ID: ${reportId}</p>
        <p style="color: rgba(0,0,0,0.55); font-size: 12px;">
          This report was generated from your credential tracking system.
          Please verify all information before submitting to a regulatory body.
        </p>
      `,
      attachment: {
        content: base64Content,
        filename: `compliance-report-${clinicName.replace(/\s+/g, "-").toLowerCase()}.pdf`,
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

