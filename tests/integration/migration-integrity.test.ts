import { describe, it, expect } from "vitest";
import { execSql } from "./helpers";

const EXPECTED_TABLES = [
  "alert_logs",
  "alert_recipients",
  "clinics",
  "credential_audit",
  "credential_types",
  "credentials",
  "notification_settings",
  "onboarding_items",
  "processed_webhooks",
  "role_template_items",
  "role_templates",
  "staff_members",
  "users",
] as const;

const SEED_CREDENTIAL_TYPE_COUNT = 24;

const EXPECTED_IMMUTABILITY_TRIGGERS = [
  "trigger_users_clinic_id_immutable",
  "trigger_users_auth_user_id_immutable",
  "trigger_staff_members_clinic_id_immutable",
  "trigger_credentials_clinic_id_immutable",
  "trigger_credential_types_clinic_id_immutable",
] as const;

const EXPECTED_CRON_FUNCTIONS = [
  "update_credential_statuses",
  "scan_expiring_credentials",
  "scan_escalation_alerts",
  "check_trial_expiry",
  "cleanup_inactive_clinics",
  "reconcile_stale_pending_alerts",
] as const;

const EXPECTED_FUNCTIONS = [
  ...EXPECTED_CRON_FUNCTIONS,
  "auth_clinic_id",
  "auth_user_role",
  "create_clinic_for_user",
  "get_alert_windows",
] as const;

const EXPECTED_CRON_JOBS = [
  "daily-credential-status-update",
  "daily-credential-scan",
  "daily-escalation-scan",
  "daily-trial-expiry-check",
  "daily-inactive-cleanup",
  "daily-stale-pending-check",
] as const;

/** Build a SQL IN-list string from constant array values. Never use with user input. */
function inList(values: readonly string[]): string {
  return values.map(v => `'${v.replace(/'/g, "''")}'`).join(",");
}

describe("Migration integrity", () => {
  it("all 13 tables exist in public schema", () => {
    const result = execSql(
      `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN (${inList(EXPECTED_TABLES)})`,
    );
    expect(parseInt(result, 10)).toBe(13);
  });

  it("all tables have RLS enabled", () => {
    const result = execSql(
      `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true AND c.relname IN (${inList(EXPECTED_TABLES)})`,
    );
    expect(parseInt(result, 10)).toBe(13);
  });

  it(`${SEED_CREDENTIAL_TYPE_COUNT} seed credential types are present`, () => {
    const result = execSql(
      "SELECT count(*) FROM credential_types WHERE is_custom = false",
    );
    expect(parseInt(result, 10)).toBe(SEED_CREDENTIAL_TYPE_COUNT);
  });

  it("auth_clinic_id() function exists and returns NULL without JWT", () => {
    const result = execSql("SELECT count(*) FROM pg_proc WHERE proname = 'auth_clinic_id'");
    expect(parseInt(result, 10)).toBe(1);

    const actual = execSql("SELECT auth_clinic_id()");
    expect(actual).toBe("");
  });

  it("notification_settings is deny-all (RLS on, zero policies, zero grants)", () => {
    const policyCount = execSql(
      "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_settings'",
    );
    expect(parseInt(policyCount, 10)).toBe(0);

    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const granted = execSql(
          `SELECT has_table_privilege('${role}', 'notification_settings', '${priv}')`,
        );
        expect(granted).toBe("f");
      }
    }
  });

  it("reconcile_stale_pending_alerts is not executable by Data API roles", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const granted = execSql(
        `SELECT has_function_privilege('${role}', 'reconcile_stale_pending_alerts()', 'EXECUTE')`,
      );
      expect(granted).toBe("f");
    }
  });

  it("auth_user_role() function exists and returns NULL without JWT", () => {
    const result = execSql("SELECT count(*) FROM pg_proc WHERE proname = 'auth_user_role'");
    expect(parseInt(result, 10)).toBe(1);

    const actual = execSql("SELECT auth_user_role()");
    expect(actual).toBe("");
  });

  for (const fn of EXPECTED_FUNCTIONS) {
    it(`function ${fn}() exists`, () => {
      const result = execSql(
        `SELECT count(*) FROM pg_proc WHERE proname = '${fn.replace(/'/g, "''")}'`,
      );
      expect(parseInt(result, 10)).toBeGreaterThanOrEqual(1);
    });
  }

  it("scan functions keep the migration-034 suspended-resource filters", () => {
    // Regression guard: migration 034 added c.suspended_at IS NULL +
    // sm.suspended_at IS NULL to both alert scan functions; 045 must not
    // regress them (a re-created body from the pre-034 source would email
    // alerts for suspended staff/credentials after a downgrade).
    for (const fn of ["scan_expiring_credentials", "scan_escalation_alerts"]) {
      const body = execSql(`SELECT prosrc FROM pg_proc WHERE proname = '${fn}'`);
      expect(body).toContain("c.suspended_at IS NULL");
      expect(body).toContain("sm.suspended_at IS NULL");
      expect(body).not.toContain("'multi_location'");
    }
  });

  it("scan_audit_overdue is not resurrected (feature removed in migration 023)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'scan_audit_overdue'",
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("6 cron jobs are scheduled", () => {
    const result = execSql(
      `SELECT count(*) FROM cron.job WHERE jobname IN (${inList(EXPECTED_CRON_JOBS)})`,
    );
    expect(parseInt(result, 10)).toBe(6);
  });

  it("credential audit trigger exists on credentials table", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname = 'trigger_credential_audit'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("every UPDATE policy has WITH CHECK (C1 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd = 'UPDATE' AND with_check IS NULL",
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("all SECURITY DEFINER functions have search_path set (C5 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prosecdef = true AND p.proconfig IS NULL",
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("clinics UPDATE is granted to authenticated and gated owner-only by policy (055 restores the app profile save)", () => {
    const granted = execSql(
      "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'clinics' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'",
    );
    expect(parseInt(granted, 10)).toBe(1);
    const anonGranted = execSql(
      "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'clinics' AND grantee = 'anon' AND privilege_type = 'UPDATE'",
    );
    expect(parseInt(anonGranted, 10)).toBe(0);
    // The 006-era state revoked the grant entirely, silently breaking
    // updateClinicProfile at the DB layer (plan 2026-08-08 §4.1 finding).
    // 055 restores the grant with an owner-only UPDATE policy as the gate.
    const policy = execSql(
      `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='clinics' AND policyname='clinics_update_owner' AND cmd='UPDATE' AND qual LIKE '%owner%' AND with_check LIKE '%owner%'`,
    );
    expect(parseInt(policy, 10)).toBe(1);
  });

  it("cron functions are not callable by anon (C4 regression guard)", () => {
    const result = execSql(
      `SELECT count(*) FROM information_schema.routine_privileges WHERE routine_name IN (${inList(EXPECTED_CRON_FUNCTIONS)}) AND grantee = 'anon'`,
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("auth_user_id immutability trigger exists (L4 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname = 'trigger_users_auth_user_id_immutable'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("clinic_id immutability triggers exist on all multi-tenant tables", () => {
    const result = execSql(
      `SELECT count(*) FROM pg_trigger WHERE tgname IN (${inList(EXPECTED_IMMUTABILITY_TRIGGERS)})`,
    );
    expect(parseInt(result, 10)).toBe(EXPECTED_IMMUTABILITY_TRIGGERS.length);
  });

  it("users.email has a UNIQUE constraint (008 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'users' AND c.contype = 'u' AND c.conname = 'users_email_unique'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("audit_reports is gone and reports are ephemeral (050 regression guard)", () => {
    const tableCount = execSql(
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_reports'",
    );
    expect(parseInt(tableCount, 10)).toBe(0);
    const triggerCount = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname = 'trigger_set_audit_report_author'",
    );
    expect(parseInt(triggerCount, 10)).toBe(0);
    const fnCount = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'set_audit_report_author'",
    );
    expect(parseInt(fnCount, 10)).toBe(0);
  });

  it("clinics.trial_plan is NOT NULL with a solo|practice CHECK (050)", () => {
    const notNull = execSql(
      "SELECT count(*) FROM information_schema.columns WHERE table_name = 'clinics' AND column_name = 'trial_plan' AND is_nullable = 'NO'",
    );
    expect(parseInt(notNull, 10)).toBe(1);
    const check = execSql(
      "SELECT count(*) FROM pg_constraint WHERE conname = 'clinics_trial_plan_check'",
    );
    expect(parseInt(check, 10)).toBe(1);
  });

  it("enforce_plan_limits resolves trial via trial_plan (050 parity)", () => {
    const body = execSql("SELECT prosrc FROM pg_proc WHERE proname = 'enforce_plan_limits'");
    expect(body).toContain("trial_plan");
    expect(body).not.toContain("'multi_location'");
  });

  it("reconcile_clinic_plan resolves trial via trial_plan and keeps the cascade (050 parity)", () => {
    const body = execSql("SELECT prosrc FROM pg_proc WHERE proname = 'reconcile_clinic_plan'");
    expect(body).toContain("trial_plan");
    expect(body).not.toContain("'multi_location'");
    // 033 cascade behaviors preserved by the 050 re-creation
    expect(body).toContain("Cascade: restore credentials of newly restored staff");
    expect(body).toContain("suspended_at = NULL, suspended_plan = NULL");
  });

  it("create_clinic_for_user RPC takes 6 args incl. p_trial_plan (050)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'create_clinic_for_user'",
    );
    expect(parseInt(result, 10)).toBe(1);
    const args = execSql(
      "SELECT pg_get_function_identity_arguments('create_clinic_for_user(text,text,text,text,text,text)'::regprocedure)",
    );
    expect(args).toContain("p_user_id text");
    expect(args).toContain("p_email text");
    expect(args).toContain("p_name text");
    expect(args).toContain("p_trial_plan text");
  });

  it("create_clinic_for_user is executable by authenticated + service_role only", () => {
    for (const role of ["authenticated", "service_role"]) {
      const granted = execSql(
        `SELECT has_function_privilege('${role}', 'create_clinic_for_user(text,text,text,text,text,text)', 'EXECUTE')`,
      );
      expect(granted).toBe("t");
    }
    const anon = execSql(
      "SELECT has_function_privilege('anon', 'create_clinic_for_user(text,text,text,text,text,text)', 'EXECUTE')",
    );
    expect(anon).toBe("f");
  });
});

