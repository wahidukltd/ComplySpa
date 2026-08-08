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

export type SubscriptionStatus =
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

export interface StatusInput {
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
  // Whether a real checkout exists for the trial plan at the monthly
  // interval: polarConfig.enabled AND that product's price id configured.
  // The subscribe CTA may only render when this is true (plan F2).
  checkoutReady: boolean;
}

// Pure state derivation (review 2026-08-05): paid-state statuses other than
// past_due must NOT collapse to a green "active" state — incomplete/unpaid
// are payment problems (red), canceled-non-scheduled is an ended subscription
// (amber). Only a genuinely active status falls through to "active".
export function deriveSubscriptionStatus(input: StatusInput): SubscriptionStatus {
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

// The one action that is valid in a state — never render a button without one.
export type StatusCta =
  | { kind: "subscribe"; plan: PlanId; interval: SubscriptionInterval; label: string }
  | { kind: "portal"; label: string }
  | { kind: "resume"; label: string }
  | { kind: "compare-plans"; label: string }
  | { kind: "refresh"; label: string }
  | null;

export type StatusTone = "positive" | "warning" | "danger" | "neutral";

// States where the status renders as a full-width panel at the top of the
// plan card (money problems — prominence without a second surface). Single
// source: the client's panel decision keys off this, never its own list.
export const MONEY_PROBLEM_STATES: readonly SubscriptionStatus[] = ["past_due", "unpaid", "incomplete", "canceled"];

export interface StatusPresentation {
  state: SubscriptionStatus;
  tone: StatusTone;
  badgeLabel: string | null;
  headline: string | null;
  detail: string | null;
  cta: StatusCta | null;
}

// Single-surface status presentation (plan 2026-08-08): the plan card is the
// only status surface; the derived state selects tone/badge/headline/detail/
// CTA. Precedence is load-bearing (plan challenge):
//   1. `plan === "trial"` renders the trial row even when the derived state
//      is `unconfigured` (Polar not configured — the pre-approval state every
//      trial clinic is in) or a money-problem state (an abandoned/failed
//      checkout on a trial — starting a fresh subscription IS the fix).
//   2. Money-problem rows (past_due/incomplete/unpaid/canceled) apply to
//      paid-plan clinics only.
// `pending-sync` is never a card state — the client renders it as a transient
// inline strip (aria-live), not a status box.
export function deriveStatusPresentation(input: StatusInput): StatusPresentation {
  const state = deriveSubscriptionStatus(input);
  const isTrialPlan = input.plan === "trial";
  const trialPlanId: PlanId | null =
    input.trialPlan === "solo" || input.trialPlan === "practice" ? input.trialPlan : null;
  const planLabel = trialPlanId ? PLAN_NAME[trialPlanId] : null;

  if (isTrialPlan) {
    const countdown =
      input.daysLeft < 0
        ? "Your trial has ended"
        : input.daysLeft === 0
          ? "Trial ends today"
          : input.daysLeft === 1
            ? "Trial ends tomorrow"
            : `Trial ends in ${input.daysLeft} days`;
    const baseDetail =
      "Nothing is charged until your trial ends. After it ends your account pauses and goes read-only — your data is never deleted, and you can reactivate any time.";
    // Precise availability copy (review finding): the trial subscribe CTA is
    // monthly, so the claim is about the MONTHLY product — true whether the
    // whole integration is unconfigured or only the annual product exists.
    const availabilityLine = input.checkoutReady
      ? ""
      : " Monthly checkout isn't available yet — your trial continues normally.";
    // Trial + degraded (review finding): the trial row owns the countdown, but
    // a failed live Polar call must still be visible — the detail names it.
    const degradedLine = input.degraded
      ? " Live billing data is temporarily unavailable — showing the last confirmed state."
      : "";
    return {
      state,
      tone: "warning",
      badgeLabel: null,
      headline: countdown,
      detail: `${baseDetail}${availabilityLine}${degradedLine}`,
      cta: input.checkoutReady && trialPlanId
        ? {
            kind: "subscribe",
            plan: trialPlanId,
            interval: "monthly",
            label: `Subscribe now — keep ${planLabel ?? "your plan"}`,
          }
        : { kind: "compare-plans", label: "Compare plans" },
    };
  }

  switch (state) {
    case "active":
      // Badge + next-charge line carry the state; no status box.
      return { state, tone: "positive", badgeLabel: "Active", headline: null, detail: null, cta: null };
    case "cancel-scheduled":
      return {
        state,
        tone: "warning",
        // The Polar status is still `active` until period end; the warning
        // tone is carried by the headline.
        badgeLabel: polarStatusLabel(input.polarStatus),
        headline: `Cancels on ${formatDateOnly(input.periodEnd)}`,
        detail: "Full access until then. Nothing is deleted — resume any time before the date.",
        cta: { kind: "resume", label: "Resume subscription" },
      };
    case "past_due":
      return {
        state,
        tone: "danger",
        badgeLabel: "Payment failed",
        headline: "Payment failed",
        detail: "Your card hasn't been charged. Update your payment method — access continues.",
        cta: { kind: "portal", label: "Update payment method" },
      };
    case "unpaid":
      return {
        state,
        tone: "danger",
        badgeLabel: "Unpaid",
        headline: "Payment failed repeatedly",
        detail: "Update your payment method to restore your subscription.",
        cta: { kind: "portal", label: "Update payment method" },
      };
    case "incomplete":
      return {
        state,
        tone: "danger",
        badgeLabel: "Incomplete",
        headline: "Payment not completed",
        detail: "Finish the checkout you started to activate your subscription. Your data is unaffected.",
        cta: null,
      };
    case "canceled":
      return {
        state,
        tone: "warning",
        badgeLabel: "Canceled",
        headline: "Subscription ended",
        detail: "Choose a plan to continue — your data is preserved.",
        cta: { kind: "compare-plans", label: "Choose a plan" },
      };
    case "degraded":
      return {
        state,
        tone: "warning",
        badgeLabel: polarStatusLabel(input.polarStatus),
        headline: "Live billing data is temporarily unavailable",
        detail: "Showing the last confirmed state.",
        cta: { kind: "refresh", label: "Refresh" },
      };
    case "pending-sync":
    case "trial": // unreachable: trial-plan clinics return above; defensive
    case "unconfigured":
      // pending-sync is client-transient; unconfigured applies to paid plans
      // only (deployment edge) and renders a plain plan card.
      return { state, tone: "neutral", badgeLabel: null, headline: null, detail: null, cta: null };
  }
}

// Next-charge line: amount + date + frequency together (research: shown in one
// line, never hunted for). Live Polar amount wins; published price is the
// fallback. Interval-aware (plan 2026-08-08 §4.7): annual subscriptions show
// the annual amount with the annual cadence, monthly unchanged.
// End-of-life truthfulness (review finding): a cancel-scheduled subscription
// makes NO next charge — the line states the end instead of inventing one;
// same for an ended (canceled) or not-yet-active (incomplete) subscription.
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
  cancelAtPeriodEnd?: boolean;
  ended?: boolean;
  pendingActivation?: boolean;
}): string {
  const currency = opts.currency ?? "usd";
  const amount = opts.priceCents != null ? formatCurrency(opts.priceCents, currency) : formatCurrency(opts.priceDollars * 100, currency);
  if (opts.isTrial) {
    // The plan card title already names the plan — the price line states the
    // post-trial anchor only (plan F8: no duplication).
    return `Then ${amount}/mo after ${formatDateOnly(opts.trialEndDate)}`;
  }
  if (opts.cancelAtPeriodEnd) {
    return `No further charges — access through ${formatDateOnly(opts.periodEnd)}`;
  }
  if (opts.ended) return "No further charges";
  if (opts.pendingActivation) return "Payment pending — your subscription isn't active yet";
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

// Payment card strings — single source (plan F3). Every state is verified:
// `no-account` = no Polar customer exists (nothing could have been charged);
// `card` = Polar returned the card metadata; `no-card` = a customer exists but
// Polar lists no card (a real problem on a paid plan); `unavailable` = the
// payment-method call failed (degraded). Brand/last4 are never invented.
export function paymentCopy(
  state: "no-account" | "card" | "no-card" | "unavailable",
  opts: { brand: string | null; last4: string | null; isTrial: boolean },
): { line: string; sub: string } {
  switch (state) {
    case "card":
      // Brand/last4 only from verified Polar metadata; never invent digits —
      // without a last4 the line falls back to a bare "card on file".
      return opts.last4
        ? {
            line: `${opts.brand ?? "Card"} •••• ${opts.last4} — your card on file.`,
            sub: "Your subscription is billed to this card.",
          }
        : {
            line: `${opts.brand ?? "Card"} on file.`,
            sub: "Your subscription is billed to this card.",
          };
    case "no-account":
      return opts.isTrial
        ? {
            line: "No card on file — nothing is charged during your trial.",
            sub: "You'll add one when you subscribe.",
          }
        : {
            line: "No card on file — you'll add one when you subscribe.",
            sub: "Your first payment adds it.",
          };
    case "no-card":
      // A customer exists with no card. On a trial nothing renews (review
      // finding: the "won't renew" copy is only truthful for paid plans).
      return opts.isTrial
        ? {
            line: "No card on file — nothing is charged during your trial.",
            sub: "You'll add one when you subscribe.",
          }
        : {
            line: "No card on file — update your payment method before your next charge.",
            sub: "Your subscription won't renew without a valid card.",
          };
    case "unavailable":
      return {
        line: "Payment details temporarily unavailable — showing the last confirmed state.",
        sub: "Refresh to try again.",
      };
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
