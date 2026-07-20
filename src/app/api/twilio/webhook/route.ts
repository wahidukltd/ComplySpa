import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { twilioWebhookSchema } from "@/lib/validations/webhook";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const raw: Record<string, string> = {};
    formData.forEach((value, key) => {
      raw[key] = value.toString();
    });

    const parsed = twilioWebhookSchema.safeParse(raw);

    if (!parsed.success) {
      Sentry.captureMessage("Twilio webhook: invalid payload", {
        level: "warning",
        extra: { errors: parsed.error.flatten(), raw },
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { MessageSid, SmsStatus } = parsed.data;

    if (SmsStatus !== "delivered" && SmsStatus !== "failed" && SmsStatus !== "undelivered") {
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const deliveryStatus = SmsStatus === "delivered" ? "delivered" : "failed";

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("alert_logs")
      .update({ delivery_status: deliveryStatus })
      .eq("twilio_message_id", MessageSid)
      .eq("delivery_status", "pending");

    if (error) {
      Sentry.captureException(error, {
        extra: { message_sid: MessageSid, sms_status: SmsStatus },
      });
    }

    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
      status: 500,
    });
  }
}
