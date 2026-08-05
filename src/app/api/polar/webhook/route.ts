import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPlan, isSubscriptionEventType, type SubscriptionData } from "@/lib/polar/webhook";
import * as Sentry from "@sentry/nextjs";

// Production-grade webhook handler with:
//   - Event deduplication via processed_webhooks table
//   - Atomic polar_customer_id update inside advisory-locked RPC
//   - Full subscription-state projection (status, billing period, amount,
//     product) so the billing workspace never guesses what Polar believes
//   - Reconciliation cascade after every plan change
//   - Deterministic immediate-end rule (status='canceled' AND NOT
//     cancelAtPeriodEnd → plan ends now, defense-in-depth for a payload shape
//     Polar normally expresses as subscription.revoked)
//
// ponytail: Blocks on 501 until POLAR_WEBHOOK_SECRET is configured (Polar approval).
// Approval checklist (docs/plans/2026-08-05-billing-subscription-workspace.md §8):
//   1. Create Polar products with metadata {plan: solo|practice}
//   2. Set POLAR_WEBHOOK_SECRET, POLAR_ACCESS_TOKEN, and product price IDs
//   3. Send test webhook events from Polar dashboard for each lifecycle event
//   4. Verify update_clinic_subscription() RPC fires correctly
//   5. Test checkout + customer portal links end-to-end
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

// Events that change the clinic's plan (trigger reconcile_clinic_plan).
const PLAN_CHANGE_EVENTS = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.revoked",
  "subscription.uncanceled",
]);

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
      throw err;
    }

    const supabase = createAdminClient();

    // Deduplicate: check if we've already processed this event
    if (event.id) {
      const { data: existing } = await supabase
        .from("processed_webhooks")
        .select("event_id")
        .eq("event_id", event.id)
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
    // (verified against the SDK v0.48.1 payload types — the previous hand-rolled
    // cast read a subset of it). Typed reads below replace the loose shape.
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
    let clinic: { id: string; plan: string } | null = null;

    if (clinicIdFromMeta) {
      clinic = (await supabase.from("clinics").select("id, plan").eq("id", clinicIdFromMeta).maybeSingle()).data;
    }

    if (!clinic) {
      clinic = (await supabase.from("clinics").select("id, plan").eq("polar_customer_id", data.customerId).maybeSingle()).data;
    }

    if (!clinic) {
      Sentry.captureMessage("Polar webhook: no clinic found for customer", {
        level: "warning",
        extra: { customerId: data.customerId, subscriptionId: data.id, plan, clinicIdFromMeta },
      });
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    // Immediate-end rule (challenge 2026-08-05, review scope fix 2026-08-05):
    // ANY payload carrying status='canceled' with the cancel flag unset means
    // the subscription ended NOW, not at period end — regardless of event
    // type (Polar normally emits subscription.revoked, but a late
    // subscription.updated or canceled carrying the same state must be
    // handled identically, or the clinic stays paid with a dead subscription).
    const immediateEnd = data.status === "canceled" && !data.cancelAtPeriodEnd;
    const planChanged = PLAN_CHANGE_EVENTS.has(event.type) || immediateEnd;

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
    };

    const applyUpdate = async (p_plan: string, p_cancel_at_period_end: boolean) => {
      const { error } = await supabase.rpc("update_clinic_subscription", {
        ...projection,
        p_plan,
        p_cancel_at_period_end,
      });
      if (error) {
        Sentry.captureException(error, {
          extra: { clinicId: clinic.id, plan: p_plan, subscriptionId: data.id, event: event.type },
        });
        return false;
      }
      return true;
    };

    let ok: boolean;
    switch (event.type) {
      case "subscription.active":
      case "subscription.updated":
        ok = immediateEnd
          ? await applyUpdate("expired_trial", false)
          : await applyUpdate(plan, data.cancelAtPeriodEnd);
        break;

      case "subscription.created":
      case "subscription.past_due": {
        // Projection only — no plan change, no cancel-flag change.
        ok = await applyUpdate(clinic.plan, data.cancelAtPeriodEnd);
        break;
      }

      case "subscription.canceled":
        ok = immediateEnd
          ? await applyUpdate("expired_trial", false)
          : await applyUpdate(clinic.plan, true);
        break;

      case "subscription.revoked":
        ok = await applyUpdate("expired_trial", false);
        break;

      case "subscription.uncanceled":
        ok = await applyUpdate(plan, false);
        break;

      default:
        ok = true;
    }

    if (!ok) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // Reconcile resources after every plan change — suspends excess staff/credentials,
    // restores previously suspended ones that now fit within the new plan's limits.
    if (planChanged) {
      const reconcilePlan = immediateEnd || event.type === "subscription.revoked" ? "expired_trial" : plan;
      const { error: reconcileError } = await supabase.rpc("reconcile_clinic_plan", {
        p_clinic_id: clinic.id,
        p_plan: reconcilePlan,
      });
      if (reconcileError) {
        Sentry.captureException(reconcileError, {
          extra: { clinicId: clinic.id, plan: reconcilePlan, event: event.type },
        });
        return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
      }
    }

    // Record event as processed for deduplication (best-effort, non-critical).
    // upsert + ignoreDuplicates (review 2026-08-05): two concurrent deliveries
    // of the same event can both pass the pre-check above; the loser must not
    // error-path a PK conflict — the RPC is idempotent, so ignoring is correct.
    if (event.id) {
      const { error: dedupError } = await supabase
        .from("processed_webhooks")
        .upsert(
          {
            event_id: event.id,
            event_type: event.type,
            clinic_id: clinic.id,
          },
          { onConflict: "event_id", ignoreDuplicates: true },
        );
      if (dedupError) {
        Sentry.captureException(dedupError, {
          extra: { eventId: event.id, eventType: event.type, clinicId: clinic.id },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
