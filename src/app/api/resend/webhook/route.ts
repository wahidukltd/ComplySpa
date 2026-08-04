import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendWebhookSchema } from "@/lib/validations/webhook";
import { resolveWebhookTransition } from "@/lib/notifications/webhook-transitions";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    // Rate limiting moved to Cloudflare WAF (per the 2026-08-04 decision:
    // Svix signature is the real gate; the in-memory Map harmed replay bursts).
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      Sentry.captureMessage("Resend webhook: RESEND_WEBHOOK_SECRET not configured", { level: "error" });
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const payload = await req.text();

    const wh = new Webhook(webhookSecret);
    let verified: Record<string, unknown>;
    try {
      verified = wh.verify(payload, {
        "svix-id": req.headers.get("svix-id") ?? "",
        "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      }) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const parsed = resendWebhookSchema.safeParse(verified);

    if (!parsed.success) {
      Sentry.captureMessage("Resend webhook: invalid payload", {
        level: "warning",
        extra: { errors: parsed.error.flatten() },
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { type, data } = parsed.data;

    const transition = resolveWebhookTransition(type);
    if (!transition) {
      // Transient/engagement events (sent, delivery_delayed, opened, clicked)
      // are no-ops — pending stays correct until a terminal event supersedes it.
      return NextResponse.json({ received: true });
    }

    if (type === "email.complained") {
      Sentry.captureMessage("Resend webhook: spam complaint received", {
        level: "warning",
        extra: { email_id: data.email_id, to: data.to },
      });
    } else if (transition.deliveryStatus === "failed") {
      Sentry.captureMessage(`Resend webhook: delivery failed (${type})`, {
        level: "warning",
        extra: { email_id: data.email_id, to: data.to },
      });
    }

    const supabase = createAdminClient();

    const updates: { delivery_status: string; failure_reason?: string; delivered_at?: string } = {
      delivery_status: transition.deliveryStatus,
    };
    if (transition.failureReason) updates.failure_reason = transition.failureReason;
    if (transition.deliveredAt) {
      // Prefer the provider's event time — the audit column should record the
      // delivery confirmation moment, not the Vercel receive time.
      const eventTime = new Date(data.created_at);
      updates.delivered_at = isNaN(eventTime.getTime())
        ? new Date().toISOString()
        : eventTime.toISOString();
    }

    const { error } = await supabase
      .from("alert_logs")
      .update(updates)
      .eq("resend_webhook_id", data.email_id)
      .eq("delivery_status", "pending");

    if (error) {
      Sentry.captureException(error, {
        extra: { email_id: data.email_id, type, updates },
      });
      return NextResponse.json({ error: "Database update failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
