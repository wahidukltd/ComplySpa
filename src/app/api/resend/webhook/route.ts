import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendWebhookSchema } from "@/lib/validations/webhook";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      Sentry.captureMessage("Resend webhook: missing Svix headers", {
        level: "warning",
      });
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }

    const ts = parseInt(svixTimestamp, 10);
    if (isNaN(ts) || Date.now() - ts * 1000 > 5 * 60 * 1000) {
      Sentry.captureMessage("Resend webhook: stale timestamp", { level: "warning" });
      return NextResponse.json({ error: "Stale timestamp" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = resendWebhookSchema.safeParse(body);

    if (!parsed.success) {
      Sentry.captureMessage("Resend webhook: invalid payload", {
        level: "warning",
        extra: { errors: parsed.error.flatten(), body },
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
