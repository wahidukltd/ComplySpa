import "server-only";

import * as Sentry from "@sentry/nextjs";

interface SendSmsParams {
  to: string;
  body: string;
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    const msg = "Twilio credentials not configured";
    Sentry.captureMessage(msg, { level: "error" });
    return { success: false, error: msg };
  }

  try {
    const formData = new URLSearchParams({
      To: params.to,
      From: fromPhone,
      Body: params.body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMsg =
        data.message || `Twilio API error: HTTP ${response.status}`;
      Sentry.captureMessage(errorMsg, {
        level: "error",
        extra: { twilio_sid: data.sid, twilio_code: data.code },
      });
      return { success: false, error: errorMsg };
    }

    return { success: true, messageId: data.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err instanceof Error ? err : new Error(msg));
    return { success: false, error: msg };
  }
}
