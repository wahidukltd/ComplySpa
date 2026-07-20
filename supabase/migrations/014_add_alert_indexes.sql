-- Migration 014: Add missing indexes for alert engine performance
-- Phase 4 review found two missing indexes:
--   M1: Composite index on alert_logs for escalation subquery
--   M2: Index on staff_members for clinic+email lookup (dropped in migration 016)

CREATE INDEX IF NOT EXISTS idx_alert_logs_cred_type_sent
  ON alert_logs(credential_id, alert_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_members_clinic_email
  ON staff_members(clinic_id, email) WHERE deleted_at IS NULL;
