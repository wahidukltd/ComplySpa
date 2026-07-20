import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendWebhookSchema } from "@/lib/validations/webhook";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
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

    if (type !== "email.delivered" && type !== "email.bounced") {
      return NextResponse.json({ received: true });
    }

    const deliveryStatus = type === "email.delivered" ? "delivered" : "failed";

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("alert_logs")
      .update({ delivery_status: deliveryStatus })
      .eq("resend_webhook_id", data.email_id)
      .eq("delivery_status", "pending");

    if (error) {
      Sentry.captureException(error, {
        extra: { email_id: data.email_id, delivery_status: deliveryStatus },
      });
      return NextResponse.json({ error: "Database update failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
