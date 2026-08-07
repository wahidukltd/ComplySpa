import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSql } from "./helpers";

// Migration 052 + 053: update_clinic_subscription projects the full
// subscription state (status, billing period, amount, product, interval)
// alongside the plan, with COALESCE semantics so old-style callers stay
// harmless. 053 extends it: RETURNS boolean (applied), 12 params
// (p_subscription_interval), generalized stale-event guard. Grants stay
// pinned: EXECUTE is service_role-only (047/049 lesson — pin both directions).

let clinicId = "";
const USER_IDS: string[] = [];

function createUser(): string {
  const id = `billing-state-test-${crypto.randomUUID()}`;
  USER_IDS.push(id);
  return id;
}

describe("update_clinic_subscription (migration 052/053)", () => {
  beforeAll(() => {
    execSql(`DELETE FROM users WHERE auth_user_id LIKE 'billing-state-test-%'`);
    execSql(`DELETE FROM clinics WHERE name LIKE 'BillingStateTest%'`);
    const userId = createUser();
    clinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'billing@statetest.test', 'BillingStateTest', NULL, NULL, 'solo')`,
    );
  });

  afterAll(() => {
    if (clinicId) execSql(`DELETE FROM clinics WHERE id = '${clinicId}'`);
  });

  it("stores the full projection on a subscription.active-style call and returns applied=true", () => {
    const applied = execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', true, 'cus_123',
        'active', '2026-08-05T00:00:00Z', '2026-09-05T00:00:00Z', 4900, 'prod_practice', 'usd', 'monthly')`,
    );
    expect(applied).toBe("t");
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_status || '|' || cancel_at_period_end || '|' ||
              current_period_start::text || '|' || current_period_end::text || '|' ||
              subscription_amount || '|' || subscription_product_id || '|' ||
              polar_customer_id || '|' || subscription_currency || '|' || subscription_interval || '|' || (trial_end_date IS NOT NULL)
       FROM clinics WHERE id = '${clinicId}'`,
    );
    // Paid activation sets trial_end_date to NOW() (the column is NOT NULL
    // since 006 — the inherited NULL-clear body was a latent constraint bug,
    // fixed in 052) — hence IS NOT NULL = true.
    expect(row).toBe(
      "solo|active|true|2026-08-05 00:00:00+00|2026-09-05 00:00:00+00|4900|prod_practice|cus_123|usd|monthly|true",
    );
  });

  it("projects the currency from the payload (review 2026-08-05)", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL,
        'active', NULL, NULL, NULL, NULL, 'eur')`,
    );
    const row = execSql(
      `SELECT subscription_currency FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("eur");
  });

  it("projects the annual interval (B7) and rejects invalid intervals by leaving the stored value", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL,
        'active', NULL, NULL, 49000, 'prod_practice_annual', 'usd', 'annual')`,
    );
    const row = execSql(
      `SELECT subscription_interval || '|' || subscription_amount FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("annual|49000");

    // Malformed interval value must not 500 the webhook — leave stored value.
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL,
        'active', NULL, NULL, NULL, NULL, NULL, 'week')`,
    );
    const after = execSql(
      `SELECT subscription_interval FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(after).toBe("annual");
  });

  it("past_due projection keeps the plan unchanged", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL,
        'past_due', NULL, '2026-09-05T00:00:00Z', NULL, NULL)`,
    );
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_status || '|' || cancel_at_period_end || '|' || subscription_amount
       FROM clinics WHERE id = '${clinicId}'`,
    );
    // Plan stays solo; status flips to past_due; cancel flag clears; amount
    // persists via COALESCE (NULL args never wipe existing values).
    expect(row).toBe("solo|past_due|false|49000");
  });

  it("uncanceled clears the cancel flag", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL, 'active', NULL, NULL, NULL, NULL)`,
    );
    const row = execSql(
      `SELECT cancel_at_period_end || '|' || polar_subscription_status FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("false|active");
  });

  it("revoked moves the plan to expired_trial with a real subscription id", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'expired_trial', 'sub_active_1', false, NULL, 'canceled', NULL, NULL, NULL, NULL, NULL)`,
    );
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_status FROM clinics WHERE id = '${clinicId}'`,
    );
    // The SDK's SubscriptionStatus enum has no 'revoked' value — a revoked
    // subscription's status is 'canceled'; the event type carries the semantics.
    expect(row).toBe("expired_trial|canceled");
  });

  it("re-anchors trial_end_date at revocation so the 30-day inactive window counts from now (review 2026-08-05)", () => {
    const row = execSql(
      `SELECT trial_end_date > NOW() - INTERVAL '2 minutes' FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("t");
  });

  it("ignores a stale downgrade for a DIFFERENT subscription id (review 2026-08-05) — returns false", () => {
    // Clinic is currently expired_trial with sub_active_1 recorded. Re-activate
    // to paid with a NEW subscription (re-subscribe), then a late-retried
    // revoked event for the OLD subscription must not clobber it.
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_new_2', false, 'cus_123',
        'active', NULL, NULL, 4900, 'prod_solo', 'usd', 'monthly')`,
    );
    const applied = execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'expired_trial', 'sub_active_1', false, NULL, 'canceled', NULL, NULL, NULL, NULL, NULL)`,
    );
    expect(applied).toBe("f");
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_id || '|' || polar_subscription_status
       FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("solo|sub_new_2|active");
  });

  it("generalized stale-event guard (053/B1): a stale active event for an old id no-ops on a paid clinic — returns false", () => {
    const applied = execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_active_1', false, NULL, 'active', NULL, NULL, 2900, 'prod_solo', 'usd', 'monthly')`,
    );
    expect(applied).toBe("f");
    const row = execSql(
      `SELECT polar_subscription_id || '|' || subscription_amount FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("sub_new_2|4900");
  });

  it("revive path: an expired_trial/inactive clinic accepts a NEW subscription id (re-subscription never blocked)", () => {
    // Move to expired_trial with the CURRENT id first (matching id applies),
    // then a NEW subscription's active event must be accepted.
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'expired_trial', 'sub_new_2', false, NULL, 'canceled', NULL, NULL, NULL, NULL, NULL)`,
    );
    const applied = execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'practice', 'sub_renewed_3', false, 'cus_123',
        'active', NULL, NULL, 4900, 'prod_practice', 'usd', 'monthly')`,
    );
    expect(applied).toBe("t");
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_id FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("practice|sub_renewed_3");
  });

  it("does not record the subscription id for incomplete checkouts (review 2026-08-05) — first-checkout case", () => {
    // Fresh clinic (no stored subscription id): an abandoned checkout's
    // incomplete event projects the status but NEVER records the dead id
    // (052 incomplete-id rule).
    const freshUserId = `billing-state-fresh-${crypto.randomUUID()}`;
    const freshClinic = execSql(
      `SELECT create_clinic_for_user('${freshUserId}', 'fresh@statetest.test', 'BillingStateTestFresh', NULL, NULL, 'solo')`,
    );
    try {
      execSql(
        `SELECT update_clinic_subscription(
          '${freshClinic}', 'trial', 'sub_abandoned_4', false, NULL,
          'incomplete_expired', NULL, NULL, NULL, NULL, NULL)`,
      );
      const row = execSql(
        `SELECT COALESCE(polar_subscription_id, 'null') || '|' || polar_subscription_status FROM clinics WHERE id = '${freshClinic}'`,
      );
      expect(row).toBe("null|incomplete_expired");
    } finally {
      execSql(`DELETE FROM clinics WHERE id = '${freshClinic}'`);
    }
  });

  it("a stale incomplete event for a DIFFERENT subscription id no-ops entirely on a paid clinic (053/B1)", () => {
    // The generalized guard supersedes the projection: an abandoned checkout
    // of a second subscription must not overwrite the live subscription's
    // status with 'incomplete' — the whole event no-ops.
    const applied = execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'practice', 'sub_abandoned_4', false, NULL,
        'incomplete_expired', NULL, NULL, NULL, NULL, NULL)`,
    );
    expect(applied).toBe("f");
    const row = execSql(
      `SELECT polar_subscription_id || '|' || polar_subscription_status FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("sub_renewed_3|active");
  });

  it("blocks a non-webhook downgrade of a paid plan (036 guard preserved) — returns false", () => {
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'practice', 'sub_active_1', false, NULL, 'active', NULL, NULL, NULL, NULL)`,
    );
    // No subscription id → guard returns without touching the paid plan.
    const applied = execSql(`SELECT update_clinic_subscription('${clinicId}', 'expired_trial', NULL, false)`);
    expect(applied).toBe("f");
    const row = execSql(`SELECT plan FROM clinics WHERE id = '${clinicId}'`);
    expect(row).toBe("practice");
  });

  it("old 4-arg call shape still works (defaults preserved) when the id matches the stored subscription", () => {
    // The clinic's stored id is sub_renewed_3; the legacy shape must use the
    // matching id to pass the generalized stale-event guard (053).
    execSql(`SELECT update_clinic_subscription('${clinicId}', 'practice', 'sub_renewed_3', true)`);
    const row = execSql(`SELECT cancel_at_period_end FROM clinics WHERE id = '${clinicId}'`);
    expect(row).toBe("t");
  });

  it("legacy 4-arg call with a stale id no-ops on a paid clinic (053/B1)", () => {
    const applied = execSql(`SELECT update_clinic_subscription('${clinicId}', 'solo', 'sub_active_1', false)`);
    expect(applied).toBe("f");
    const row = execSql(
      `SELECT plan || '|' || polar_subscription_id FROM clinics WHERE id = '${clinicId}'`,
    );
    expect(row).toBe("practice|sub_renewed_3");
  });

  it("raises for a missing clinic", () => {
    expect(() =>
      execSql(
        `SELECT update_clinic_subscription('00000000-0000-0000-0000-000000000000', 'solo', 'sub_x', false)`,
      ),
    ).toThrow();
  });

  it("grants are pinned: EXECUTE revoked from anon/authenticated, granted to service_role (12-param signature)", () => {
    const anonPriv = execSql(
      `SELECT has_function_privilege('anon', 'update_clinic_subscription(uuid, text, text, boolean, text, text, timestamptz, timestamptz, integer, text, text, text)', 'EXECUTE')`,
    );
    const authPriv = execSql(
      `SELECT has_function_privilege('authenticated', 'update_clinic_subscription(uuid, text, text, boolean, text, text, timestamptz, timestamptz, integer, text, text, text)', 'EXECUTE')`,
    );
    const servicePriv = execSql(
      `SELECT has_function_privilege('service_role', 'update_clinic_subscription(uuid, text, text, boolean, text, text, timestamptz, timestamptz, integer, text, text, text)', 'EXECUTE')`,
    );
    expect(anonPriv).toBe("f");
    expect(authPriv).toBe("f");
    expect(servicePriv).toBe("t");
  });

  it("reconcile_clinic_plan EXECUTE is pinned to service_role (review 2026-08-05)", () => {
    const anonPriv = execSql(
      `SELECT has_function_privilege('anon', 'reconcile_clinic_plan(uuid, text)', 'EXECUTE')`,
    );
    const authPriv = execSql(
      `SELECT has_function_privilege('authenticated', 'reconcile_clinic_plan(uuid, text)', 'EXECUTE')`,
    );
    const servicePriv = execSql(
      `SELECT has_function_privilege('service_role', 'reconcile_clinic_plan(uuid, text)', 'EXECUTE')`,
    );
    expect(anonPriv).toBe("f");
    expect(authPriv).toBe("f");
    expect(servicePriv).toBe("t");
  });

  it("the RPC signature is exactly the 12-param projection shape (review 2026-08-05 — pins the database.ts types)", () => {
    const sig = execSql(
      `SELECT pg_get_function_identity_arguments('update_clinic_subscription(uuid, text, text, boolean, text, text, timestamptz, timestamptz, integer, text, text, text)'::regprocedure)`,
    );
    expect(sig).toBe(
      "p_clinic_id uuid, p_plan text, p_polar_subscription_id text, p_cancel_at_period_end boolean, p_polar_customer_id text, p_subscription_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_subscription_amount integer, p_subscription_product_id text, p_subscription_currency text, p_subscription_interval text",
    );
  });

  it("the RPC returns boolean (applied flag, 053)", () => {
    const ret = execSql(
      `SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname = 'update_clinic_subscription' AND pg_get_function_identity_arguments(oid) = 'p_clinic_id uuid, p_plan text, p_polar_subscription_id text, p_cancel_at_period_end boolean, p_polar_customer_id text, p_subscription_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_subscription_amount integer, p_subscription_product_id text, p_subscription_currency text, p_subscription_interval text'`,
    );
    expect(ret).toBe("boolean");
  });

  it("clinics exposes the new columns with the status CHECK and interval CHECK constraints", () => {
    const cols = execSql(
      `SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clinics'
         AND column_name IN ('polar_subscription_status', 'current_period_start', 'current_period_end', 'subscription_amount', 'subscription_currency', 'subscription_product_id', 'subscription_interval')`,
    );
    expect(cols).toContain("current_period_end");
    expect(cols).toContain("polar_subscription_status");
    expect(cols).toContain("subscription_amount");
    expect(cols).toContain("subscription_product_id");
    expect(cols).toContain("subscription_interval");

    expect(() =>
      execSql(
        `UPDATE clinics SET polar_subscription_status = 'not_a_status' WHERE id = '${clinicId}'`,
      ),
    ).toThrow();

    expect(() =>
      execSql(
        `UPDATE clinics SET subscription_interval = 'weekly' WHERE id = '${clinicId}'`,
      ),
    ).toThrow();
  });
});
