import { NextRequest, NextResponse } from "next/server";
import { sendEmailWithAttachment } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const emailReportSchema = z.object({
  reportUrl: z.string().url(),
  reportId: z.string().uuid(),
  clinicName: z.string().max(255),
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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

    const now = Date.now();
    const rateKey = `email-report:${userId}`;
    const entry = rateLimitMap.get(rateKey);
    if (entry && entry.resetAt > now) {
      if (entry.count >= 5) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
      entry.count++;
    } else {
      rateLimitMap.set(rateKey, { count: 1, resetAt: now + 3600000 });
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

    if (!reportUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/sign/`)) {
      return NextResponse.json({ error: "Invalid report URL origin" }, { status: 400 });
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("email, role")
      .eq("auth_user_id", userId)
      .single();

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (userRecord.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const response = await fetch(reportUrl, { signal: AbortSignal.timeout(15000) });
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

