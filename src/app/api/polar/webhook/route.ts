import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

// Production-grade webhook handler with:
//   - Event deduplication via processed_webhooks table
//   - Atomic polar_customer_id update inside advisory-locked RPC
//   - Reconciliation cascade after every plan change
//   - Full Sentry error tracking
//
// ponytail: Blocks on 501 until POLAR_WEBHOOK_SECRET is configured (Polar approval).
// Test checklist when Polar approval comes:
//   1. Create Polar products with metadata {plan: solo|practice}
//   2. Set POLAR_WEBHOOK_SECRET, POLAR_ACCESS_TOKEN, and product price IDs
//   3. Send test webhook events from Polar dashboard for each lifecycle event
//   4. Verify update_clinic_subscription() RPC fires correctly
//   5. Test checkout + customer portal links end-to-end
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
// ponytail: event_id extracted from the validated payload — Polar uses
// the top-level "id" field on event objects for webhook idempotency

const PLAN_MAP: Record<string, string> = {
  solo: "solo",
  practice: "practice",
};

function mapPlan(productName: string, metadata: Record<string, string>): string | null {
  if (metadata.plan) return PLAN_MAP[metadata.plan] ?? null;
  const lower = productName.toLowerCase();
  if (lower.includes("practice")) return "practice";
  if (lower.includes("solo")) return "solo";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!POLAR_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Polar billing integration not configured. Set POLAR_WEBHOOK_SECRET to enable." },
        { status: 501 },
      );
    }

    const body = await req.text();
    let event: { id?: string; type: string; data: Record<string, unknown> };
    try {
      event = validateEvent(body, Object.fromEntries(req.headers.entries()), POLAR_WEBHOOK_SECRET) as unknown as { id?: string; type: string; data: Record<string, unknown> };
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
    if (!event.type.startsWith("subscription.")) {
      return NextResponse.json({ received: true });
    }

    const data = event.data as {
      id: string;
      customerId: string;
      product: { id: string; name: string; metadata: Record<string, string> };
      metadata?: Record<string, string>;
      cancelAtPeriodEnd?: boolean;
    };

    const plan = mapPlan(data.product.name, data.product.metadata);

    if (!plan) {
      Sentry.captureMessage("Polar webhook: unknown product", {
        level: "warning",
        extra: { productName: data.product.name, productId: data.product.id },
      });
      return NextResponse.json({ received: true });
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

    const planChanged = ["subscription.active", "subscription.updated", "subscription.revoked", "subscription.uncanceled"].includes(event.type);

    switch (event.type) {
      case "subscription.active":
      case "subscription.updated": {
        const { error } = await supabase.rpc("update_clinic_subscription", {
          p_clinic_id: clinic.id,
          p_plan: plan,
          p_polar_subscription_id: data.id,
          p_cancel_at_period_end: data.cancelAtPeriodEnd || false,
          p_polar_customer_id: data.customerId || null,
        });
        if (error) {
          Sentry.captureException(error, {
            extra: { clinicId: clinic.id, plan, subscriptionId: data.id, event: event.type },
          });
          return NextResponse.json({ error: "Update failed" }, { status: 500 });
        }
        break;
      }

      case "subscription.canceled": {
        const { error } = await supabase.rpc("update_clinic_subscription", {
          p_clinic_id: clinic.id,
          p_plan: clinic.plan,
          p_polar_subscription_id: data.id,
          p_cancel_at_period_end: true,
        });
        if (error) {
          Sentry.captureException(error, {
            extra: { clinicId: clinic.id, subscriptionId: data.id },
          });
          return NextResponse.json({ error: "Update failed" }, { status: 500 });
        }
        break;
      }

      case "subscription.revoked": {
        const { error } = await supabase.rpc("update_clinic_subscription", {
          p_clinic_id: clinic.id,
          p_plan: "expired_trial",
          p_polar_subscription_id: data.id,
          p_cancel_at_period_end: false,
        });
        if (error) {
          Sentry.captureException(error, {
            extra: { clinicId: clinic.id, subscriptionId: data.id },
          });
          return NextResponse.json({ error: "Update failed" }, { status: 500 });
        }
        break;
      }

      case "subscription.uncanceled": {
        const { error } = await supabase.rpc("update_clinic_subscription", {
          p_clinic_id: clinic.id,
          p_plan: plan,
          p_polar_subscription_id: data.id,
          p_cancel_at_period_end: false,
        });
        if (error) {
          Sentry.captureException(error, {
            extra: { clinicId: clinic.id, subscriptionId: data.id },
          });
          return NextResponse.json({ error: "Update failed" }, { status: 500 });
        }
        break;
      }

      case "subscription.created":
      case "subscription.past_due":
        break;
    }

    // Reconcile resources after every plan change — suspends excess staff/credentials,
    // restores previously suspended ones that now fit within the new plan's limits.
    if (planChanged) {
      const reconcilePlan = event.type === "subscription.revoked" ? "expired_trial" : plan;
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

    // Record event as processed for deduplication (best-effort, non-critical)
    if (event.id) {
      const { error: dedupError } = await supabase.from("processed_webhooks").insert({
        event_id: event.id,
        event_type: event.type,
        clinic_id: clinic.id,
      });
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
