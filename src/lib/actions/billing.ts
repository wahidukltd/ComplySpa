"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndUser } from "@/lib/utils/clinic";
import { getEntitlements } from "@/lib/utils/entitlements";
import { polarConfig } from "@/lib/polar/config";
import { createPolarAdmin } from "@/lib/polar/client";
import { createCheckoutLink, resolveProductIdFromPrice, type PlanId } from "@/lib/polar/checkout";
import { createCustomerPortalUrl } from "@/lib/polar/customer-portal";
import {
  bannerCopy,
  daysUntil,
  deriveBannerState,
  nextChargeLine,
  PLAN_MONTHLY_PRICE,
  PLAN_NAME,
  PLAN_LOOKUP,
  polarStatusLabel,
  shouldBlockNewCheckout,
  type BannerState,
} from "@/lib/billing/copy";
import * as Sentry from "@sentry/nextjs";

// The billing workspace server actions. The DB is read-only from the app:
// every mutation drives Polar, and the webhook converges the clinics row
// (single-writer principle — enforced by billing-pipeline-guards.test.ts).
// { data, error } sentinel returns throughout (repo convention).

function captureBillingError(error: unknown, flow: string, extra?: Record<string, unknown>): void {
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { feature: "billing", flow },
    extra,
  });
}

async function getBillingContext() {
  const ctx = await getClinicIdAndUser();
  if (!ctx?.internalUserId) return null;
  const supabase = await createClient();
  const { data: userRow } = await supabase
    .from("users")
    .select("role, clinic_id")
    .eq("id", ctx.internalUserId)
    .maybeSingle();
  if (!userRow) return null;
  return { supabase, clinicId: ctx.clinicId, userId: ctx.userId, role: userRow.role };
}

// ─── Overview ───────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  status: "paid" | "pending" | "refunded" | "voided";
}

export interface BillingOverviewData {
  polarEnabled: boolean;
  livePolar: boolean;
  degraded: boolean;
  clinicName: string;
  plan: string;
  trialPlan: string | null;
  planName: string;
  isTrial: boolean;
  isPaid: boolean;
  entitlements: {
    maxStaff: number;
    maxCredentials: number;
    maxUsers: number;
    reportTier: "none" | "basic" | "audit";
  };
  usage: { staff: number; credentials: number; users: number };
  billingContact: string | null;
  planOptions: Array<{
    plan: "solo" | "practice";
    maxStaff: number;
    maxCredentials: number;
    maxUsers: number;
    reportLabel: string;
  }>;
  banner: { state: BannerState; title: string; detail: string };
  planCard: {
    priceLine: string;
    periodEnd: string | null;
    trialEndDate: string | null;
    cancelAtPeriodEnd: boolean;
    polarStatusLabel: string | null;
    amountCents: number | null;
  };
  payment: { hasMethod: boolean; brand: string | null; last4: string | null };
  invoices: InvoiceRow[];
  canMutate: boolean;
  degradedReason: string | null;
}

export async function getBillingOverview(): Promise<{ data: BillingOverviewData | null; error: string | null }> {
  const ctx = await getBillingContext();
  if (!ctx) return { data: null, error: "Unauthorized" };
  const { supabase, clinicId } = ctx;

  const { data: clinic } = await supabase
    .from("clinics")
    .select(
      "name, plan, trial_plan, trial_end_date, cancel_at_period_end, polar_customer_id, polar_subscription_id, polar_subscription_status, current_period_start, current_period_end, subscription_amount, subscription_currency, subscription_product_id",
    )
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) return { data: null, error: "Clinic not found" };

  const [staffRes, credsRes, usersRes, ownerRes] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null),
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null),
    supabase
      .from("users")
      .select("email")
      .eq("clinic_id", clinicId)
      .eq("role", "owner")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  const entitlements = getEntitlements(clinic.plan, clinic.trial_plan);
  const isTrial = clinic.plan === "trial";
  const isPaid = clinic.plan === "solo" || clinic.plan === "practice";
  const trialPlanId: PlanId | null =
    clinic.trial_plan === "solo" || clinic.trial_plan === "practice" ? clinic.trial_plan : null;
  const priceDollars = trialPlanId ? PLAN_MONTHLY_PRICE[trialPlanId] : isPaid ? PLAN_MONTHLY_PRICE[clinic.plan as PlanId] ?? 0 : 0;

  let livePolar = false;
  let degraded = false;
  let degradedReason: string | null = null;
  let liveAmountCents: number | null = clinic.subscription_amount;
  let livePeriodEnd: string | null = clinic.current_period_end;
  let liveStatus: string | null = clinic.polar_subscription_status;
  let payment: { hasMethod: boolean; brand: string | null; last4: string | null } = {
    hasMethod: false,
    brand: null,
    last4: null,
  };
  let invoices: InvoiceRow[] = [];

  const polar = polarConfig.enabled ? createPolarAdmin() : null;

  if (polar && clinic.polar_customer_id) {
    livePolar = true;
    if (clinic.polar_subscription_id) {
      try {
        const sub = await polar.subscriptions.get({ id: clinic.polar_subscription_id });
        liveAmountCents = sub.amount;
        livePeriodEnd = sub.currentPeriodEnd.toISOString();
        liveStatus = sub.status;
      } catch (err) {
        degraded = true;
        degradedReason = "subscription";
        captureBillingError(err, "billing.overview.subscription", { clinicId });
      }
    }
    try {
      const ordersRes = await polar.orders.list({
        customerId: clinic.polar_customer_id,
        limit: 10,
        sorting: ["-created_at"],
      });
      invoices = ordersRes.result.items.map((order) => ({
        id: order.id,
        date: order.createdAt.toISOString(),
        description: order.items?.[0]?.label ?? "Subscription charge",
        amountCents: order.totalAmount,
        currency: order.currency,
        status: mapOrderStatus(order.status),
      }));
    } catch (err) {
      degraded = true;
      degradedReason = degradedReason ?? "orders";
      captureBillingError(err, "billing.overview.orders", { clinicId });
    }
    try {
      const methodsRes = await polar.customers.listPaymentMethods({ id: clinic.polar_customer_id, limit: 1 });
      const card = methodsRes.result.items?.find((m) => m.type === "card");
      if (card && "methodMetadata" in card) {
        payment = { hasMethod: true, brand: card.methodMetadata.brand, last4: card.methodMetadata.last4 };
      }
    } catch (err) {
      degraded = true;
      degradedReason = degradedReason ?? "payment-method";
      captureBillingError(err, "billing.overview.payment-method", { clinicId });
    }
  }

  const daysLeft = daysUntil(isTrial ? clinic.trial_end_date : livePeriodEnd);
  const amountCents = liveAmountCents;
  const priceCents = amountCents ?? null;
  const bannerState = deriveBannerState({
    polarEnabled: polarConfig.enabled,
    plan: clinic.plan,
    trialPlan: clinic.trial_plan,
    polarStatus: liveStatus,
    cancelAtPeriodEnd: clinic.cancel_at_period_end,
    trialEndDate: clinic.trial_end_date,
    periodEnd: livePeriodEnd,
    pendingSync: false,
    degraded,
    daysLeft,
    price: priceCents != null ? priceCents / 100 : priceDollars,
  });
  const banner = bannerCopy(bannerState, {
    polarEnabled: polarConfig.enabled,
    plan: clinic.plan,
    trialPlan: clinic.trial_plan,
    polarStatus: liveStatus,
    cancelAtPeriodEnd: clinic.cancel_at_period_end,
    trialEndDate: clinic.trial_end_date,
    periodEnd: livePeriodEnd,
    pendingSync: false,
    degraded,
    daysLeft,
    price: priceCents != null ? priceCents / 100 : priceDollars,
  });

  const priceLine = nextChargeLine({
    plan: clinic.plan,
    priceCents,
    priceDollars,
    periodEnd: livePeriodEnd,
    isTrial,
    trialPlan: clinic.trial_plan,
    trialEndDate: clinic.trial_end_date,
    currency: clinic.subscription_currency,
  });

  const data: BillingOverviewData = {
    polarEnabled: polarConfig.enabled,
    livePolar,
    degraded,
    clinicName: clinic.name,
    plan: clinic.plan,
    trialPlan: clinic.trial_plan,
    planName: isTrial && trialPlanId ? `Trial of ${PLAN_NAME[trialPlanId]}` : (PLAN_LOOKUP[clinic.plan] ?? clinic.plan),
    isTrial,
    isPaid,
    entitlements: {
      maxStaff: entitlements.maxStaff,
      maxCredentials: entitlements.maxCredentials,
      maxUsers: entitlements.maxUsers,
      reportTier: entitlements.reportTier,
    },
    usage: {
      staff: staffRes.count ?? 0,
      credentials: credsRes.count ?? 0,
      users: usersRes.count ?? 0,
    },
    // Per-target-plan limits for the change-plan dialog (each option shows
    // what THAT plan offers, not the current plan's — derived from the single
    // entitlement resolver, never hardcoded in the UI).
    planOptions: (["solo", "practice"] as const).map((p) => {
      const e = getEntitlements(p, p);
      return {
        plan: p,
        maxStaff: e.maxStaff,
        maxCredentials: e.maxCredentials,
        maxUsers: e.maxUsers,
        reportLabel: e.reportTier === "audit" ? "Audit-ready report" : "Basic report",
      };
    }),
    billingContact: ownerRes.data?.email ?? null,
    banner: { state: bannerState, title: banner.title, detail: banner.detail },
    planCard: {
      priceLine,
      periodEnd: livePeriodEnd,
      trialEndDate: clinic.trial_end_date,
      cancelAtPeriodEnd: clinic.cancel_at_period_end,
      polarStatusLabel: polarStatusLabel(liveStatus),
      amountCents,
    },
    payment,
    invoices,
    canMutate: ctx.role === "owner",
    degradedReason: degraded ? degradedReason : null,
  };

  return { data, error: null };
}

function mapOrderStatus(status: string): InvoiceRow["status"] {
  switch (status) {
    case "paid":
      return "paid";
    case "pending":
    case "draft":
      return "pending";
    case "refunded":
    case "partially_refunded":
      return "refunded";
    case "void":
      return "voided";
    default:
      return "pending";
  }
}

// ─── Poll state (lightweight, DB-only) ──────────────────────────────────────

// Review 2026-08-05: the pending-sync poller previously called the full
// getBillingOverview (up to 3 live Polar calls) every 3s for up to 60s — ~60
// Polar admin calls per mutation. The convergence predicates only need DB
// values, so the poller uses this DB-only snapshot; the full overview is
// reserved for page loads.
export interface BillingPollState {
  plan: string;
  cancelAtPeriodEnd: boolean;
  polarSubscriptionStatus: string | null;
  isPaid: boolean;
}

export async function getBillingPollState(): Promise<{ data: BillingPollState | null; error: string | null }> {
  const ctx = await getBillingContext();
  if (!ctx) return { data: null, error: "Unauthorized" };

  const { data: clinic } = await ctx.supabase
    .from("clinics")
    .select("plan, cancel_at_period_end, polar_subscription_status")
    .eq("id", ctx.clinicId)
    .maybeSingle();
  if (!clinic) return { data: null, error: "Clinic not found" };

  return {
    data: {
      plan: clinic.plan,
      cancelAtPeriodEnd: clinic.cancel_at_period_end,
      polarSubscriptionStatus: clinic.polar_subscription_status,
      isPaid: clinic.plan === "solo" || clinic.plan === "practice",
    },
    error: null,
  };
}

// ─── Checkout & portal ──────────────────────────────────────────────────────

const planIdSchema = z.enum(["solo", "practice"]);

export async function getCheckoutUrl(plan: PlanId): Promise<{ url: string | null; error: string | null }> {
  const ctx = await getBillingContext();
  if (!ctx) return { url: null, error: "Unauthorized" };
  if (ctx.role !== "owner") return { url: null, error: "Only the owner can manage the subscription" };
  if (!planIdSchema.safeParse(plan).success) return { url: null, error: "Invalid plan" };

  try {
    const supabase = ctx.supabase;
    const { data: clinic } = await supabase
      .from("clinics")
      .select("id, polar_customer_id, plan, polar_subscription_status")
      .eq("id", ctx.clinicId)
      .maybeSingle();
    if (!clinic) return { url: null, error: "Clinic not found" };

    // Repeat-checkout defense (review 2026-08-05): a clinic with a live paid
    // subscription must never get a second checkout — it would create a second
    // Polar subscription and double-bill. The pricing page routes through the
    // same pure helper.
    if (shouldBlockNewCheckout(clinic.plan, clinic.polar_subscription_status)) {
      return { url: null, error: "You already have an active subscription — manage it from the billing page." };
    }

    const { data: owner } = await supabase
      .from("users")
      .select("email")
      .eq("clinic_id", ctx.clinicId)
      .eq("role", "owner")
      .is("deleted_at", null)
      .maybeSingle();

    const result = await createCheckoutLink(plan, clinic.polar_customer_id ?? undefined, {
      clinic_id: clinic.id,
      plan,
    }, owner?.email ?? undefined);

    return { url: result.url, error: result.error };
  } catch (err) {
    captureBillingError(err, "billing.checkout.create", { clinicId: ctx.clinicId, plan });
    return { url: null, error: "Failed to create checkout link. Please try again." };
  }
}

export async function getPortalUrl(): Promise<{ url: string | null; error: string | null }> {
  const ctx = await getBillingContext();
  if (!ctx) return { url: null, error: "Unauthorized" };
  if (ctx.role !== "owner") return { url: null, error: "Only the owner can manage billing details" };

  try {
    const supabase = ctx.supabase;
    const { data: clinic } = await supabase
      .from("clinics")
      .select("polar_customer_id")
      .eq("id", ctx.clinicId)
      .maybeSingle();
    if (!clinic?.polar_customer_id) return { url: null, error: "No billing account linked yet" };

    const result = await createCustomerPortalUrl(clinic.polar_customer_id);
    return { url: result.url, error: result.error };
  } catch (err) {
    captureBillingError(err, "billing.portal.create", { clinicId: ctx.clinicId });
    return { url: null, error: "Failed to open the billing portal." };
  }
}

// ─── Subscription mutations (Polar drives; webhook converges the DB) ────────

const cancellationReasons = [
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "customer_service",
  "low_quality",
  "too_complex",
  "other",
] as const;

const cancelInputSchema = z.object({
  reason: z.enum(cancellationReasons).optional(),
  comment: z.string().max(500).optional(),
});

async function getPolarSubscription() {
  const ctx = await getBillingContext();
  if (!ctx) return { ctx: null, error: "Unauthorized" };
  if (ctx.role !== "owner") return { ctx, error: "Only the owner can manage the subscription" };

  const polar = createPolarAdmin();
  if (!polar) return { ctx, error: "Billing is not configured yet." };

  const { data: clinic } = await ctx.supabase
    .from("clinics")
    .select("polar_subscription_id")
    .eq("id", ctx.clinicId)
    .maybeSingle();
  if (!clinic?.polar_subscription_id) return { ctx, error: "No active subscription to manage." };

  return { ctx, polar, subscriptionId: clinic.polar_subscription_id, error: null };
}

export async function cancelSubscription(input: { reason?: string; comment?: string }): Promise<{ success: boolean; error: string | null }> {
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid cancellation details" };

  const res = await getPolarSubscription();
  if (!res.ctx || res.error) return { success: false, error: res.error ?? "Unauthorized" };
  if (!res.polar) return { success: false, error: "Billing is not configured yet." };

  try {
    await res.polar.subscriptions.update({
      id: res.subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
        customerCancellationReason: parsed.data.reason ?? null,
        customerCancellationComment: parsed.data.comment ?? null,
      },
    });
  } catch (err) {
    captureBillingError(err, "billing.cancel", { clinicId: res.ctx.clinicId });
    return { success: false, error: "We couldn't reach the payment provider. Please try again." };
  }

  revalidatePath("/dashboard/settings/billing");
  return { success: true, error: null };
}

export async function reactivateSubscription(): Promise<{ success: boolean; error: string | null }> {
  const res = await getPolarSubscription();
  if (!res.ctx || res.error) return { success: false, error: res.error ?? "Unauthorized" };
  if (!res.polar) return { success: false, error: "Billing is not configured yet." };

  try {
    await res.polar.subscriptions.update({
      id: res.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });
  } catch (err) {
    captureBillingError(err, "billing.uncancel", { clinicId: res.ctx.clinicId });
    return { success: false, error: "We couldn't reach the payment provider. Please try again." };
  }

  revalidatePath("/dashboard/settings/billing");
  return { success: true, error: null };
}

export async function changePlan(plan: string): Promise<{ success: boolean; error: string | null }> {
  if (!planIdSchema.safeParse(plan).success) return { success: false, error: "Invalid plan" };
  const targetPlan = plan as PlanId;

  const res = await getPolarSubscription();
  if (!res.ctx || res.error) return { success: false, error: res.error ?? "Unauthorized" };
  if (!res.polar) return { success: false, error: "Billing is not configured yet." };

  try {
    const { data: clinic } = await res.ctx.supabase
      .from("clinics")
      .select("plan, trial_plan")
      .eq("id", res.ctx.clinicId)
      .maybeSingle();
    const effective = clinic?.plan === "trial" ? clinic.trial_plan : clinic?.plan;
    if (effective === targetPlan) return { success: false, error: `You are already on the ${PLAN_NAME[targetPlan]} plan.` };

    const productId = await resolveProductIdFromPrice(res.polar, targetPlan);
    if (!productId) return { success: false, error: `No product configured for the ${PLAN_NAME[targetPlan]} plan.` };

    await res.polar.subscriptions.update({
      id: res.subscriptionId,
      subscriptionUpdate: { productId },
    });
  } catch (err) {
    captureBillingError(err, "billing.plan-change", { clinicId: res.ctx.clinicId, plan: targetPlan });
    return { success: false, error: "We couldn't reach the payment provider. Please try again." };
  }

  revalidatePath("/dashboard/settings/billing");
  return { success: true, error: null };
}

// ─── Invoices ───────────────────────────────────────────────────────────────

// Read-only, so managers/viewers (who may need invoices for accounting) can
// call it. Ownership guard: the order must belong to this clinic's Polar
// customer, or the invoice URL (Polar-hosted billing document) is denied —
// the admin token must never expose another customer's invoice (049 principle).
export async function getInvoiceUrl(orderId: string): Promise<{ url: string | null; error: string | null }> {
  const ctx = await getBillingContext();
  if (!ctx) return { url: null, error: "Unauthorized" };

  const polar = createPolarAdmin();
  if (!polar) return { url: null, error: "Billing is not configured yet." };

  try {
    const { data: clinic } = await ctx.supabase
      .from("clinics")
      .select("polar_customer_id")
      .eq("id", ctx.clinicId)
      .maybeSingle();
    if (!clinic?.polar_customer_id) return { url: null, error: "No billing account linked yet" };

    const order = await polar.orders.get({ id: orderId });
    if (order.customerId !== clinic.polar_customer_id) {
      captureBillingError(new Error("Invoice ownership mismatch"), "billing.invoice.get", {
        clinicId: ctx.clinicId,
        orderId,
      });
      return { url: null, error: "Invoice not found" };
    }

    const invoice = await polar.orders.invoice({ id: orderId });
    return { url: invoice.url, error: null };
  } catch (err) {
    captureBillingError(err, "billing.invoice.get", { clinicId: ctx.clinicId, orderId });
    return { url: null, error: "Failed to load the invoice. Please try again." };
  }
}
