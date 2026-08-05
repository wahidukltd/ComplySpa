import { describe, it, expect } from "vitest";
import {
  deriveBannerState,
  bannerCopy,
  nextChargeLine,
  formatCurrency,
  formatDateOnly,
  daysUntil,
  polarStatusLabel,
  shouldBlockNewCheckout,
} from "@/lib/billing/copy";
import { mapPlan } from "@/lib/polar/webhook";

// Pure state derivation + copy mapping for the billing workspace
// (experience blueprint §6.1, §8 — every banner state and copy string).

function bannerInput(overrides: Record<string, unknown> = {}) {
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
    price: 49,
    ...overrides,
  };
}

describe("deriveBannerState", () => {
  it("unconfigured wins when Polar is disabled", () => {
    expect(deriveBannerState(bannerInput({ polarEnabled: false }))).toBe("unconfigured");
  });

  it("trial wins for trial plans", () => {
    expect(deriveBannerState(bannerInput({ plan: "trial", trialPlan: "practice" }))).toBe("trial");
  });

  it("past_due outranks cancel-scheduled (money problem > schedule)", () => {
    expect(
      deriveBannerState(bannerInput({ polarStatus: "past_due", cancelAtPeriodEnd: true })),
    ).toBe("past_due");
  });

  it("cancel-scheduled shows for cancelAtPeriodEnd on a paid plan", () => {
    expect(deriveBannerState(bannerInput({ cancelAtPeriodEnd: true }))).toBe("cancel-scheduled");
  });

  it("active is the default paid state", () => {
    expect(deriveBannerState(bannerInput())).toBe("active");
  });

  it("incomplete/unpaid never render a false green active banner (review 2026-08-05)", () => {
    expect(deriveBannerState(bannerInput({ polarStatus: "incomplete" }))).toBe("incomplete");
    expect(deriveBannerState(bannerInput({ polarStatus: "incomplete_expired" }))).toBe("incomplete");
    expect(deriveBannerState(bannerInput({ polarStatus: "unpaid" }))).toBe("unpaid");
  });

  it("canceled without a scheduled end is its own amber state, not active", () => {
    expect(deriveBannerState(bannerInput({ polarStatus: "canceled" }))).toBe("canceled");
    expect(deriveBannerState(bannerInput({ polarStatus: "canceled", cancelAtPeriodEnd: true }))).toBe("cancel-scheduled");
  });

  it("pending-sync overrides everything", () => {
    expect(deriveBannerState(bannerInput({ pendingSync: true, polarStatus: "past_due" }))).toBe("pending-sync");
  });

  it("degraded shows when live data failed (still resolves before state)", () => {
    expect(deriveBannerState(bannerInput({ degraded: true }))).toBe("degraded");
  });
});

describe("bannerCopy", () => {
  it("trial copy carries the countdown and price anchor, never fear", () => {
    const { title } = bannerCopy("trial", bannerInput({ plan: "trial", trialPlan: "solo", daysLeft: 3, price: 29 }));
    expect(title).toContain("3 days");
    expect(title).toContain("$29.00/mo after");
    expect(title.toLowerCase()).not.toContain("expire");
  });

  it("cancel-scheduled copy states the end date and the no-deletion promise", () => {
    const { title, detail } = bannerCopy("cancel-scheduled", bannerInput({ periodEnd: "2026-09-05T00:00:00.000Z" }));
    expect(title).toContain("Cancels on");
    expect(detail).toContain("Nothing is deleted");
    expect(detail.toLowerCase()).toContain("resume");
  });

  it("past_due copy states the consequence and the fix", () => {
    const { title, detail } = bannerCopy("past_due", bannerInput());
    expect(title).toBe("Payment failed");
    expect(detail).toContain("access continues");
    expect(detail).toContain("Update your payment method");
  });

  it("unconfigured copy never implies a broken page", () => {
    const { detail } = bannerCopy("unconfigured", bannerInput({ plan: "trial", trialPlan: "practice" }));
    expect(detail).toContain("trial of Practice");
  });

  it("unconfigured copy is truthful for non-trial clinics (review 2026-08-05)", () => {
    const { detail } = bannerCopy("unconfigured", bannerInput({ plan: "solo", trialPlan: null }));
    expect(detail.toLowerCase()).not.toContain("trial");
    expect(detail).toContain("billing actions will be enabled soon");
  });

  it("incomplete/unpaid/canceled copy states the consequence and the fix", () => {
    expect(bannerCopy("incomplete", bannerInput()).title).toBe("Payment not completed");
    expect(bannerCopy("unpaid", bannerInput()).title).toBe("Payment failed repeatedly");
    expect(bannerCopy("canceled", bannerInput()).title).toBe("Subscription ended");
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

  it("trial: shows the evaluated plan and the post-trial anchor", () => {
    const line = nextChargeLine({
      plan: "trial",
      priceCents: null,
      priceDollars: 29,
      periodEnd: null,
      isTrial: true,
      trialPlan: "solo",
      trialEndDate: "2026-08-19T00:00:00.000Z",
    });
    expect(line).toContain("Trial of Solo");
    expect(line).toContain("$29.00/mo after");
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
