import { describe, it, expect } from "vitest";
import { execSql } from "./helpers";

const EXPECTED_TABLES = [
  "alert_logs",
  "audit_reports",
  "clinics",
  "credential_audit",
  "credential_types",
  "credentials",
  "staff_members",
  "users",
];

const EXPECTED_FUNCTIONS = [
  "update_credential_statuses",
  "scan_expiring_credentials",
  "check_trial_expiry",
  "cleanup_inactive_clinics",
  "auth_clinic_id",
  "auth_user_role",
];

const EXPECTED_CRON_JOBS = [
  "daily-credential-status-update",
  "daily-credential-scan",
  "daily-trial-expiry-check",
  "daily-inactive-cleanup",
];

describe("Migration integrity", () => {
  it("all 8 tables exist in public schema", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('" +
        EXPECTED_TABLES.join("','") +
        "')",
    );
    expect(parseInt(result, 10)).toBe(8);
  });

  it("all tables have RLS enabled", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true AND c.relname IN ('" +
        EXPECTED_TABLES.join("','") +
        "')",
    );
    expect(parseInt(result, 10)).toBe(8);
  });

  it("12 seed credential types are present", () => {
    const result = execSql(
      "SELECT count(*) FROM credential_types WHERE is_custom = false",
    );
    expect(parseInt(result, 10)).toBe(12);
  });

  it("auth_clinic_id() function exists and returns NULL without JWT", () => {
    const exists = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'auth_clinic_id'",
    );
    expect(parseInt(exists, 10)).toBe(1);

    const result = execSql("SELECT auth_clinic_id()");
    expect(result).toBe("");
  });

  it("auth_user_role() function exists and returns NULL without JWT", () => {
    const exists = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'auth_user_role'",
    );
    expect(parseInt(exists, 10)).toBe(1);

    const result = execSql("SELECT auth_user_role()");
    expect(result).toBe("");
  });

  for (const fn of EXPECTED_FUNCTIONS) {
    it(`function ${fn}() exists`, () => {
      const result = execSql(
        `SELECT count(*) FROM pg_proc WHERE proname = '${fn}'`,
      );
      expect(parseInt(result, 10)).toBeGreaterThanOrEqual(1);
    });
  }

  it("4 cron jobs are scheduled", () => {
    const result = execSql(
      "SELECT count(*) FROM cron.job WHERE jobname IN ('" +
        EXPECTED_CRON_JOBS.join("','") +
        "')",
    );
    expect(parseInt(result, 10)).toBe(4);
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

  it("clinics UPDATE is revoked from anon and authenticated (C2 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'clinics' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'UPDATE'",
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("cron functions are not callable by anon (C4 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_name IN ('update_credential_statuses', 'scan_expiring_credentials', 'check_trial_expiry', 'cleanup_inactive_clinics') AND grantee = 'anon'",
    );
    expect(parseInt(result, 10)).toBe(0);
  });

  it("clerk_user_id immutability trigger exists (L4 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname = 'trigger_users_clerk_user_id_immutable'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("clinic_id immutability triggers exist on all multi-tenant tables", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trigger_users_clinic_id_immutable', 'trigger_staff_members_clinic_id_immutable', 'trigger_credentials_clinic_id_immutable')",
    );
    expect(parseInt(result, 10)).toBe(3);
  });

  it("users.email has a UNIQUE constraint (008 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'users' AND c.contype = 'u' AND c.conname = 'users_email_unique'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("set_audit_report_author trigger exists (008 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_trigger WHERE tgname = 'trigger_set_audit_report_author'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });

  it("create_clinic_for_user RPC function exists (009 regression guard)", () => {
    const result = execSql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'create_clinic_for_user'",
    );
    expect(parseInt(result, 10)).toBe(1);
  });
});
