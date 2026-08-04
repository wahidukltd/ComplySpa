import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSql } from "./helpers";

// Migration 050: create_clinic_for_user requires p_trial_plan; trial clinics
// carry the evaluated plan; DB-layer limits (enforce_plan_limits) resolve the
// trial via trial_plan so defense-in-depth matches the app.

let soloTrialClinicId = "";
let practiceTrialClinicId = "";
const USER_IDS: string[] = [];

function createUser(): string {
  const id = `trial-plan-test-${crypto.randomUUID()}`;
  USER_IDS.push(id);
  return id;
}

describe("create_clinic_for_user with required p_trial_plan", () => {
  beforeAll(() => {
    // Clean any leftovers from a previous failed run
    execSql(`DELETE FROM users WHERE auth_user_id LIKE 'trial-plan-test-%'`);
    execSql(`DELETE FROM clinics WHERE name LIKE 'TrialPlanTest%'`);
  });

  afterAll(() => {
    if (soloTrialClinicId) execSql(`DELETE FROM clinics WHERE id = '${soloTrialClinicId}'`);
    if (practiceTrialClinicId) execSql(`DELETE FROM clinics WHERE id = '${practiceTrialClinicId}'`);
  });

  it("creates a trial clinic with the selected plan stored", () => {
    const userId = createUser();
    soloTrialClinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'owner@trialplan.test', 'TrialPlanTestSolo', NULL, NULL, 'solo')`,
    );
    expect(soloTrialClinicId).toMatch(/^[0-9a-f-]{36}$/);

    const row = execSql(
      `SELECT plan || '|' || trial_plan || '|' || (trial_end_date IS NOT NULL) FROM clinics WHERE id = '${soloTrialClinicId}'`,
    );
    expect(row).toBe("trial|solo|true");
  });

  it("creates a practice-trial clinic the same way", () => {
    const userId = createUser();
    practiceTrialClinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'owner2@trialplan.test', 'TrialPlanTestPractice', NULL, NULL, 'practice')`,
    );
    const row = execSql(
      `SELECT plan || '|' || trial_plan FROM clinics WHERE id = '${practiceTrialClinicId}'`,
    );
    expect(row).toBe("trial|practice");
  });

  it("rejects an invalid trial_plan", () => {
    const userId = createUser();
    expect(() =>
      execSql(
        `SELECT create_clinic_for_user('${userId}', 'bad@trialplan.test', 'TrialPlanTestBad', NULL, NULL, 'enterprise')`,
      ),
    ).toThrow();
  });

  it("rejects a missing trial_plan (NULL)", () => {
    const userId = createUser();
    expect(() =>
      execSql(
        `SELECT create_clinic_for_user('${userId}', 'null@trialplan.test', 'TrialPlanTestNull', NULL, NULL, NULL)`,
      ),
    ).toThrow();
  });

  it("re-entry is idempotent: returns the same clinic id", () => {
    const userId = USER_IDS[0];
    const again = execSql(
      `SELECT create_clinic_for_user('${userId}', 'owner@trialplan.test', 'TrialPlanTestSolo', NULL, NULL, 'practice')`,
    );
    expect(again).toBe(soloTrialClinicId);
    const row = execSql(
      `SELECT trial_plan FROM clinics WHERE id = '${soloTrialClinicId}'`,
    );
    // Re-entry never mutates the existing clinic's stored plan
    expect(row).toBe("solo");
  });
});

describe("DB-layer plan limits resolve trial via trial_plan (050 parity)", () => {
  beforeAll(() => {
    const userId = createUser();
    soloTrialClinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'limits@trialplan.test', 'TrialPlanTestLimits', NULL, NULL, 'solo')`,
    );
  });

  afterAll(() => {
    if (soloTrialClinicId) execSql(`DELETE FROM clinics WHERE id = '${soloTrialClinicId}'`);
  });

  it("a solo trial allows 5 staff but blocks the 6th (enforce_plan_limits)", () => {
    for (let i = 1; i <= 5; i++) {
      const inserted = execSql(
        `INSERT INTO staff_members (clinic_id, name, role) VALUES ('${soloTrialClinicId}', 'Staff ${i}', 'RN') RETURNING id`,
      );
      expect(inserted).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(() =>
      execSql(
        `INSERT INTO staff_members (clinic_id, name, role) VALUES ('${soloTrialClinicId}', 'Staff 6', 'RN')`,
      ),
    ).toThrow(/ND0MV|Plan limit/);
  });

  it("a solo trial blocks the 2nd user (users branch resolves trial via trial_plan)", () => {
    // create_clinic_for_user already inserted the owner (count = 1); the solo
    // user limit is 1, so the next insert must hit the trigger.
    expect(() =>
      execSql(
        `INSERT INTO users (clinic_id, email, role, auth_user_id) VALUES ('${soloTrialClinicId}', 'extra@trialplan.test', 'viewer', 'trial-plan-extra-user')`,
      ),
    ).toThrow(/ND0MV|Plan limit/);
  });
});

describe("Practice-trial DB limits (050 parity)", () => {
  let practiceTrialClinicId = "";

  beforeAll(() => {
    const userId = `trial-plan-practice-${crypto.randomUUID()}`;
    practiceTrialClinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'practice-limits@trialplan.test', 'TrialPlanTestPracticeLimits', NULL, NULL, 'practice')`,
    );
  });

  afterAll(() => {
    if (practiceTrialClinicId) execSql(`DELETE FROM clinics WHERE id = '${practiceTrialClinicId}'`);
  });

  it("a practice trial allows 15 staff but blocks the 16th", () => {
    for (let i = 1; i <= 15; i++) {
      const inserted = execSql(
        `INSERT INTO staff_members (clinic_id, name, role) VALUES ('${practiceTrialClinicId}', 'PStaff ${i}', 'RN') RETURNING id`,
      );
      expect(inserted).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(() =>
      execSql(
        `INSERT INTO staff_members (clinic_id, name, role) VALUES ('${practiceTrialClinicId}', 'PStaff 16', 'RN')`,
      ),
    ).toThrow(/ND0MV|Plan limit/);
  });

  it("a practice trial allows 3 users but blocks the 4th", () => {
    for (let i = 2; i <= 3; i++) {
      const inserted = execSql(
        `INSERT INTO users (clinic_id, email, role, auth_user_id) VALUES ('${practiceTrialClinicId}', 'puser${i}@trialplan.test', 'viewer', 'trial-plan-puser-${i}') RETURNING id`,
      );
      expect(inserted).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(() =>
      execSql(
        `INSERT INTO users (clinic_id, email, role, auth_user_id) VALUES ('${practiceTrialClinicId}', 'puser4@trialplan.test', 'viewer', 'trial-plan-puser-4')`,
      ),
    ).toThrow(/ND0MV|Plan limit/);
  });
});

describe("reconcile_clinic_plan resolves trial via trial_plan with the 033 cascade (050 parity)", () => {
  let reconcileClinicId = "";

  beforeAll(() => {
    const userId = `trial-plan-reconcile-${crypto.randomUUID()}`;
    reconcileClinicId = execSql(
      `SELECT create_clinic_for_user('${userId}', 'reconcile@trialplan.test', 'TrialPlanTestReconcile', NULL, NULL, 'practice')`,
    );
    // 6 staff under the practice trial (limit 15 — all allowed), then the
    // clinic switches to evaluating Solo and reconcile('trial') must suspend
    // the excess staff (oldest first per 033 FIFO) with the credential cascade.
    for (let i = 1; i <= 6; i++) {
      execSql(
        `INSERT INTO staff_members (clinic_id, name, role) VALUES ('${reconcileClinicId}', 'RStaff ${i}', 'RN') RETURNING id`,
      );
    }
    // The credential rides on the OLDEST staff (RStaff 1) — FIFO suspension
    // takes the oldest first, so this is the one the cascade must hit.
    execSql(
      `INSERT INTO credentials (clinic_id, staff_member_id, credential_type_id, license_number, status) VALUES ('${reconcileClinicId}', (SELECT id FROM staff_members WHERE clinic_id = '${reconcileClinicId}' AND name = 'RStaff 1'), (SELECT id FROM credential_types WHERE name = 'Registered Nurse License' LIMIT 1), 'RLS-RECON-1', 'valid')`,
    );
    execSql(`UPDATE clinics SET trial_plan = 'solo' WHERE id = '${reconcileClinicId}'`);
  });

  afterAll(() => {
    if (reconcileClinicId) execSql(`DELETE FROM clinics WHERE id = '${reconcileClinicId}'`);
  });

  it("reconcile('trial') suspends the excess 6th staff and cascades to its credential", () => {
    execSql(`SELECT reconcile_clinic_plan('${reconcileClinicId}', 'trial')`);

    const active = execSql(
      `SELECT count(*) FROM staff_members WHERE clinic_id = '${reconcileClinicId}' AND deleted_at IS NULL AND suspended_at IS NULL`,
    );
    expect(active).toBe("5");

    const suspended = execSql(
      `SELECT count(*) FROM staff_members WHERE clinic_id = '${reconcileClinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspended).toBe("1");

    // 033 cascade: the suspended staff's credential is suspended too, and the
    // suspended_plan records the effective plan (solo, resolved from trial).
    const suspendedCred = execSql(
      `SELECT count(*) FROM credentials WHERE clinic_id = '${reconcileClinicId}' AND deleted_at IS NULL AND suspended_at IS NOT NULL`,
    );
    expect(suspendedCred).toBe("1");
    const suspendedPlan = execSql(
      `SELECT suspended_plan FROM staff_members WHERE clinic_id = '${reconcileClinicId}' AND suspended_at IS NOT NULL LIMIT 1`,
    );
    expect(suspendedPlan).toBe("solo");
  });
});
