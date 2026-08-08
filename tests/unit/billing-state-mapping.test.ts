import { describe, it, expect } from "vitest";
import {
  deriveSubscriptionStatus,
  deriveStatusPresentation,
  MONEY_PROBLEM_STATES,
  nextChargeLine,
  paymentCopy,
  formatCurrency,
  formatDateOnly,
  daysUntil,
  polarStatusLabel,
  shouldBlockNewCheckout,
} from "@/lib/billing/copy";
import { mapPlan } from "@/lib/polar/webhook";

// Pure state derivation + copy mapping for the billing workspace
// (plan 2026-08-08: single-surface status presentation on the plan card —
// every subscription state renders as badge/headline/detail/exactly-one CTA).

function statusInput(overrides: Record<string, unknown> = {}) {
  return {
    polarEnabled: true,
    plan: "solo",
    trialPlan: null,
    polarStatus: "active",
    cancelAtPeriodEnd: false,
    trialEndDate: null,
    periodEnd: "2026-09-05T00:00:00.000Z",
    pendingSync: false,
    degraded: false,
    daysLeft: 0,
    checkoutReady: true,
    ...overrides,
  };
}

describe("deriveSubscriptionStatus", () => {
  it("unconfigured wins when Polar is disabled", () => {
    expect(deriveSubscriptionStatus(statusInput({ polarEnabled: false }))).toBe("unconfigured");
  });

  it("trial wins for trial plans", () => {
    expect(deriveSubscriptionStatus(statusInput({ plan: "trial", trialPlan: "practice" }))).toBe("trial");
  });

  it("past_due outranks cancel-scheduled (money problem > schedule)", () => {
    expect(
      deriveSubscriptionStatus(statusInput({ polarStatus: "past_due", cancelAtPeriodEnd: true })),
    ).toBe("past_due");
  });

  it("cancel-scheduled shows for cancelAtPeriodEnd on a paid plan", () => {
    expect(deriveSubscriptionStatus(statusInput({ cancelAtPeriodEnd: true }))).toBe("cancel-scheduled");
  });

  it("active is the default paid state", () => {
    expect(deriveSubscriptionStatus(statusInput())).toBe("active");
  });

  it("incomplete/unpaid never collapse to active (review 2026-08-05)", () => {
    expect(deriveSubscriptionStatus(statusInput({ polarStatus: "incomplete" }))).toBe("incomplete");
    expect(deriveSubscriptionStatus(statusInput({ polarStatus: "incomplete_expired" }))).toBe("incomplete");
    expect(deriveSubscriptionStatus(statusInput({ polarStatus: "unpaid" }))).toBe("unpaid");
  });

  it("canceled without a scheduled end is its own amber state, not active", () => {
    expect(deriveSubscriptionStatus(statusInput({ polarStatus: "canceled" }))).toBe("canceled");
    expect(deriveSubscriptionStatus(statusInput({ polarStatus: "canceled", cancelAtPeriodEnd: true }))).toBe("cancel-scheduled");
  });

  it("pending-sync overrides everything", () => {
    expect(deriveSubscriptionStatus(statusInput({ pendingSync: true, polarStatus: "past_due" }))).toBe("pending-sync");
  });

  it("degraded shows when live data failed", () => {
    expect(deriveSubscriptionStatus(statusInput({ degraded: true }))).toBe("degraded");
  });
});

describe("deriveStatusPresentation", () => {
  it("active renders no status box — badge + price line carry it", () => {
    const p = deriveStatusPresentation(statusInput());
    expect(p.tone).toBe("positive");
    expect(p.badgeLabel).toBe("Active");
    expect(p.headline).toBeNull();
    expect(p.detail).toBeNull();
    expect(p.cta).toBeNull();
  });

  it("trial with checkoutReady: countdown headline + subscribe CTA", () => {
    const p = deriveStatusPresentation(
      statusInput({ plan: "trial", trialPlan: "solo", daysLeft: 3, price: 29, checkoutReady: true }),
    );
    expect(p.state).toBe("trial");
    expect(p.tone).toBe("warning");
    expect(p.badgeLabel).toBeNull();
    expect(p.headline).toBe("Trial ends in 3 days");
    expect(p.detail).toContain("pauses and goes read-only");
    expect(p.cta).toEqual({
      kind: "subscribe",
      plan: "solo",
      interval: "monthly",
      label: "Subscribe now — keep Solo",
    });
  });

  it("trial renders the trial row even when the derived state is unconfigured (pre-approval: no subscribe button, compare-plans CTA)", () => {
    // Challenge precedence: !polarEnabled derives `unconfigured`, but the
    // trial presentation must still render for trial-plan clinics.
    const p = deriveStatusPresentation(
      statusInput({ plan: "trial", trialPlan: "practice", daysLeft: 10, polarEnabled: false, checkoutReady: false }),
    );
    expect(p.state).toBe("unconfigured");
    expect(p.headline).toBe("Trial ends in 10 days");
    expect(p.detail).toContain("Monthly checkout isn't available yet");
    expect(p.cta).toEqual({ kind: "compare-plans", label: "Compare plans" });
  });

  it("trial with partial config (enabled but no price id): no subscribe CTA, availability line", () => {
    const p = deriveStatusPresentation(
      statusInput({ plan: "trial", trialPlan: "solo", daysLeft: 10, checkoutReady: false }),
    );
    expect(p.state).toBe("trial");
    expect(p.cta).toEqual({ kind: "compare-plans", label: "Compare plans" });
    expect(p.detail).toContain("Monthly checkout isn't available yet");
  });

  it("trial + degraded still names the degraded state (review finding: the trial row must not swallow a failed live call)", () => {
    const p = deriveStatusPresentation(
      statusInput({ plan: "trial", trialPlan: "solo", daysLeft: 7, degraded: true, checkoutReady: true }),
    );
    expect(p.state).toBe("degraded");
    expect(p.headline).toBe("Trial ends in 7 days");
    expect(p.detail).toContain("Live billing data is temporarily unavailable");
    expect(p.cta?.kind).toBe("subscribe");
  });

  it("trial wins over an abandoned checkout (precedence): countdown + subscribe CTA, never a dead incomplete row", () => {
    const p = deriveStatusPresentation(
      statusInput({ plan: "trial", trialPlan: "practice", polarStatus: "incomplete", daysLeft: 5, checkoutReady: true }),
    );
    expect(p.state).toBe("trial");
    expect(p.headline).toBe("Trial ends in 5 days");
    expect(p.cta?.kind).toBe("subscribe");
    expect(p.detail).not.toContain("Payment not completed");
  });

  it("trial countdown handles the elapsed edge (pre-cron): d<0 → has ended", () => {
    expect(
      deriveStatusPresentation(statusInput({ plan: "trial", trialPlan: "solo", daysLeft: -1, checkoutReady: true })).headline,
    ).toBe("Your trial has ended");
    expect(
      deriveStatusPresentation(statusInput({ plan: "trial", trialPlan: "solo", daysLeft: 1, checkoutReady: true })).headline,
    ).toBe("Trial ends tomorrow");
    expect(
      deriveStatusPresentation(statusInput({ plan: "trial", trialPlan: "solo", daysLeft: 0, checkoutReady: true })).headline,
    ).toBe("Trial ends today");
  });

  it("cancel-scheduled: amber, live-status badge, end date, resume CTA", () => {
    const p = deriveStatusPresentation(statusInput({ cancelAtPeriodEnd: true }));
    expect(p.state).toBe("cancel-scheduled");
    expect(p.tone).toBe("warning");
    expect(p.badgeLabel).toBe("Active");
    expect(p.headline).toBe("Cancels on Sep 5, 2026");
    expect(p.cta).toEqual({ kind: "resume", label: "Resume subscription" });
  });

  it("cancel-scheduled without a projected period end renders an honest dash, never a crash", () => {
    const p = deriveStatusPresentation(statusInput({ cancelAtPeriodEnd: true, periodEnd: null }));
    expect(p.headline).toBe("Cancels on —");
  });

  it("MONEY_PROBLEM_STATES is the single panel-state source (past_due/unpaid/incomplete/canceled)", () => {
    expect([...MONEY_PROBLEM_STATES]).toEqual(["past_due", "unpaid", "incomplete", "canceled"]);
  });

  it("money-problem states are danger with the right copy and CTA — never a false positive tone", () => {
    const pastDue = deriveStatusPresentation(statusInput({ polarStatus: "past_due" }));
    expect(pastDue.tone).toBe("danger");
    expect(pastDue.headline).toBe("Payment failed");
    expect(pastDue.cta).toEqual({ kind: "portal", label: "Update payment method" });

    const unpaid = deriveStatusPresentation(statusInput({ polarStatus: "unpaid" }));
    expect(unpaid.tone).toBe("danger");
    expect(unpaid.headline).toBe("Payment failed repeatedly");
    expect(unpaid.cta?.kind).toBe("portal");

    const incomplete = deriveStatusPresentation(statusInput({ polarStatus: "incomplete" }));
    expect(incomplete.tone).toBe("danger");
    expect(incomplete.headline).toBe("Payment not completed");
    expect(incomplete.cta).toBeNull();
  });

  it("canceled: amber, ended copy, choose-a-plan CTA", () => {
    const p = deriveStatusPresentation(statusInput({ polarStatus: "canceled" }));
    expect(p.tone).toBe("warning");
    expect(p.headline).toBe("Subscription ended");
    expect(p.cta).toEqual({ kind: "compare-plans", label: "Choose a plan" });
  });

  it("degraded: warning, last-confirmed-state copy, refresh CTA", () => {
    const p = deriveStatusPresentation(statusInput({ degraded: true }));
    expect(p.tone).toBe("warning");
    expect(p.headline).toBe("Live billing data is temporarily unavailable");
    expect(p.cta).toEqual({ kind: "refresh", label: "Refresh" });
  });

  it("unconfigured applies to paid plans only: plain card, no box, no CTA", () => {
    const p = deriveStatusPresentation(statusInput({ polarEnabled: false, plan: "solo" }));
    expect(p.state).toBe("unconfigured");
    expect(p.tone).toBe("neutral");
    expect(p.headline).toBeNull();
    expect(p.detail).toBeNull();
    expect(p.cta).toBeNull();
  });
});

describe("nextChargeLine", () => {
  it("paid: amount + date together, live amount wins", () => {
    const line = nextChargeLine({
      plan: "solo",
      priceCents: 4900,
      priceDollars: 49,
      periodEnd: "2026-09-05T00:00:00.000Z",
      isTrial: false,
      trialPlan: null,
      trialEndDate: null,
    });
    expect(line).toBe("Next charge $49.00 on Sep 5, 2026");
  });

  it("trial: post-trial anchor without repeating the plan name (plan F8)", () => {
    const line = nextChargeLine({
      plan: "trial",
      priceCents: null,
      priceDollars: 29,
      periodEnd: null,
      isTrial: true,
      trialPlan: "solo",
      trialEndDate: "2026-08-19T00:00:00.000Z",
    });
    expect(line).toBe("Then $29.00/mo after Aug 19, 2026");
    expect(line).not.toContain("Trial of");
  });

  it("never invents a figure: falls back to the published monthly price", () => {
    const line = nextChargeLine({
      plan: "practice",
      priceCents: null,
      priceDollars: 49,
      periodEnd: null,
      isTrial: false,
      trialPlan: null,
      trialEndDate: null,
    });
    expect(line).toContain("$49.00");
  });

  it("cancel-scheduled makes NO next charge — the line states the end (review S2)", () => {
    const line = nextChargeLine({
      plan: "solo",
      priceCents: 4900,
      priceDollars: 49,
      periodEnd: "2026-09-05T00:00:00.000Z",
      isTrial: false,
      trialPlan: null,
      trialEndDate: null,
      cancelAtPeriodEnd: true,
    });
    expect(line).toBe("No further charges — access through Sep 5, 2026");
    expect(line).not.toContain("Next charge");
  });

  it("ended (canceled) subscription states no further charges", () => {
    const line = nextChargeLine({
      plan: "solo",
      priceCents: null,
      priceDollars: 49,
      periodEnd: null,
      isTrial: false,
      trialPlan: null,
      trialEndDate: null,
      ended: true,
    });
    expect(line).toBe("No further charges");
  });

  it("pending activation (incomplete) never invents a next charge", () => {
    const line = nextChargeLine({
      plan: "solo",
      priceCents: null,
      priceDollars: 49,
      periodEnd: null,
      isTrial: false,
      trialPlan: null,
      trialEndDate: null,
      pendingActivation: true,
    });
    expect(line).toBe("Payment pending — your subscription isn't active yet");
  });
});

describe("paymentCopy — verified states only (plan F3)", () => {
  it("card: brand + last4 from Polar metadata, truthful billing line", () => {
    const p = paymentCopy("card", { brand: "Visa", last4: "4242", isTrial: false });
    expect(p.line).toBe("Visa •••• 4242 — your card on file.");
    expect(p.sub).toContain("billed to this card");
  });

  it("card without a last4 falls back to a bare line, never a malformed fragment", () => {
    const p = paymentCopy("card", { brand: "Visa", last4: null, isTrial: false });
    expect(p.line).toBe("Visa on file.");
    expect(p.line).not.toContain("••••");
  });

  it("no-account on a trial: nothing is charged during the trial", () => {
    const p = paymentCopy("no-account", { brand: null, last4: null, isTrial: true });
    expect(p.line).toBe("No card on file — nothing is charged during your trial.");
    expect(p.sub).toBe("You'll add one when you subscribe.");
  });

  it("no-account on a paid plan (edge): first payment adds it", () => {
    const p = paymentCopy("no-account", { brand: null, last4: null, isTrial: false });
    expect(p.line).toBe("No card on file — you'll add one when you subscribe.");
  });

  it("no-card: verified absence on an existing customer is a real problem", () => {
    const p = paymentCopy("no-card", { brand: null, last4: null, isTrial: false });
    expect(p.line).toContain("update your payment method");
    expect(p.line).toContain("before your next charge");
    expect(p.sub).toContain("won't renew");
  });

  it("no-card on a trial never claims a renewal is at risk (review finding)", () => {
    const p = paymentCopy("no-card", { brand: null, last4: null, isTrial: true });
    expect(p.line).toBe("No card on file — nothing is charged during your trial.");
    expect(p.sub).not.toContain("renew");
  });

  it("unavailable: degraded, shows last confirmed state", () => {
    const p = paymentCopy("unavailable", { brand: null, last4: null, isTrial: false });
    expect(p.line).toBe("Payment details temporarily unavailable — showing the last confirmed state.");
  });
});

describe("formatCurrency / formatDateOnly / daysUntil / polarStatusLabel / shouldBlockNewCheckout", () => {
  it("formats cents deterministically, currency-aware (review 2026-08-05)", () => {
    expect(formatCurrency(4900)).toBe("$49.00");
    expect(formatCurrency(2900)).toBe("$29.00");
    expect(formatCurrency(4900, "eur")).toBe("€49.00");
    expect(formatCurrency(4900, "gbp")).toBe("£49.00");
    expect(formatCurrency(4900, "cad")).toBe("CAD 49.00");
  });

  it("formats dates and tolerates junk input", () => {
    expect(formatDateOnly("2026-09-05T00:00:00.000Z")).toBe("Sep 5, 2026");
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly("not-a-date")).toBe("—");
  });

  it("daysUntil counts toward the date", () => {
    const inThree = new Date(Date.now() + 3 * 86400000).toISOString();
    expect(daysUntil(inThree)).toBe(3);
    expect(daysUntil(null)).toBe(0);
  });

  it("maps every Polar status to a human label", () => {
    expect(polarStatusLabel("active")).toBe("Active");
    expect(polarStatusLabel("past_due")).toBe("Payment failed");
    expect(polarStatusLabel("canceled")).toBe("Canceled");
    expect(polarStatusLabel("incomplete_expired")).toBe("Incomplete");
    expect(polarStatusLabel("unpaid")).toBe("Unpaid");
    expect(polarStatusLabel(null)).toBeNull();
  });

  it("blocks new checkouts only for live paid subscriptions (review 2026-08-05)", () => {
    expect(shouldBlockNewCheckout("solo", "active")).toBe(true);
    expect(shouldBlockNewCheckout("practice", "past_due")).toBe(true);
    expect(shouldBlockNewCheckout("solo", "trialing")).toBe(true);
    expect(shouldBlockNewCheckout("trial", "active")).toBe(false);
    expect(shouldBlockNewCheckout("solo", "canceled")).toBe(false);
    expect(shouldBlockNewCheckout("solo", "incomplete_expired")).toBe(false);
    expect(shouldBlockNewCheckout("expired_trial", null)).toBe(false);
    expect(shouldBlockNewCheckout("solo", null)).toBe(true);
  });
});

describe("mapPlan (webhook plan mapping)", () => {
  it("metadata.plan wins over product name", () => {
    expect(mapPlan("ComplySpa Practice", { plan: "solo" })).toBe("solo");
    expect(mapPlan("Something Else", { plan: "practice" })).toBe("practice");
  });

  it("falls back to product name matching", () => {
    expect(mapPlan("ComplySpa Practice Plan", null)).toBe("practice");
    expect(mapPlan("Solo Compliance", undefined)).toBe("solo");
  });

  it("returns null for unknown products", () => {
    expect(mapPlan("Enterprise Custom", {})).toBeNull();
    expect(mapPlan("Enterprise Custom", { plan: "enterprise" })).toBeNull();
  });
});
