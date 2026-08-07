import { mapPlan, type SubscriptionData } from "./webhook";

// Pure webhook transition resolver (plan 2026-08-08 §4.1/B1 + §4.2/B2 + §4.7/B7):
// the webhook's event → projection decision, kept pure and unit-testable
// without Polar. The route is a thin shell around this; the RPC's advisory-
// locked guards remain authoritative for whether a write actually lands.

export type SubscriptionInterval = "monthly" | "annual";

// (The PLAN_CHANGE_EVENTS set was removed with isPlanChangeEvent — dead in
// production since the route branches on transition.reconcilePlan; review
// finding 15.)

export interface WebhookTransition {
  /** Target plan to project (drives entitlements + reconcile limits). */
  plan: string;
  /** Billing interval to project (null = leave the stored interval unchanged). */
  interval: SubscriptionInterval | null;
  /** cancel_at_period_end to project. */
  cancelAtPeriodEnd: boolean;
  /** Plan to reconcile staff/credentials against; null = no reconcile. */
  reconcilePlan: string | null;
  /**
   * Stale-event prediction (B1 + finding 1): mirrors the RPC's guards for the
   * unit-testable matrix. The ROUTE does not branch on this — it always calls
   * update_clinic_subscription and trusts the RPC's advisory-locked boolean
   * (review finding 2: a prediction over the pre-RPC clinic row can race a
   * concurrent state change, so the RPC is the single authority). Rules:
   *   - no stored subscription id → apply (first subscription)
   *   - paid/trialing clinic + matching id → apply
   *   - paid/trialing clinic + mismatched id → stale (053 G3)
   *   - revive path (expired_trial/inactive) + NEW id → apply (re-subscription)
   *   - revive path + SAME id → stale (finding 1: the stored id on a revoked
   *     clinic is dead; Polar mints a new id per subscription)
   */
  applied: boolean;
}

// Events that may change the clinic's plan (trigger reconcile when applied).
// `subscription.canceled` (scheduled) and `subscription.created`/`past_due`
// (projection-only) are NOT plan changes — matching the pre-053 route.
// (The exported isPlanChangeEvent classifier was removed — dead in production
// since the route branches on transition.reconcilePlan; review finding 15.)

function mapInterval(value: SubscriptionData["recurringInterval"] | null | undefined): SubscriptionInterval | null {
  if (value === "month") return "monthly";
  if (value === "year") return "annual";
  return null;
}

// Immediate-end rule (challenge 2026-08-05): ANY payload carrying
// status='canceled' with the cancel flag unset means the subscription ended
// NOW — regardless of event type (Polar normally emits subscription.revoked,
// but a late updated/canceled carrying the same state must be treated
// identically, or the clinic stays paid with a dead subscription).
export function isImmediateEnd(data: Pick<SubscriptionData, "status" | "cancelAtPeriodEnd">): boolean {
  return data.status === "canceled" && !data.cancelAtPeriodEnd;
}

export function resolveWebhookTransition(
  eventType: string,
  data: SubscriptionData,
  clinicPlan: string,
  storedSubscriptionId: string | null,
): WebhookTransition {
  const productPlan = mapPlan(data.product.name, data.product.metadata);
  const immediateEnd = isImmediateEnd(data);
  const interval = mapInterval(data.recurringInterval);
  const revivePath = clinicPlan === "expired_trial" || clinicPlan === "inactive";

  // Mirror of the RPC guards (053 G3 + 054 finding-1 revive rule). The route
  // does NOT branch on this — it always calls the RPC and trusts its boolean
  // (finding 2). This prediction exists for the unit-testable matrix.
  const applied =
    storedSubscriptionId === null
      ? true
      : storedSubscriptionId === data.id
        ? !revivePath
        : revivePath;

  switch (eventType) {
    case "subscription.active":
    case "subscription.updated":
      if (immediateEnd) {
        return { plan: "expired_trial", interval, cancelAtPeriodEnd: false, reconcilePlan: "expired_trial", applied };
      }
      return {
        plan: productPlan ?? clinicPlan,
        interval,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        reconcilePlan: productPlan ?? clinicPlan,
        applied,
      };

    case "subscription.created":
    case "subscription.past_due":
      // Projection only — no plan change, no reconcile. The cancel flag is
      // projected from the payload (COALESCE semantics in the RPC).
      return { plan: clinicPlan, interval, cancelAtPeriodEnd: data.cancelAtPeriodEnd, reconcilePlan: null, applied };

    case "subscription.canceled":
      if (immediateEnd) {
        return { plan: "expired_trial", interval, cancelAtPeriodEnd: false, reconcilePlan: "expired_trial", applied };
      }
      // Scheduled cancel at period end: plan unchanged, cancel flag set.
      return { plan: clinicPlan, interval, cancelAtPeriodEnd: true, reconcilePlan: null, applied };

    case "subscription.revoked":
      return { plan: "expired_trial", interval, cancelAtPeriodEnd: false, reconcilePlan: "expired_trial", applied };

    case "subscription.uncanceled":
      return {
        plan: productPlan ?? clinicPlan,
        interval,
        cancelAtPeriodEnd: false,
        reconcilePlan: productPlan ?? clinicPlan,
        applied,
      };

    default:
      // Unreachable for lifecycle types (the route filters before dispatch);
      // defensive no-op so a future event type can never project by accident.
      return { plan: clinicPlan, interval, cancelAtPeriodEnd: data.cancelAtPeriodEnd, reconcilePlan: null, applied: false };
  }
}
