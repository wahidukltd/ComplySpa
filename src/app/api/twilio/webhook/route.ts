import { NextRequest } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { twilioWebhookSchema } from "@/lib/validations/webhook";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      Sentry.captureMessage("Twilio webhook: TWILIO_AUTH_TOKEN not configured", { level: "error" });
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
        status: 500,
      });
    }

    const formData = await req.formData();
    const raw: Record<string, string> = {};
    formData.forEach((value, key) => { raw[key] = value.toString(); });

    const url = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/twilio/webhook`;
    const twilioSignature = req.headers.get("x-twilio-signature") || "";
    const isValid = twilio.validateRequest(authToken, twilioSignature, url, raw);

    if (!isValid) {
      Sentry.captureMessage("Twilio webhook: invalid signature", { level: "warning" });
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
        status: 401,
      });
    }

    const parsed = twilioWebhookSchema.safeParse(raw);

    if (!parsed.success) {
      Sentry.captureMessage("Twilio webhook: invalid payload", {
        level: "warning",
        extra: { errors: parsed.error.flatten() },
      });
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
        status: 400,
      });
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
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
        status: 500,
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
