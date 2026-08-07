import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSql } from "./helpers";
import { Webhook } from "standardwebhooks";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import type { SubscriptionStatus } from "@polar-sh/sdk/models/components/subscriptionstatus.js";
import { webhookSubscriptionActivePayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload.js";
import { webhookSubscriptionCreatedPayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload.js";
import { webhookSubscriptionUpdatedPayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload.js";
import { webhookSubscriptionCanceledPayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload.js";
import { webhookSubscriptionUncanceledPayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload.js";
import { webhookSubscriptionRevokedPayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload.js";
import { webhookSubscriptionPastDuePayloadToJSON } from "@polar-sh/sdk/models/components/webhooksubscriptionpastduepayload.js";

// The TEST WEBHOOK INPUT (plan 2026-08-08 §4.12): standardwebhooks-signed
// events driven through the REAL production route — same handler, same
// validateEvent (signature + schema), same dedup, same RPC convergence, same
// error paths. The only difference from Polar is who signs the payloads.
// When Polar approves, nothing in src/ changes — the swap is env vars +
// dashboard endpoint config + the V-checklist.
//
// Fixtures are schema-complete: built as typed SDK model objects and
// serialized via the SDK's own ToJSON helpers, so validateEvent's inbound
// schema accepts them exactly as real Polar events would.

const TEST_SECRET = "whsec_contract_test";

// The route reads POLAR_WEBHOOK_SECRET at module scope — set before import.
process.env.POLAR_WEBHOOK_SECRET = TEST_SECRET;

type Route = typeof import("@/app/api/polar/webhook/route");
let POST: Route["POST"];
let clinicId = "";

function sign(body: string, eventId: string): Record<string, string> {
  const timestamp = new Date();
  const signer = new Webhook(Buffer.from(TEST_SECRET, "utf-8").toString("base64"));
  const signature = signer.sign(eventId, timestamp, body);
  return {
    "webhook-id": eventId,
    "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "webhook-signature": signature,
  };
}

// The SDK's *ToJSON helpers return a JSON STRING — the route's validateEvent
// expects the raw body, so they are passed through un-stringified.

async function post(body: string, eventId: string, extraHeaders: Record<string, string> = {}) {
  const headers = { ...sign(body, eventId), "Content-Type": "application/json", ...extraHeaders };
  const req = new Request("http://localhost/api/polar/webhook", { method: "POST", headers, body });
  return POST(req as never);
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000);
  return {
    createdAt: now,
    modifiedAt: now,
    id: "sub_contract_1",
    amount: 2900,
    currency: "usd",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    status: "active" as SubscriptionStatus,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    startedAt: now,
    endsAt: null,
    endedAt: null,
    customerId: "cus_contract_1",
    productId: "prod_solo",
    discountId: null,
    checkoutId: "cs_contract_1",
    customerCancellationReason: null,
    customerCancellationComment: null,
    metadata: { clinic_id: clinicId, plan: "solo" },
    customer: {
      id: "cus_contract_1",
      createdAt: now,
      modifiedAt: now,
      metadata: {},
      emailVerified: true,
      type: "individual",
      name: "Contract Test",
      billingAddress: null,
      taxId: null,
      organizationId: "org_contract",
      deletedAt: null,
      avatarUrl: "",
    },
    product: {
      id: "prod_solo",
      createdAt: now,
      modifiedAt: now,
      trialInterval: null,
      trialIntervalCount: null,
      name: "ComplySpa Solo",
      description: null,
      visibility: "public",
      recurringInterval: "month",
      recurringIntervalCount: 1,
      isRecurring: true,
      isArchived: false,
      organizationId: "org_contract",
      metadata: { plan: "solo" },
      prices: [],
      benefits: [],
      medias: [],
      attachedCustomFields: [],
    },
    discount: null,
    prices: [],
    meters: [],
    pendingUpdate: null,
    ...overrides,
  } as Subscription;
}

describe("webhook contract (signed events through the real route)", () => {
  beforeAll(async () => {
    execSql(`DELETE FROM users WHERE auth_user_id LIKE 'webhook-contract-%'`);
    // Orphaned dedup rows from prior runs reference the clinic (FK) — clear
    // them before the clinic delete.
    execSql(`DELETE FROM processed_webhooks WHERE clinic_id IN (SELECT id FROM clinics WHERE name LIKE 'WebhookContract%')`);
    execSql(`DELETE FROM clinics WHERE name LIKE 'WebhookContract%'`);
    const userId = `webhook-contract-${crypto.randomUUID()}`;
    clinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'webhook@contract.test', 'WebhookContract', NULL, NULL, 'practice')`,
    );
    execSql(
      `INSERT INTO staff_members (clinic_id, name, email, role, hire_date)
       VALUES ('${clinicId}', 'Webhook Staff', 'wh.staff@contract.test', 'front_desk', NOW())`,
    );
    ({ POST } = await import("@/app/api/polar/webhook/route"));
  }, 30000);

  afterAll(() => {
    if (clinicId) {
      // Dedup records reference the clinic (FK) — clear them first.
      execSql(`DELETE FROM processed_webhooks WHERE clinic_id = '${clinicId}'`);
      execSql(`DELETE FROM clinics WHERE id = '${clinicId}'`);
    }
  });

  function clinicRow(): string {
    return execSql(
      `SELECT COALESCE(plan, 'null') || '|' || COALESCE(polar_subscription_status, 'null') || '|' || COALESCE(subscription_interval, 'null') || '|' ||
              COALESCE(polar_subscription_id, 'null') || '|' || COALESCE(subscription_amount, -1) || '|' || cancel_at_period_end
       FROM clinics WHERE id = '${clinicId}'`,
    );
  }

  it("returns 403 for a bad signature", async () => {
    // ToJSON already returns a JSON string — passing it directly (finding
    // 16); the invalid signature must fail verification before schema parse.
    const body = webhookSubscriptionActivePayloadToJSON({
      type: "subscription.active",
      timestamp: new Date(),
      data: makeSubscription(),
    });
    const headers = sign(body, "evt_bad_sig");
    const req = new Request("http://localhost/api/polar/webhook", {
      method: "POST",
      headers: { ...headers, "webhook-signature": "v1,invalid", "Content-Type": "application/json" },
      body,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  it("subscription.created projects status only — plan unchanged (trial), no subscription id recorded (incomplete-id rule)", async () => {
    const event = webhookSubscriptionCreatedPayloadToJSON({
      type: "subscription.created",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_abandoned", status: "incomplete" as SubscriptionStatus, currentPeriodStart: new Date() }),
    });
    const res = await post(event, `evt_created_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    // Projection only: status incomplete, interval monthly, amount from the
    // payload, subscription id NOT recorded (052 incomplete-id rule).
    expect(clinicRow()).toBe("trial|incomplete|monthly|null|2900|false");
  });

  it("subscription.active converges plan, status, interval, amount, id — and the trial ends", async () => {
    const event = webhookSubscriptionActivePayloadToJSON({
      type: "subscription.active",
      timestamp: new Date(),
      data: makeSubscription(),
    });
    const res = await post(event, `evt_active_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("solo|active|monthly|sub_contract_1|2900|false");
    const trialEnded = execSql(
      `SELECT trial_end_date <= NOW() + INTERVAL '1 minute' FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(trialEnded).toBe("t");
  });

  it("reconcile restores staff on activation (practice entitlements)", async () => {
    const suspended = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspended).toBe("0");
  });

  it("subscription.updated projects an interval change to annual (B7)", async () => {
    const event = webhookSubscriptionUpdatedPayloadToJSON({
      type: "subscription.updated",
      timestamp: new Date(),
      data: makeSubscription({
        recurringInterval: "year",
        amount: 29000,
        productId: "prod_solo_annual",
        product: { ...makeSubscription().product, id: "prod_solo_annual", recurringInterval: "year" },
      }),
    });
    const res = await post(event, `evt_updated_annual_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("solo|active|annual|sub_contract_1|29000|false");
  });

  it("subscription.updated with cancelAtPeriodEnd schedules cancellation", async () => {
    const event = webhookSubscriptionUpdatedPayloadToJSON({
      type: "subscription.updated",
      timestamp: new Date(),
      data: makeSubscription({ recurringInterval: "year", amount: 29000, cancelAtPeriodEnd: true }),
    });
    const res = await post(event, `evt_updated_cancel_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("solo|active|annual|sub_contract_1|29000|true");
  });

  it("subscription.uncanceled clears the flag", async () => {
    const event = webhookSubscriptionUncanceledPayloadToJSON({
      type: "subscription.uncanceled",
      timestamp: new Date(),
      data: makeSubscription({ recurringInterval: "year", amount: 29000, cancelAtPeriodEnd: false }),
    });
    const res = await post(event, `evt_uncanceled_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("solo|active|annual|sub_contract_1|29000|false");
  });

  it("subscription.past_due projects the payment-failure status, plan unchanged", async () => {
    const event = webhookSubscriptionPastDuePayloadToJSON({
      type: "subscription.past_due",
      timestamp: new Date(),
      data: makeSubscription({ recurringInterval: "year", amount: 29000, status: "past_due" as SubscriptionStatus }),
    });
    const res = await post(event, `evt_past_due_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("solo|past_due|annual|sub_contract_1|29000|false");
  });

  it("immediate-end rule: subscription.canceled without cancelAtPeriodEnd ends the plan and reconciles (staff suspended)", async () => {
    const event = webhookSubscriptionCanceledPayloadToJSON({
      type: "subscription.canceled",
      timestamp: new Date(),
      data: makeSubscription({ recurringInterval: "year", amount: 29000, status: "canceled" as SubscriptionStatus, cancelAtPeriodEnd: false }),
    });
    const res = await post(event, `evt_canceled_end_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("expired_trial|canceled|annual|sub_contract_1|29000|false");
    // B1: reconcile ran (applied=true) → staff suspended by the expired_trial limits.
    const suspended = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspended).toBe("1");
  });

  it("revive path: a NEW subscription reactivates an expired_trial clinic (B1 revive exempt)", async () => {
    const event = webhookSubscriptionActivePayloadToJSON({
      type: "subscription.active",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_2", status: "active" as SubscriptionStatus, amount: 4900, currency: "usd", productId: "prod_practice", product: { ...makeSubscription().product, id: "prod_practice", name: "ComplySpa Practice", metadata: { plan: "practice" } } }),
    });
    const res = await post(event, `evt_revive_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("practice|active|monthly|sub_contract_2|4900|false");
    const restored = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(restored).toBe("1");
  });

  it("stale-id revoked event for an OLD subscription no-ops — plan unchanged AND staff NOT re-suspended (B1)", async () => {
    // Clinic is practice on sub_contract_2. A late-retried revoked event for
    // sub_contract_1 must not downgrade the plan and must not suspend staff.
    const event = webhookSubscriptionRevokedPayloadToJSON({
      type: "subscription.revoked",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_1", status: "canceled" as SubscriptionStatus }),
    });
    const res = await post(event, `evt_stale_revoked_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    expect(clinicRow()).toBe("practice|active|monthly|sub_contract_2|4900|false");
    const suspended = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspended).toBe("0");
  });

  it("finding 1: same-id paid event on a revoked clinic no-ops through the real route (054 guard)", async () => {
    // Move the clinic to expired_trial with the CURRENT id (matching revoke
    // applies), then a late subscription.updated for the SAME id must not
    // resurrect it to paid.
    const revoke = webhookSubscriptionRevokedPayloadToJSON({
      type: "subscription.revoked",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_2", status: "canceled" as SubscriptionStatus, amount: 2900 }),
    });
    const revokeRes = await post(revoke, `evt_f1_revoke_${crypto.randomUUID()}`);
    expect(revokeRes.status).toBe(200);
    // The revoke fixture carries the default amount (2900) — the projection
    // writes it, so the stored row reflects the revoke payload.
    expect(clinicRow()).toBe("expired_trial|canceled|monthly|sub_contract_2|2900|false");

    const staleActive = webhookSubscriptionUpdatedPayloadToJSON({
      type: "subscription.updated",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_2", status: "active" as SubscriptionStatus, amount: 2900 }),
    });
    const staleRes = await post(staleActive, `evt_f1_stale_${crypto.randomUUID()}`);
    expect(staleRes.status).toBe(200);
    // Plan stays expired_trial — no resurrection (finding 1). Amount may
    // change via projection only if applied; the guard no-ops entirely.
    expect(clinicRow()).toBe("expired_trial|canceled|monthly|sub_contract_2|2900|false");
    const suspended = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspended).toBe("1");

    // Clean up: revive with a NEW id so subsequent tests see a paid clinic.
    const revive = webhookSubscriptionActivePayloadToJSON({
      type: "subscription.active",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_3", status: "active" as SubscriptionStatus, amount: 5000, currency: "usd", productId: "prod_solo", product: { ...makeSubscription().product, id: "prod_solo", name: "ComplySpa Solo", metadata: { plan: "solo" } } }),
    });
    const reviveRes = await post(revive, `evt_f1_revive_${crypto.randomUUID()}`);
    expect(reviveRes.status).toBe(200);
    expect(clinicRow()).toBe("solo|active|monthly|sub_contract_3|5000|false");
  });

  it("dedup: replaying the same event id is a no-op (one write)", async () => {
    const event = webhookSubscriptionUpdatedPayloadToJSON({
      type: "subscription.updated",
      timestamp: new Date(),
      data: makeSubscription({ id: "sub_contract_3", amount: 5000 }),
    });
    const body = event;
    const eventId = `evt_dedup_${crypto.randomUUID()}`;
    const first = await post(body, eventId);
    const second = await post(body, eventId);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const processed = execSql(
      `SELECT COUNT(*) FROM processed_webhooks WHERE event_id = '${eventId}'`,
    );
    expect(processed).toBe("1");
    // The fixture's product metadata is plan: solo → the updated event
    // re-projects the plan to solo (correct projection, not a regression).
    expect(clinicRow()).toBe("solo|active|monthly|sub_contract_3|5000|false");
  });

  it("signature-valid unknown event types (subscription.cycled-shaped) return received:true with zero DB writes (B2)", async () => {
    // subscription.cycled is NOT in the v0.48.1 validateEvent union → the SDK
    // throws SDKValidationError AFTER verifying the signature → the route must
    // acknowledge, never 500 (a 500 would make Polar retry every renewal).
    const body = JSON.stringify({
      type: "subscription.cycled",
      timestamp: new Date().toISOString(),
      data: { subscription_id: "sub_contract_2" },
    });
    const res = await post(body, `evt_cycled_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    const processed = execSql(
      `SELECT COUNT(*) FROM processed_webhooks WHERE event_id LIKE 'evt_cycled_%'`,
    );
    expect(processed).toBe("0");
  });

  it("signature-valid unmodeled event payloads (order.paid-shaped) return received:true with zero writes (B2)", async () => {
    // order.paid IS in the SDK union but is not a subscription lifecycle event
    // — the route must acknowledge without projecting. (The full typed Order
    // schema is heavy; the raw shaped body exercises the same dispatch path as
    // a real order event would — signature-valid, non-subscription, no-op.)
    const body = JSON.stringify({
      type: "order.paid",
      timestamp: new Date().toISOString(),
      data: { id: "ord_1", items: [], description: "x", refundable_amount: 0, refundable_tax_amount: 0, subscription_id: null },
    });
    const res = await post(body, `evt_order_${crypto.randomUUID()}`);
    expect(res.status).toBe(200);
    // The dedup test's subscription.updated projected the solo product, so the
    // clinic is solo here — order.paid must not have changed anything.
    expect(clinicRow()).toBe("solo|active|monthly|sub_contract_3|5000|false");
  });

  it("malformed subscription payload (valid signature) → 500, so Polar retries (B2)", async () => {
    // Known subscription type but missing required fields → SDKValidationError
    // → the route must 500 (retry-worthy), not silently 200.
    const body = JSON.stringify({ type: "subscription.active", data: { id: "partial" } });
    const res = await post(body, `evt_malformed_${crypto.randomUUID()}`);
    expect(res.status).toBe(500);
  });
});
