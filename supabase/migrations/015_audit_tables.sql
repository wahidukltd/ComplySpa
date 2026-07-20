-- Migration 015: Audit engine tables
-- Creates audit_runs and audit_findings for the inspection-readiness engine

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('quarterly', 'on_demand')) DEFAULT 'on_demand',
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')) DEFAULT 'in_progress',
  readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  checklist_item TEXT NOT NULL CHECK (checklist_item IN (
    'medical_director_agreement',
    'facility_license',
    'staff_license_verifications',
    'signed_treatment_protocols',
    'patient_chart_sample',
    'advertising_file',
    'dea_registration'
  )),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'stale', 'manual_attest')),
  auto_filled BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  remediation_due_date TIMESTAMPTZ,
  remediation_status TEXT CHECK (remediation_status IN ('open', 'in_progress', 'closed')),
  remediation_closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_runs_clinic_id ON audit_runs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_runs_status ON audit_runs(status);
CREATE INDEX IF NOT EXISTS idx_audit_runs_completed_at ON audit_runs(completed_at);
CREATE INDEX IF NOT EXISTS idx_audit_runs_created_by ON audit_runs(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_run_id ON audit_findings(audit_run_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_audit_findings_updated_at ON audit_findings;
CREATE TRIGGER trigger_audit_findings_updated_at BEFORE UPDATE ON audit_findings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;

-- Grants: owner/manager can INSERT, all authenticated can SELECT
GRANT SELECT, INSERT, UPDATE ON audit_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON audit_findings TO authenticated;

-- audit_runs: SELECT own clinic
DROP POLICY IF EXISTS "audit_runs_select_own" ON audit_runs;
CREATE POLICY "audit_runs_select_own" ON audit_runs
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

-- audit_runs: INSERT owner/manager only
DROP POLICY IF EXISTS "audit_runs_insert_owner_manager" ON audit_runs;
CREATE POLICY "audit_runs_insert_owner_manager" ON audit_runs
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- audit_runs: UPDATE owner/manager only (to complete audits)
DROP POLICY IF EXISTS "audit_runs_update_owner_manager" ON audit_runs;
CREATE POLICY "audit_runs_update_owner_manager" ON audit_runs
  FOR UPDATE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  )
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- audit_findings: SELECT own clinic (via audit_run)
DROP POLICY IF EXISTS "audit_findings_select_own" ON audit_findings;
CREATE POLICY "audit_findings_select_own" ON audit_findings
  FOR SELECT USING (
    audit_run_id IN (
      SELECT id FROM audit_runs WHERE clinic_id = (SELECT auth_clinic_id())
    )
  );

-- audit_findings: INSERT owner/manager only
DROP POLICY IF EXISTS "audit_findings_insert_owner_manager" ON audit_findings;
CREATE POLICY "audit_findings_insert_owner_manager" ON audit_findings
  FOR INSERT WITH CHECK (
    audit_run_id IN (
      SELECT id FROM audit_runs WHERE clinic_id = (SELECT auth_clinic_id())
    )
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- audit_findings: UPDATE owner/manager only
DROP POLICY IF EXISTS "audit_findings_update_owner_manager" ON audit_findings;
CREATE POLICY "audit_findings_update_owner_manager" ON audit_findings
  FOR UPDATE USING (
    audit_run_id IN (
      SELECT id FROM audit_runs WHERE clinic_id = (SELECT auth_clinic_id())
    )
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  )
  WITH CHECK (
    audit_run_id IN (
      SELECT id FROM audit_runs WHERE clinic_id = (SELECT auth_clinic_id())
    )
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ============================================================================
-- PG_CRON: Daily audit overdue check
-- ============================================================================

CREATE OR REPLACE FUNCTION scan_audit_overdue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
  edge_function_url TEXT;
  anon_key TEXT;
  cron_secret TEXT;
BEGIN
  edge_function_url := COALESCE(
    NULLIF(current_setting('app.edge_function_url', true), ''),
    'http://host.docker.internal:54321/functions/v1'
  );
  anon_key := COALESCE(
    NULLIF(current_setting('app.supabase_anon_key', true), ''),
    'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  );
  cron_secret := current_setting('app.cron_secret', true);

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping audit overdue scan';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-audit-reminder';

  FOR rec IN
    SELECT cl.id AS clinic_id, cl.name AS clinic_name
    FROM clinics cl
    WHERE cl.plan IN ('practice', 'multi_location')
      AND NOT EXISTS (
        SELECT 1 FROM audit_runs ar
        WHERE ar.clinic_id = cl.id
          AND ar.status = 'completed'
          AND ar.completed_at > NOW() - INTERVAL '90 days'
      )
  LOOP
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key,
        'x-cron-secret', cron_secret
      ),
      body := jsonb_build_object(
        'clinic_id', rec.clinic_id,
        'clinic_name', rec.clinic_name
      ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION scan_audit_overdue() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-audit-overdue-check') THEN
    PERFORM cron.schedule('daily-audit-overdue-check', '0 9 * * *', 'SELECT scan_audit_overdue()');
  END IF;
END;
$$;
