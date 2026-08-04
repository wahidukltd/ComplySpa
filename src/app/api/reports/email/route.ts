import { NextRequest, NextResponse } from "next/server";
import { sendEmailWithAttachment, HELLO_FROM } from "@/lib/email/send";
import * as Sentry from "@sentry/nextjs";
import { getReportSession } from "@/lib/report/session";
import { assembleReportData } from "@/lib/report/data";
import { renderReportBuffer } from "@/lib/report/render";
import {
  buildReportEmailHtml,
  buildReportSubject,
} from "@/lib/email/templates/report";
import { formatReportDateTime } from "@/lib/pdf/report-content";
import { reportFileName } from "@/lib/report/copy";

export const dynamic = "force-dynamic";

// A malformed or unparseable Origin/Referer is a CSRF rejection, never a 500.
function isTrustedOrigin(value: string | null, appUrl: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

// Bodyless report email: renders the PDF server-side in memory and attaches
// it to an email sent to the requesting user's own address (session-derived).
// Nothing is uploaded, signed, fetched back, or deleted — the buffer dies
// with the request, so there is no cleanup path and no orphan class.
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      Sentry.captureMessage("Report email: NEXT_PUBLIC_APP_URL not configured", { level: "error" });
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    if (!origin && !referer) {
      return NextResponse.json({ error: "Missing origin" }, { status: 403 });
    }
    if (origin) {
      if (!isTrustedOrigin(origin, appUrl)) {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }
    } else if (!isTrustedOrigin(referer, appUrl)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const session = await getReportSession();
    if (session.status !== 200) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    // Viewers may preview/download (read-only assembly) but never email.
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { data, error } = await assembleReportData(session.clinicId, session.email);
    if (error || !data) {
      Sentry.captureException(error ?? new Error("Report data assembly failed"));
      return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }

    let buffer: Buffer;
    try {
      buffer = await renderReportBuffer(data, session.tier);
    } catch (err) {
      Sentry.captureException(err);
      return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }

    const base64Content = buffer.toString("base64");
    const emailSubject = buildReportSubject(data.clinic.name);

    const emailHtml = buildReportEmailHtml({
      clinicName: data.clinic.name,
      reportId: data.reportId,
      generatedAt: formatReportDateTime(data.generatedAt),
    });

    const result = await sendEmailWithAttachment({
      to: session.email,
      subject: emailSubject,
      html: emailHtml,
      from: HELLO_FROM,
      attachment: {
        content: base64Content,
        filename: reportFileName(data.clinic.name),
      },
    });

    if (!result.success) {
      Sentry.captureMessage(`Report email: Resend send failed`, {
        level: "error",
        extra: { error: result.error },
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
