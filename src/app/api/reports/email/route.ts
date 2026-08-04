import { NextRequest, NextResponse } from "next/server";
import { sendEmailWithAttachment } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getEntitlements } from "@/lib/utils/entitlements";
import {
  buildReportEmailHtml,
  buildReportSubject,
} from "@/lib/email/templates/report";
import { isClinicScopedReportPath, deleteReportFileFromStorage } from "@/lib/utils/report-file";

const emailReportSchema = z.object({
  filePath: z.string().min(1).max(255),
  reportId: z.string().uuid(),
  clinicName: z.string().max(255),
});

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
    if (origin && new URL(origin).origin !== new URL(appUrl).origin) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    if (referer && !origin && new URL(referer).origin !== new URL(appUrl).origin) {
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

    // Session context BEFORE any cleanup decision: ownership is always derived
    // from the session (migration 049 principle) — never from the request.
    const { data: userRecord } = await supabase
      .from("users")
      .select("email, role, clinic_id")
      .eq("auth_user_id", userId)
      .single();

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const parsed = emailReportSchema.safeParse(body);
    if (!parsed.success) {
      // The client uploads the PDF before this call; a malformed body must not
      // orphan it. Cleanup is ownership-gated: only the caller's own clinic
      // folder may be removed (uploads are policy-scoped to that folder anyway).
      const maybePath = typeof body.filePath === "string" ? body.filePath : null;
      if (maybePath && isClinicScopedReportPath(maybePath, userRecord.clinic_id)) {
        await deleteReportFileFromStorage(maybePath);
      }
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { filePath, reportId, clinicName } = parsed.data;

    // Ownership gate for BOTH the send and the cleanup: the admin-client delete
    // in the finally below must never run on a path that failed this check.
    const owned = isClinicScopedReportPath(filePath, userRecord.clinic_id);

    try {
      if (userRecord.role === "viewer") {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }

      const { data: clinicRow } = await supabase
        .from("clinics")
        .select("plan, trial_plan")
        .eq("id", userRecord.clinic_id)
        .single();

      if (!clinicRow) {
        return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
      }

      const entitlements = getEntitlements(clinicRow.plan, clinicRow.trial_plan);
      if (entitlements.reportTier === "none") {
        return NextResponse.json({ error: "Emailing reports is not available on your current plan" }, { status: 403 });
      }

      if (!owned) {
        return NextResponse.json({ error: "Report file does not belong to your clinic" }, { status: 403 });
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        Sentry.captureMessage(`Report email: failed to generate signed URL`, {
          level: "error",
          extra: { filePath, error: signedUrlError?.message },
        });
        return NextResponse.json({ error: "Failed to retrieve report file" }, { status: 500 });
      }

      const response = await fetch(signedUrlData.signedUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        Sentry.captureMessage(`Report email: failed to download PDF from storage`, {
          level: "error",
          extra: { filePath, status: response.status },
        });
        return NextResponse.json({ error: "Failed to retrieve report file" }, { status: 500 });
      }

      const pdfBuffer = await response.arrayBuffer();
      if (pdfBuffer.byteLength > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }

      const base64Content = Buffer.from(pdfBuffer).toString("base64");
      const tier = entitlements.reportTier === "basic" ? "basic" : "audit";
      const emailSubject = buildReportSubject(clinicName, tier);

      const emailHtml = buildReportEmailHtml({
        clinicName,
        reportId,
        subject: emailSubject,
        tier,
      });

      const result = await sendEmailWithAttachment({
        to: userRecord.email,
        subject: emailSubject,
        html: emailHtml,
        attachment: {
          content: base64Content,
          filename: `compliance-report-${clinicName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.pdf`,
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
    } finally {
      // Ephemeral cleanup — but ONLY for a path proven to be the caller's own
      // clinic folder. A non-owned path is never deleted via the admin client
      // (that would be a cross-tenant storage-delete primitive).
      if (owned) {
        await deleteReportFileFromStorage(filePath);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
