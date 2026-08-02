export type NotificationKind = "expiration" | "escalation";

export interface NotificationTypeInfo {
  kind: NotificationKind;
  label: string;
}

/** Maps an alert_logs row to a human notification type. Future notification
 * types extend this mapper — no architectural change. */
export function deriveNotificationType(daysBefore: number): NotificationTypeInfo {
  if (daysBefore < 0) {
    return { kind: "escalation", label: `Escalation — expired ${Math.abs(daysBefore)}d ago` };
  }
  return { kind: "expiration", label: `Expiration reminder — ${daysBefore}d before` };
}

const FAILURE_REASON_LABELS: Record<string, string> = {
  send_failed: "Failed at send",
  bounced: "Bounced by the recipient's server",
  complained: "Marked as spam",
  rejected: "Rejected after delivery attempt",
  suppressed: "Recipient is suppressed (do-not-send list)",
  no_delivery_confirmation: "No delivery confirmation received",
};

/** Human label for a failed delivery. Stored reasons map directly; legacy
 * rows without a reason fall back to the closest signal (a Resend webhook id
 * means the send was accepted and a provider event later marked it failed). */
export function deriveFailureDetail(
  deliveryStatus: string,
  failureReason: string | null,
  hasWebhookId: boolean,
): string | null {
  if (deliveryStatus !== "failed") return null;
  if (failureReason) return FAILURE_REASON_LABELS[failureReason] ?? failureReason;
  return hasWebhookId
    ? "Bounced or complained after delivery attempt"
    : "Failed at send";
}

/** Single source for the in-flight label shown on pending rows (the list
 * component renders this, not a local copy). */
export const PENDING_DETAIL_LABEL = "Awaiting delivery confirmation";

export interface CronHealthResult {
  jobname: string;
  ok: boolean;
}

export interface SystemIssue {
  kind: "cron" | "delivery";
  label: string;
}

/** A burst of failed deliveries in 24h suggests a provider-side problem;
 * bounces (individual bad addresses) rarely reach this for a small clinic. */
export const DELIVERY_FAILURE_THRESHOLD = 5;

/** Same jobs + staleness windows as /api/health (route.ts) — the
 * authoritative "reminder processing stopped" signal. */
export const CRON_JOBS = [
  { jobname: "daily-credential-status-update", maxStaleHours: 26 },
  { jobname: "daily-credential-scan", maxStaleHours: 26 },
  { jobname: "daily-escalation-scan", maxStaleHours: 25 },
  { jobname: "daily-trial-expiry-check", maxStaleHours: 26 },
  { jobname: "daily-inactive-cleanup", maxStaleHours: 26 },
  { jobname: "daily-stale-pending-check", maxStaleHours: 26 },
] as const;

export function computeSystemHealth(
  cronHealth: CronHealthResult[],
  failedIn24h: number,
  threshold: number = DELIVERY_FAILURE_THRESHOLD,
): SystemIssue[] {
  const issues: SystemIssue[] = [];
  for (const c of cronHealth) {
    if (!c.ok) {
      issues.push({
        kind: "cron",
        label: `Reminder processing hasn't run on schedule (${c.jobname})`,
      });
    }
  }
  if (failedIn24h >= threshold) {
    issues.push({
      kind: "delivery",
      label: "Email delivery appears to be failing at scale — some reminders may not have arrived.",
    });
  }
  return issues;
}
