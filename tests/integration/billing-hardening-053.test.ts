import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSql, rpcAsUser } from "./helpers";

// Migration 053 hardening (plan 2026-08-08):
//   B1 — generalized stale-event guard + applied flag (covered in
//         billing-subscription-state.test.ts)
//   B3 — enforce_plan_limits counts active-only staff/credentials (suspended =
//         freed slot, matching app + reconcile semantics)

let clinicId = "";

function createClinic(plan: string): string {
  const userId = `plan-enforcement-053-${crypto.randomUUID()}`;
  const id = execSql(
    `SELECT create_clinic_for_user('${userId}', '${userId}@test.test', 'PlanEnforcement053', NULL, NULL, '${plan}')`,
  );
  return id;
}

describe("enforce_plan_limits suspended-row parity (B3)", () => {
  beforeAll(() => {
    execSql(`DELETE FROM users WHERE auth_user_id LIKE 'plan-enforcement-053-%'`);
    execSql(`DELETE FROM clinics WHERE name LIKE 'PlanEnforcement053%'`);
  });

  afterAll(() => {
    if (clinicId) execSql(`DELETE FROM clinics WHERE id = '${clinicId}'`);
  });

  it("suspended staff do not count toward the limit — a downgraded clinic can add within its active headroom", () => {
    // Practice clinic (limit 15) with 15 active staff, then downgrade → solo
    // (limit 5) → reconcile suspends 10. The app's addStaffMember counts only
    // active rows, so after removing one active member the clinic must be able
    // to add again up to the active limit — the trigger must agree.
    clinicId = createClinic("practice");

    // Single multi-row insert (15 docker-spawned psql calls would exceed the
    // test timeout — finding 22).
    const staffValues = Array.from(
      { length: 15 },
      (_, i) => `('${clinicId}', 'Staff${i + 1}', 'staff${i + 1}@test.test', 'front_desk', NOW(), NOW() - INTERVAL '${15 - (i + 1)} days')`,
    ).join(", ");
    execSql(
      `INSERT INTO staff_members (clinic_id, name, email, role, hire_date, created_at)
       VALUES ${staffValues}`,
    );
    const before = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(before).toBe("15");

    // Downgrade via the RPC (matching id — applies), then reconcile.
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_p1', false, 'cus_p1',
        'active', NULL, NULL, 2900, 'prod_solo', 'usd', 'monthly')`,
    );
    execSql(`SELECT reconcile_clinic_plan('${clinicId}', 'solo')`);

    const active = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    const suspended = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(active).toBe("5");
    expect(suspended).toBe("10");

    // Remove one active member → 4 active, 10 suspended. The app allows an
    // insert (4 < 5); the trigger must too — the parity the 053 fix restores.
    // (UPDATE ... ORDER BY ... LIMIT is invalid in PostgreSQL — delete the
    // newest active row via a subquery instead.)
    execSql(
      `UPDATE staff_members SET deleted_at = NOW()
       WHERE id = (
         SELECT id FROM staff_members
         WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       )`,
    );

    // Insert succeeds (no ND0MV) — suspended rows do not consume the slot.
    execSql(
      `INSERT INTO staff_members (clinic_id, name, email, role, hire_date)
       VALUES ('${clinicId}', 'NewHire', 'newhire@test.test', 'front_desk', NOW())`,
    );

    const after = execSql(
      `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(after).toBe("5");
  });

  it("still blocks when the ACTIVE count is at the limit (ND0MV)", () => {
    expect(() =>
      execSql(
        `INSERT INTO staff_members (clinic_id, name, email, role, hire_date)
         VALUES ('${clinicId}', 'Sixth', 'sixth@test.test', 'front_desk', NOW())`,
      ),
    ).toThrow();
  });

  it("suspended credentials do not count toward the credential limit", () => {
    // Give the active staff a credential, suspend some credentials via
    // reconcile, then verify inserts within the active headroom succeed.
    const staffId = execSql(
      `SELECT id FROM staff_members WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    );
    const credTypeId = execSql(
      `SELECT id FROM credential_types WHERE is_custom = false AND clinic_id IS NULL ORDER BY id LIMIT 1`,
    );
    // Single multi-row insert (50 docker-spawned psql calls would exceed the
    // test timeout).
    const values = Array.from(
      { length: 50 },
      (_, i) => `('${clinicId}', '${staffId}', '${credTypeId}', 'LIC${i + 1}', NOW() - INTERVAL '300 days', NOW() + INTERVAL '100 days', NOW() - INTERVAL '${i + 1} days')`,
    ).join(", ");
    execSql(
      `INSERT INTO credentials (clinic_id, staff_member_id, credential_type_id, license_number, issue_date, expiration_date, created_at)
       VALUES ${values}`,
    );
    const credCount = execSql(
      `SELECT COUNT(*) FROM credentials WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(credCount).toBe("50");

    // Downgrade to expired_trial (limits 0) → reconcile suspends all.
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'expired_trial', 'sub_p1', false, NULL,
        'canceled', NULL, NULL, NULL, NULL, NULL)`,
    );
    execSql(`SELECT reconcile_clinic_plan('${clinicId}', 'expired_trial')`);

    const suspendedCreds = execSql(
      `SELECT COUNT(*) FROM credentials WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspendedCreds).toBe("50");

    // Back to solo → reconcile restores up to the credential limit (50).
    execSql(
      `SELECT update_clinic_subscription(
        '${clinicId}', 'solo', 'sub_p2', false, 'cus_p1',
        'active', NULL, NULL, 2900, 'prod_solo', 'usd', 'monthly')`,
    );
    execSql(`SELECT reconcile_clinic_plan('${clinicId}', 'solo')`);

    const restored = execSql(
      `SELECT COUNT(*) FROM credentials WHERE clinic_id = '${clinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(restored).toBe("50");
  });

  // ── Review-team remediation (migration 054) ──────────────────────────────

  it("finding 1: a same-id paid event on a revoked clinic is stale — no resurrection to paid (054 guard)", () => {
    // Fresh clinic → revoked with a stored dead id → a late subscription.updated
    // for the SAME id (generated pre-revoke, delivered post) must no-op: plan
    // stays expired_trial, staff stay suspended. Before 054 this resurrected
    // the clinic to paid entitlements and the fix event was deduped (sticky).
    const userId = `finding1-${crypto.randomUUID()}`;
    const id = execSql(
      `SELECT create_clinic_for_user('${userId}', 'finding1@test.test', 'Finding1Test', NULL, NULL, 'practice')`,
    );
    try {
      execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'solo', 'sub_f1_a', false, 'cus_f1',
          'active', NULL, NULL, 2900, 'prod_solo', 'usd', 'monthly')`,
      );
      execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'expired_trial', 'sub_f1_a', false, NULL,
          'canceled', NULL, NULL, NULL, NULL, NULL)`,
      );
      const before = execSql(
        `SELECT plan || '|' || polar_subscription_id FROM clinics WHERE id = '${id}'`,
      );
      expect(before).toBe("expired_trial|sub_f1_a");

      // Stale same-id paid event — must no-op (054 finding-1 guard).
      const applied = execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'solo', 'sub_f1_a', false, NULL,
          'active', NULL, NULL, 2900, 'prod_solo', 'usd', 'monthly')`,
      );
      expect(applied).toBe("f");
      const after = execSql(
        `SELECT plan || '|' || polar_subscription_id FROM clinics WHERE id = '${id}'`,
      );
      expect(after).toBe("expired_trial|sub_f1_a");

      // A NEW id on the revive path still works (re-subscription never blocked).
      const revived = execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'practice', 'sub_f1_b', false, 'cus_f1',
          'active', NULL, NULL, 4900, 'prod_practice', 'usd', 'monthly')`,
      );
      expect(revived).toBe("t");
      const revivedRow = execSql(
        `SELECT plan || '|' || polar_subscription_id FROM clinics WHERE id = '${id}'`,
      );
      expect(revivedRow).toBe("practice|sub_f1_b");
    } finally {
      execSql(`DELETE FROM clinics WHERE id = '${id}'`);
    }
  });

  it("finding 3: reconcile never suspends a clinic that has re-subscribed (054 guard)", () => {
    // The RPC and reconcile are separate transactions sharing an advisory
    // lock per CALL. Simulate the mis-order: a stale reconcile(expired_trial)
    // arriving AFTER the clinic re-subscribed to paid must no-op — staff stay
    // active.
    const userId = `finding3-${crypto.randomUUID()}`;
    const id = execSql(
      `SELECT create_clinic_for_user('${userId}', 'finding3@test.test', 'Finding3Test', NULL, NULL, 'practice')`,
    );
    try {
      execSql(
        `INSERT INTO staff_members (clinic_id, name, email, role, hire_date)
         VALUES ('${id}', 'F3 Staff', 'f3@test.test', 'front_desk', NOW())`,
      );
      // Revoke (paid → expired_trial), then immediately re-subscribe (revive).
      execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'expired_trial', 'sub_f3_a', false, NULL,
          'canceled', NULL, NULL, NULL, NULL, NULL)`,
      );
      execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'practice', 'sub_f3_b', false, 'cus_f3',
          'active', NULL, NULL, 4900, 'prod_practice', 'usd', 'monthly')`,
      );
      // The stale reconcile for the OLD plan must no-op (054 finding-3 guard).
      execSql(`SELECT reconcile_clinic_plan('${id}', 'expired_trial')`);
      const row = execSql(
        `SELECT plan || '|' || polar_subscription_status FROM clinics WHERE id = '${id}'`,
      );
      expect(row).toBe("practice|active");
      const suspended = execSql(
        `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${id}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
      );
      expect(suspended).toBe("0");
    } finally {
      execSql(`DELETE FROM clinics WHERE id = '${id}'`);
    }
  });

  it("finding 5: count_preserved_clinic_data counts suspended rows (resume truth)", async () => {
    const userId = `finding5-${crypto.randomUUID()}`;
    const id = execSql(
      `SELECT create_clinic_for_user('${userId}', 'finding5@test.test', 'Finding5Test', NULL, NULL, 'practice')`,
    );
    try {
      execSql(
        `INSERT INTO staff_members (clinic_id, name, email, role, hire_date)
         VALUES ('${id}', 'F5 Staff', 'f5@test.test', 'front_desk', NOW())`,
      );
      // Revoke → reconcile suspends the staff row.
      execSql(
        `SELECT update_clinic_subscription(
          '${id}', 'expired_trial', 'sub_f5_a', false, NULL,
          'canceled', NULL, NULL, NULL, NULL, NULL)`,
      );
      execSql(`SELECT reconcile_clinic_plan('${id}', 'expired_trial')`);

      const suspended = execSql(
        `SELECT COUNT(*) FROM staff_members WHERE clinic_id = '${id}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
      );
      expect(suspended).toBe("1");

      // The RPC counts non-deleted regardless of suspension, scoped to the
      // CALLER's session clinic (048/049 pattern). Direct psql has no JWT →
      // auth_clinic_id() is NULL → Unauthorized (proven by the pinned-grant
      // test below); the happy path needs an authenticated RPC call.
      const res = await rpcAsUser(userId, "count_preserved_clinic_data", {});
      expect(res.status).toBe(200);
      const body = (await res.json()) as { staff_count?: number; credential_count?: number }[];
      const row = body[0] ?? {};
      expect(row.staff_count).toBe(1);
      expect(row.credential_count).toBe(0);

      // Cross-tenant: a user from ANOTHER clinic gets 0 rows back, not the
      // victim clinic's counts (auth_clinic_id scoping).
      const otherUser = `finding5-other-${crypto.randomUUID()}`;
      const otherId = execSql(
        `SELECT create_clinic_for_user('${otherUser}', 'finding5other@test.test', 'Finding5TestOther', NULL, NULL, 'solo')`,
      );
      try {
        const otherRes = await rpcAsUser(otherUser, "count_preserved_clinic_data", {});
        const otherBody = (await otherRes.json()) as { staff_count?: number; credential_count?: number }[];
        expect(otherBody[0]?.staff_count ?? 0).toBe(0);
      } finally {
        execSql(`DELETE FROM clinics WHERE id = '${otherId}'`);
      }
    } finally {
      execSql(`DELETE FROM clinics WHERE id = '${id}'`);
    }
  });

  it("finding 5: count_preserved_clinic_data EXECUTE is pinned to authenticated only (047 lesson)", () => {
    const anonPriv = execSql(
      `SELECT has_function_privilege('anon', 'count_preserved_clinic_data()', 'EXECUTE')`,
    );
    const authPriv = execSql(
      `SELECT has_function_privilege('authenticated', 'count_preserved_clinic_data()', 'EXECUTE')`,
    );
    const servicePriv = execSql(
      `SELECT has_function_privilege('service_role', 'count_preserved_clinic_data()', 'EXECUTE')`,
    );
    expect(anonPriv).toBe("f");
    expect(authPriv).toBe("t");
    expect(servicePriv).toBe("f");
  });
});
