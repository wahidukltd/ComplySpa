import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.NEXT_PUBLIC_APP_URL
  ? `alerts@${new URL(process.env.NEXT_PUBLIC_APP_URL).hostname}`
  : "Compliance Alerts <alerts@resend.dev>";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      });

      if (error) {
        lastError = new Error(error.message);

        if (
          error.message.includes("invalid") ||
          error.message.includes("blocked")
        ) {
          Sentry.captureMessage(`Resend permanent failure: ${error.message}`, {
            level: "error",
            extra: { recipient: params.to },
          });
          return { success: false, error: error.message };
        }

        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
        }
        continue;
      }

      if (data?.id) {
        return { success: true, messageId: data.id };
      }

      return { success: false, error: "No message ID returned" };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  Sentry.captureException(lastError, {
    extra: { recipient: params.to, subject: params.subject },
  });

  return {
    success: false,
    error: lastError?.message ?? "Unknown error after retries",
  };
}

interface SendEmailWithAttachmentParams {
  to: string;
  subject: string;
  html: string;
  attachment: {
    content: string;
    filename: string;
  };
}

export async function sendEmailWithAttachment(
  params: SendEmailWithAttachmentParams,
): Promise<SendEmailResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        attachments: [
          {
            content: params.attachment.content,
            filename: params.attachment.filename,
            contentType: "application/pdf",
          },
        ],
      });

      if (error) {
        lastError = new Error(error.message);

        if (
          error.message.includes("invalid") ||
          error.message.includes("blocked")
        ) {
          Sentry.captureMessage(`Resend attachment permanent: ${error.message}`, {
            level: "error",
            extra: { recipient: params.to, filename: params.attachment.filename },
          });
          return { success: false, error: error.message };
        }

        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
        }
        continue;
      }

      if (data?.id) {
        return { success: true, messageId: data.id };
      }

      return { success: false, error: "No message ID returned" };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  Sentry.captureException(lastError, {
    extra: { recipient: params.to, filename: params.attachment.filename },
  });

  return {
    success: false,
    error: lastError?.message ?? "Unknown error after retries",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
