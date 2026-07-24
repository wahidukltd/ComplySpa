import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

const PLAN_MAP: Record<string, string> = {
  solo: "solo",
  practice: "practice",
  multi_location: "multi_location",
};

function mapPlan(productName: string, metadata: Record<string, string>): string | null {
  if (metadata.plan) return PLAN_MAP[metadata.plan] ?? null;
  const lower = productName.toLowerCase();
  if (lower.includes("multi")) return "multi_location";
  if (lower.includes("practice")) return "practice";
  if (lower.includes("solo")) return "solo";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!POLAR_WEBHOOK_SECRET) {
      Sentry.captureMessage("Polar webhook: POLAR_WEBHOOK_SECRET not configured", { level: "error" });
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.text();
    let event: { type: string; data: Record<string, unknown> };
    try {
      event = validateEvent(body, Object.fromEntries(req.headers.entries()), POLAR_WEBHOOK_SECRET) as { type: string; data: Record<string, unknown> };
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
      throw err;
    }

    if (!event.type.startsWith("subscription.")) {
      return NextResponse.json({ received: true });
    }

    const data = event.data as { id: string; customerId: string; product: { id: string; name: string; metadata: Record<string, string> }; cancelAtPeriodEnd?: boolean };
    const plan = mapPlan(data.product.name, data.product.metadata);

    if (!plan) {
      Sentry.captureMessage("Polar webhook: unknown product", {
        level: "warning",
        extra: { productName: data.product.name, productId: data.product.id },
      });
      return NextResponse.json({ received: true });
    }

    const supabase = createAdminClient();
    const { data: clinic } = await supabase
      .from("clinics")
      .select("id, plan")
      .eq("polar_customer_id", data.customerId)
      .maybeSingle();

    if (!clinic) {
      Sentry.captureMessage("Polar webhook: no clinic found for customer", {
        level: "warning",
        extra: { customerId: data.customerId, subscriptionId: data.id, plan },
      });
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    switch (event.type) {
      case "subscription.active":
      case "subscription.updated": {
        const { error } = await supabase.rpc("update_clinic_subscription", {
          p_clinic_id: clinic.id,
          p_plan: plan,
          p_polar_subscription_id: data.id,
          p_cancel_at_period_end: data.cancelAtPeriodEnd || false,
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
        return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
