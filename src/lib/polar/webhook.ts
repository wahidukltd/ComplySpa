import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionPastDuePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionpastduepayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";

// The union of subscription lifecycle events the webhook dispatches on. Every
// member carries the full Polar `Subscription` object as `data` (verified in
// the SDK v0.48.1 payload types), so `SubscriptionData` is the single typed
// shape the handler and the update RPC projection read from.
//
// NOTE: validateEvent returns the raw JSON body — date fields arrive as ISO
// strings at runtime, not SDK-decoded Date objects. The handler coerces via
// toIso() before writing to the RPC.
export type SubscriptionWebhookEvent =
  | WebhookSubscriptionCreatedPayload
  | WebhookSubscriptionUpdatedPayload
  | WebhookSubscriptionActivePayload
  | WebhookSubscriptionCanceledPayload
  | WebhookSubscriptionUncanceledPayload
  | WebhookSubscriptionRevokedPayload
  | WebhookSubscriptionPastDuePayload;

export type SubscriptionData = SubscriptionWebhookEvent["data"];

export const SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
]);

export function isSubscriptionEventType(type: string): boolean {
  return SUBSCRIPTION_EVENT_TYPES.has(type);
}

const PLAN_MAP: Record<string, string> = {
  solo: "solo",
  practice: "practice",
};

// Pure plan mapper: metadata.plan (copied from checkout metadata onto the
// subscription) wins; product-name matching is the fallback for products
// created without metadata. Kept as a pure function for unit testing.
export function mapPlan(
  productName: string,
  metadata: Record<string, string | number | boolean> | null | undefined,
): string | null {
  if (metadata?.plan) return PLAN_MAP[String(metadata.plan)] ?? null;
  const lower = productName.toLowerCase();
  if (lower.includes("practice")) return "practice";
  if (lower.includes("solo")) return "solo";
  return null;
}
