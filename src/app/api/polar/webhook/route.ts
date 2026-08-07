import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { SDKValidationError } from "@polar-sh/sdk/models/errors/sdkvalidationerror.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPlan, isSubscriptionEventType, type SubscriptionData } from "@/lib/polar/webhook";
import { resolveWebhookTransition } from "@/lib/polar/transitions";
import * as Sentry from "@sentry/nextjs";

// Production-grade webhook handler with:
//   - Event deduplication via processed_webhooks table
//   - Atomic polar_customer_id update inside advisory-locked RPC
//   - Full subscription-state projection (status, billing period, amount,
//     product, interval) so the billing workspace never guesses what Polar
//     believes
//   - Reconciliation cascade after every applied plan change (only when the
//     RPC actually applied — a stale event must never suspend a paid clinic)
//   - Deterministic immediate-end rule (status='canceled' AND NOT
//     cancelAtPeriodEnd → plan ends now, defense-in-depth for a payload shape
//     Polar normally expresses as subscription.revoked)
//   - Resilience to unmodeled event types (plan 2026-08-08 §4.2/B2):
//     validateEvent verifies the signature FIRST, then schema-parses against
//     its typed union (verified in the SDK source + its own webhooks.test.js).
//     Events outside that union — subscription.cycled (fired on every renewal
//     per Polar docs), order.*, checkout.*, customer.*, future types — throw
//     SDKValidationError AFTER a valid signature. Those are no-ops to us
//     (the subscription.updated catch-all carries the full subscription), and
//     must return `received: true` instead of a 500 that Polar retries forever.
//
// ponytail: Blocks on 501 until POLAR_WEBHOOK_SECRET is configured (Polar approval).
// Test input: the signed-event integration suite (tests/integration/webhook-contract)
// drives THIS route with standardwebhooks-signed payloads — same contract, no
// test code in src/ (isolation guards in billing-pipeline-guards.test.ts).

const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

// The deduplication key. The v0.48.1 SDK payload schemas are
// {type, timestamp, data} — zod strips any top-level `id` from the parsed
// event, so event.id is ALWAYS undefined after validateEvent. The canonical
// event id is the signed `webhook-id` delivery header (standardwebhooks
// verifies it as part of the signature; Svix/Polar-style delivery uses it).
// Without this, the dedup pre-check and the processed_webhooks record never
// fire — replays would reprocess every time (found by the webhook-contract
// integration suite, plan 2026-08-08 §4.12).
function eventIdOf(req: NextRequest, event: { id?: string }): string | null {
  return req.headers.get("webhook-id") ?? event.id ?? null;
}

// validateEvent returns the raw JSON body — period timestamps arrive as ISO
// strings, not SDK-decoded Date objects. Coerce either representation to ISO.
function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    if (!POLAR_WEBHOOK_SECRET) {
      // Opaque 501 (review 2026-08-05): an unauthenticated public endpoint
      // must not disclose integration state or configuration hints.
      return NextResponse.json({ error: "Not configured" }, { status: 501 });
    }

    const body = await req.text();
    let event: { id?: string; type: string; data: Record<string, unknown> };
    try {
      event = validateEvent(body, Object.fromEntries(req.headers.entries()), POLAR_WEBHOOK_SECRET) as unknown as {
        id?: string;
        type: string;
        data: Record<string, unknown>;
      };
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
      if (err instanceof SDKValidationError) {
        // Signature already verified (SDK verifies before parsing — the error
        // class only means the payload failed schema validation). Distinguish
        // a malformed subscription event (retry-worthy → 500) from an
        // unmodeled event type we don't act on (subscription.cycled, order.*,
        // checkout.*, customer.*, subscription.reactivated → no-op).
        let rawType: string | null = null;
        try {
          rawType = (JSON.parse(body) as { type?: unknown }).type as string | null ?? null;
        } catch {
          // Not JSON — cannot classify; let Polar retry rather than 200 a
          // body we don't understand.
          return NextResponse.json({ error: "Malformed payload" }, { status: 500 });
        }
        if (rawType && isSubscriptionEventType(rawType)) {
          Sentry.captureMessage("Polar webhook: malformed subscription payload", {
            level: "warning",
            extra: { eventType: rawType },
          });
          return NextResponse.json({ error: "Invalid payload" }, { status: 500 });
        }
        // Signature-valid but unmodeled/ignored event type — acknowledge
        // without processing (never 500: Polar retries forever on 5xx).
        return NextResponse.json({ received: true });
      }
      throw err;
    }

    const supabase = createAdminClient();

    const eventId = eventIdOf(req, event);

    // Deduplicate: check if we've already processed this event
    if (eventId) {
      const { data: existing } = await supabase
        .from("processed_webhooks")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ received: true });
      }
    }

    // Only process subscription lifecycle events
    if (!isSubscriptionEventType(event.type)) {
      return NextResponse.json({ received: true });
    }

    // Every subscription.* payload carries the full Polar Subscription object
    // (verified against the SDK v0.48.1 payload types). Typed reads below
    // replace the loose shape.
    const data = event.data as unknown as SubscriptionData;

    const plan = mapPlan(data.product.name, data.product.metadata);

    if (!plan) {
      // 500 (not 200, review 2026-08-05): an unmap-able product must make
      // Polar retry once the product metadata is fixed — a 200 would silently
      // leave a live paid subscription on the wrong plan forever.
      Sentry.captureMessage("Polar webhook: unknown product", {
        level: "warning",
        extra: { productName: data.product.name, productId: data.product.id },
      });
      return NextResponse.json({ error: "Unknown product" }, { status: 500 });
    }

    // Look up clinic by:
    // 1. clinic_id in subscription metadata (set during checkout)
    // 2. polar_customer_id (for returning customers)
    const clinicIdFromMeta = data.metadata?.clinic_id as string | undefined;
    let clinic: { id: string; plan: string; polar_subscription_id: string | null } | null = null;

    if (clinicIdFromMeta) {
      clinic = (
        await supabase.from("clinics").select("id, plan, polar_subscription_id").eq("id", clinicIdFromMeta).maybeSingle()
      ).data;
    }

    if (!clinic) {
      // Finding 8 (security review 2026-08-08): never fall back to a
      // customer-id lookup with a null customer id — PostgREST `.eq(col,
      // null)` is IS NULL, which would match ANY clinic with no customer
      // linked (wrong tenant). The SDK schema requires customerId, so this is
      // unreachable for schema-valid events; the guard makes it impossible by
      // construction.
      if (!data.customerId) {
        Sentry.captureMessage("Polar webhook: event without customer id", {
          level: "warning",
          extra: { subscriptionId: data.id, plan, clinicIdFromMeta },
        });
        return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
      }
      clinic = (
        await supabase
          .from("clinics")
          .select("id, plan, polar_subscription_id")
          .eq("polar_customer_id", data.customerId)
          .maybeSingle()
      ).data;
    }

    if (!clinic) {
      Sentry.captureMessage("Polar webhook: no clinic found for customer", {
        level: "warning",
        extra: { customerId: data.customerId, subscriptionId: data.id, plan, clinicIdFromMeta },
      });
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const transition = resolveWebhookTransition(event.type, data, clinic.plan, clinic.polar_subscription_id);

    // Shared projection args; each event branch decides the plan + cancel flag.
    const projection = {
      p_clinic_id: clinic.id,
      p_polar_subscription_id: data.id,
      p_polar_customer_id: data.customerId || null,
      p_subscription_status: data.status,
      p_current_period_start: toIso(data.currentPeriodStart),
      p_current_period_end: toIso(data.currentPeriodEnd),
      p_subscription_amount: data.amount,
      p_subscription_product_id: data.productId,
      p_subscription_currency: data.currency || null,
      p_subscription_interval: transition.interval,
    };

    // Finding 2 (code review 2026-08-08): the stale-event prediction is NOT a
    // branch here — the RPC's advisory-locked guards are the single authority.
    // A prediction over the pre-RPC clinic row can race a concurrent state
    // change (e.g. a revoke landing, then a re-subscription's active event);
    // skipping the RPC on prediction could drop a legitimate event and record
    // it as processed. Always call the RPC; it no-ops (returns false) on
    // stale ids and the reconcile below only runs on its true return.
    const { data: applied, error: updateError } = await supabase.rpc("update_clinic_subscription", {
      ...projection,
      p_plan: transition.plan,
      p_cancel_at_period_end: transition.cancelAtPeriodEnd,
    });
    if (updateError) {
      Sentry.captureException(updateError, {
        extra: { clinicId: clinic.id, plan: transition.plan, subscriptionId: data.id, event: event.type },
      });
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // Reconcile resources after every APPLIED plan change — suspends excess
    // staff/credentials, restores previously suspended ones that now fit.
    // `applied` is the RPC's own verdict under its advisory lock: a vetoed
    // update (e.g. concurrent re-subscription changed the stored id between
    // our lookup and the RPC) must never trigger a suspension cascade.
    if (applied === true && transition.reconcilePlan) {
      const { error: reconcileError } = await supabase.rpc("reconcile_clinic_plan", {
        p_clinic_id: clinic.id,
        p_plan: transition.reconcilePlan,
      });
      if (reconcileError) {
        Sentry.captureException(reconcileError, {
          extra: { clinicId: clinic.id, plan: transition.reconcilePlan, event: event.type },
        });
        return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
      }
    }

    // Record event as processed for deduplication (best-effort, non-critical).
    // upsert + ignoreDuplicates (review 2026-08-05): two concurrent deliveries
    // of the same event can both pass the pre-check above; the loser must not
    // error-path a PK conflict — the RPC is idempotent, so ignoring is correct.
    if (eventId) {
      const { error: dedupError } = await supabase
        .from("processed_webhooks")
        .upsert(
          {
            event_id: eventId,
            event_type: event.type,
            clinic_id: clinic.id,
          },
          { onConflict: "event_id", ignoreDuplicates: true },
        );
      if (dedupError) {
        Sentry.captureException(dedupError, {
          extra: { eventId, eventType: event.type, clinicId: clinic.id },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
