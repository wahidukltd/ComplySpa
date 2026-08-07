import { describe, it, expect } from "vitest";
import {
  resolveWebhookTransition,
  isImmediateEnd,
  type WebhookTransition,
} from "@/lib/polar/transitions";
import type { SubscriptionData } from "@/lib/polar/webhook";

// Pure webhook decision matrix (plan 2026-08-08 §4.1/B1, §4.2/B2, §4.7/B7;
// review finding 1 + 2). The resolver reads only the fields the route
// projection uses — the payload was already schema-validated by validateEvent
// at the route boundary, so the fixture is a typed subset, not a validation
// bypass. The 4th argument is the clinic's stored polar_subscription_id
// (null = never subscribed); the `applied` prediction mirrors the RPC guards
// for the unit-testable matrix — the ROUTE always calls the RPC and trusts
// its boolean (finding 2).

function makeData(overrides: Partial<SubscriptionData> = {}): SubscriptionData {
  return {
    id: "sub_1",
    amount: 2900,
    currency: "usd",
    status: "active",
    currentPeriodStart: new Date("2026-08-05T00:00:00Z"),
    currentPeriodEnd: new Date("2026-09-05T00:00:00Z"),
    cancelAtPeriodEnd: false,
    recurringInterval: "month",
    customerId: "cus_1",
    productId: "prod_solo",
    metadata: { clinic_id: "clinic-1", plan: "solo" },
    product: {
      id: "prod_solo",
      name: "ComplySpa Solo",
      metadata: { plan: "solo" },
    } as SubscriptionData["product"],
    ...overrides,
  } as SubscriptionData;
}

describe("resolveWebhookTransition", () => {
  describe("subscription.active / subscription.updated", () => {
    it("maps the product plan and monthly interval, reconcile on the mapped plan", () => {
      const t = resolveWebhookTransition("subscription.active", makeData(), "trial", "sub_1");
      expect(t).toMatchObject<Partial<WebhookTransition>>({
        plan: "solo",
        interval: "monthly",
        cancelAtPeriodEnd: false,
        reconcilePlan: "solo",
        applied: true,
      });
    });

    it("projects annual interval from recurringInterval=year (B7)", () => {
      const t = resolveWebhookTransition(
        "subscription.updated",
        makeData({ recurringInterval: "year", amount: 29000 }),
        "solo",
        "sub_1",
      );
      expect(t.interval).toBe("annual");
    });

    it("immediate-end rule: canceled status without cancelAtPeriodEnd → expired_trial + reconcile", () => {
      const t = resolveWebhookTransition(
        "subscription.updated",
        makeData({ status: "canceled", cancelAtPeriodEnd: false }),
        "solo",
        "sub_1",
      );
      expect(t).toMatchObject({ plan: "expired_trial", cancelAtPeriodEnd: false, reconcilePlan: "expired_trial" });
    });

    it("scheduled cancel stays on the mapped plan with the flag set", () => {
      const t = resolveWebhookTransition(
        "subscription.updated",
        makeData({ status: "active", cancelAtPeriodEnd: true }),
        "solo",
        "sub_1",
      );
      expect(t).toMatchObject({ plan: "solo", cancelAtPeriodEnd: true, reconcilePlan: "solo" });
    });
  });

  describe("subscription.created / subscription.past_due (projection only)", () => {
    it("keeps the current clinic plan, no reconcile", () => {
      const t = resolveWebhookTransition("subscription.created", makeData({ status: "incomplete" }), "trial", null);
      expect(t).toMatchObject({ plan: "trial", cancelAtPeriodEnd: false, reconcilePlan: null, applied: true });
    });

    it("past_due projects the status but never changes plan or reconciles", () => {
      const t = resolveWebhookTransition("subscription.past_due", makeData({ status: "past_due" }), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "solo", reconcilePlan: null });
    });
  });

  describe("subscription.canceled", () => {
    it("scheduled cancel: plan unchanged, cancel flag set, no reconcile", () => {
      const t = resolveWebhookTransition("subscription.canceled", makeData({ status: "active", cancelAtPeriodEnd: true }), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "solo", cancelAtPeriodEnd: true, reconcilePlan: null });
    });

    it("immediate end: expired_trial + reconcile (B1)", () => {
      const t = resolveWebhookTransition("subscription.canceled", makeData({ status: "canceled", cancelAtPeriodEnd: false }), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "expired_trial", cancelAtPeriodEnd: false, reconcilePlan: "expired_trial" });
    });
  });

  describe("subscription.revoked", () => {
    it("always ends the plan and reconciles", () => {
      const t = resolveWebhookTransition("subscription.revoked", makeData({ status: "canceled" }), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "expired_trial", cancelAtPeriodEnd: false, reconcilePlan: "expired_trial", applied: true });
    });
  });

  describe("subscription.uncanceled", () => {
    it("restores the mapped plan with the cancel flag cleared", () => {
      const t = resolveWebhookTransition("subscription.uncanceled", makeData({ status: "active", cancelAtPeriodEnd: false }), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "solo", cancelAtPeriodEnd: false, reconcilePlan: "solo" });
    });
  });

  describe("stale-id prediction (B1 generalized guard + finding 1)", () => {
    it("mismatched id on a paid clinic → applied=false", () => {
      const t = resolveWebhookTransition("subscription.active", makeData({ id: "sub_OLD" }), "solo", "sub_1");
      expect(t.applied).toBe(false);
    });

    it("mismatched id on a trial clinic → applied=false", () => {
      const t = resolveWebhookTransition("subscription.updated", makeData({ id: "sub_OLD" }), "trial", "sub_1");
      expect(t.applied).toBe(false);
    });

    it("revive path: expired_trial accepts a NEW subscription id (re-subscription never blocked)", () => {
      const t = resolveWebhookTransition("subscription.active", makeData({ id: "sub_NEW" }), "expired_trial", "sub_OLD");
      expect(t.applied).toBe(true);
      expect(t.plan).toBe("solo");
    });

    it("revive path: inactive accepts a NEW subscription id", () => {
      const t = resolveWebhookTransition("subscription.active", makeData({ id: "sub_NEW" }), "inactive", "sub_OLD");
      expect(t.applied).toBe(true);
    });

    it("revive path with NO stored id accepts the first subscription", () => {
      const t = resolveWebhookTransition("subscription.active", makeData({ id: "sub_FIRST" }), "expired_trial", null);
      expect(t.applied).toBe(true);
    });

    it("finding 1: revive path rejects a SAME-id paid event (stale re-activation of a dead subscription)", () => {
      const t = resolveWebhookTransition("subscription.updated", makeData({ id: "sub_OLD" }), "expired_trial", "sub_OLD");
      expect(t.applied).toBe(false);
    });

    it("matching id on a paid clinic always applies", () => {
      const t = resolveWebhookTransition("subscription.active", makeData(), "solo", "sub_1");
      expect(t.applied).toBe(true);
    });

    it("no stored id on a paid clinic applies (first subscription projection)", () => {
      const t = resolveWebhookTransition("subscription.active", makeData(), "trial", null);
      expect(t.applied).toBe(true);
    });
  });

  describe("unknown event type (defensive)", () => {
    it("never projects — no-op with applied=false", () => {
      const t = resolveWebhookTransition("subscription.cycled", makeData(), "solo", "sub_1");
      expect(t).toMatchObject({ plan: "solo", reconcilePlan: null, applied: false });
    });
  });
});

describe("isImmediateEnd", () => {
  it("canceled without cancelAtPeriodEnd is an immediate end", () => {
    expect(isImmediateEnd({ status: "canceled", cancelAtPeriodEnd: false })).toBe(true);
    expect(isImmediateEnd({ status: "canceled", cancelAtPeriodEnd: true })).toBe(false);
    expect(isImmediateEnd({ status: "active", cancelAtPeriodEnd: false })).toBe(false);
  });
});
