export type WebhookDeliveryStatus = "delivered" | "failed";

export interface WebhookTransition {
  deliveryStatus: WebhookDeliveryStatus;
  failureReason?: string;
  /** Set delivered_at on the row when the email was confirmed delivered. */
  deliveredAt?: boolean;
}

/** Maps a Resend webhook event type to the alert_logs state transition.
 * Terminal events flip pending rows; transient/engagement events are no-ops
 * (pending stays correct until a terminal event supersedes it). */
export function resolveWebhookTransition(type: string): WebhookTransition | null {
  switch (type) {
    case "email.delivered":
      return { deliveryStatus: "delivered", deliveredAt: true };
    case "email.bounced":
      return { deliveryStatus: "failed", failureReason: "bounced" };
    case "email.complained":
      return { deliveryStatus: "failed", failureReason: "complained" };
    case "email.failed":
      return { deliveryStatus: "failed", failureReason: "rejected" };
    case "email.suppressed":
      return { deliveryStatus: "failed", failureReason: "suppressed" };
    case "email.sent":
    case "email.delivery_delayed":
    case "email.opened":
    case "email.clicked":
      return null;
    default:
      return null;
  }
}
