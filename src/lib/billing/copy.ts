import type { ReportTier } from "@/lib/utils/entitlements";

// Billing copy + pure state derivation — the single source for every string
// and status mapping on the billing page (experience blueprint §6, §8).
// Kept pure for unit testing: no server/client imports.

export type PlanId = "solo" | "practice";

// Billing cycle dimension (plan 2026-08-08 §4.7/B7): the subscription model
// understands plan + interval independently. Entitlements derive from plan
// only; interval is a billing-cycle dimension (one Polar product per
// interval). Published prices are display-only until a live Polar amount is
// projected (live-amount-wins pattern in the overview).
export type SubscriptionInterval = "monthly" | "annual";

export const PLAN_MONTHLY_PRICE: Record<PlanId, number> = {
  solo: 29,
  practice: 49,
};

export const PLAN_ANNUAL_PRICE: Record<PlanId, number> = {
  solo: 290,
  practice: 490,
};

export function planPrice(plan: PlanId, interval: SubscriptionInterval): number {
  return interval === "annual" ? PLAN_ANNUAL_PRICE[plan] : PLAN_MONTHLY_PRICE[plan];
}

export const PLAN_NAME: Record<PlanId, string> = {
  solo: "Solo",
  practice: "Practice",
};

export const PLAN_LOOKUP: Record<string, string> = {
  trial: "Free Trial",
  solo: "Solo",
  practice: "Practice",
  expired_trial: "Expired Trial",
  inactive: "Inactive",
};

export type BannerState =
  | "unconfigured"
  | "trial"
  | "active"
  | "cancel-scheduled"
  | "past_due"
  | "incomplete"
  | "unpaid"
  | "canceled"
  | "pending-sync"
  | "degraded";

export interface BannerInput {
  polarEnabled: boolean;
  plan: string;
  trialPlan: string | null;
  polarStatus: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndDate: string | null;
  periodEnd: string | null;
  pendingSync: boolean;
  degraded: boolean;
  daysLeft: number;
  price: number;
}

// Pure state derivation (review 2026-08-05): paid-state statuses other than
// past_due must NOT collapse to a green "active" banner — incomplete/unpaid
// are payment problems (red), canceled-non-scheduled is an ended subscription
// (amber). Only a genuinely active status falls through to "active".
export function deriveBannerState(input: BannerInput): BannerState {
  if (input.pendingSync) return "pending-sync";
  if (input.degraded) return "degraded";
  if (!input.polarEnabled) return "unconfigured";
  if (input.plan === "trial") return "trial";
  if (input.polarStatus === "past_due") return "past_due";
  if (input.polarStatus === "incomplete" || input.polarStatus === "incomplete_expired") return "incomplete";
  if (input.polarStatus === "unpaid") return "unpaid";
  if (input.cancelAtPeriodEnd) return "cancel-scheduled";
  if (input.polarStatus === "canceled") return "canceled";
  return "active";
}

// Research-backed status copy (experience blueprint §6.1): factual register,
// consequence + action in the same sentence, never fear copy.
export function bannerCopy(state: BannerState, input: BannerInput): { title: string; detail: string } {
  const planLabel = input.trialPlan === "solo" || input.trialPlan === "practice" ? PLAN_NAME[input.trialPlan] : null;
  switch (state) {
    case "unconfigured": {
      // Review 2026-08-05: the trial line is only truthful for trial clinics.
      const isTrial = input.plan === "trial";
      return {
        title: "Payment processing is being configured",
        detail: isTrial
          ? planLabel
            ? `Your free trial of ${planLabel} is active — no action needed.`
            : "Your trial is active — no action needed."
          : "Your subscription details remain available — billing actions will be enabled soon.",
      };
    }
    case "trial": {
      const priceLine = `$${input.price}.00/mo after`;
      const d = input.daysLeft;
      const countdown =
        d <= 0
          ? "Your trial ends today"
          : d === 1
            ? "Trial ends tomorrow"
            : `Trial ends in ${d} days`;
      return {
        title: `${countdown} · ${priceLine}`,
        detail:
          "Your staff, credentials, and reports are preserved either way. Subscribe to keep the plan.",
      };
    }
    case "active":
      return {
        title: "Your subscription is active",
        detail: "Payments are processing normally.",
      };
    case "cancel-scheduled":
      return {
        title: `Cancels on ${formatDateOnly(input.periodEnd)}`,
        detail: "Full access until then. Nothing is deleted — resume any time before the date.",
      };
    case "past_due":
      return {
        title: "Payment failed",
        detail: "Your card hasn't been charged. Update your payment method — access continues.",
      };
    case "incomplete":
      return {
        title: "Payment not completed",
        detail: "Finish the checkout to activate your subscription. Your data is unaffected.",
      };
    case "unpaid":
      return {
        title: "Payment failed repeatedly",
        detail: "Update your payment method to restore the subscription.",
      };
    case "canceled":
      return {
        title: "Subscription ended",
        detail: "Choose a plan to continue — your data is preserved.",
      };
    case "pending-sync":
      return {
        title: "Confirming your change with our payment provider",
        detail: "This usually takes a few seconds.",
      };
    case "degraded":
      return {
        title: "Live billing data is temporarily unavailable",
        detail: "Showing the last confirmed state.",
      };
  }
}

// Next-charge line: amount + date + frequency together (research: shown in one
// line, never hunted for). Live Polar amount wins; published price is the
// fallback. Interval-aware (plan 2026-08-08 §4.7): annual subscriptions show
// the annual amount with the annual cadence, monthly unchanged.
export function nextChargeLine(opts: {
  plan: string;
  priceCents: number | null;
  priceDollars: number;
  periodEnd: string | null;
  isTrial: boolean;
  trialPlan: string | null;
  trialEndDate: string | null;
  currency?: string | null;
  interval?: SubscriptionInterval | null;
}): string {
  const currency = opts.currency ?? "usd";
  const amount = opts.priceCents != null ? formatCurrency(opts.priceCents, currency) : formatCurrency(opts.priceDollars * 100, currency);
  if (opts.isTrial) {
    const planLabel = opts.trialPlan === "solo" || opts.trialPlan === "practice" ? PLAN_NAME[opts.trialPlan] : null;
    return `Trial of ${planLabel ?? "your plan"} — ${amount}/mo after ${formatDateOnly(opts.trialEndDate)}`;
  }
  const cadence = opts.interval === "annual" ? "annual charge" : "charge";
  return `Next ${cadence} ${amount} on ${formatDateOnly(opts.periodEnd)}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
};

export function formatCurrency(cents: number, currency?: string | null): string {
  const symbol = CURRENCY_SYMBOLS[currency ?? "usd"] ?? (currency ? `${currency.toUpperCase()} ` : "$");
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(value: string | null | undefined): number {
  if (!value) return 0;
  const d = new Date(value);
  if (isNaN(d.getTime())) return 0;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Polar subscription status → badge label (functional palette only).
export function polarStatusLabel(status: string | null): string | null {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trialing";
    case "past_due":
      return "Payment failed";
    case "canceled":
      return "Canceled";
    case "incomplete":
    case "incomplete_expired":
      return "Incomplete";
    case "unpaid":
      return "Unpaid";
    default:
      return null;
  }
}

export function reportTierLabel(tier: ReportTier): string {
  switch (tier) {
    case "basic":
      return "Basic Compliance Report";
    case "audit":
      return "Audit-Ready Compliance Report";
    case "none":
      return "No reports";
  }
}

// Review 2026-08-05 (repeat-checkout defense): a clinic with a live paid
// subscription must never get a NEW checkout — that would create a second
// Polar subscription (double billing; plan §4.0-C). Both checkout entry
// points (billing actions + pricing page) route through this.
export function shouldBlockNewCheckout(plan: string, polarStatus: string | null): boolean {
  const liveStatuses = ["active", "trialing", "past_due", "unpaid"];
  return (plan === "solo" || plan === "practice") && (polarStatus === null || liveStatuses.includes(polarStatus));
}
