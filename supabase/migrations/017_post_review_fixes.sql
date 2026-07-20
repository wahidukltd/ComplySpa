-- Migration 017: Post-review fixes
-- Composite index, service_role grants, updated_at on audit_runs, 016 CHECK fix

-- ============================================================================
-- 017a: Composite index for scan_audit_overdue() subquery
-- The subquery filters on (clinic_id, status, completed_at) — a single
-- composite index is more efficient than three single-column indexes.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_runs_clinic_status_completed
  ON audit_runs(clinic_id, status, completed_at);

-- ============================================================================
-- 017b: Grant service_role access to audit tables
-- Migration 015 created audit_runs + audit_findings but did not grant
-- privileges to service_role. Migration 002's blanket GRANT only covered
-- tables existing at that time.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_findings TO service_role;

-- ============================================================================
-- 017c: Add updated_at column + trigger to audit_runs
-- AGENTS.md convention requires updated_at on every table. audit_findings
-- already has it; audit_runs was missing it.
-- ============================================================================
ALTER TABLE audit_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_audit_runs_updated_at ON audit_runs;
CREATE TRIGGER trigger_audit_runs_updated_at BEFORE UPDATE ON audit_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 017d: Fix migration 016 CHECK constraint
-- Migration 016 re-created the alert_type CHECK as IN ('email', 'sms')
-- but its intent was to prevent new 'sms' inserts. The correct form uses
-- NOT VALID to skip historical row validation.
-- ============================================================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'alert_logs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%alert_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE alert_logs DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE alert_logs
  ADD CONSTRAINT alert_logs_alert_type_check
  CHECK (alert_type = 'email') NOT VALID;
