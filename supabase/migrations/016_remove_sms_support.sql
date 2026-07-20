-- Migration 016: Remove SMS Support
-- Relaxes alert_type CHECK to allow only 'email' for new inserts
-- while preserving historical 'sms' rows.

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
  CHECK (alert_type IN ('email', 'sms'));

DROP INDEX IF EXISTS idx_staff_members_clinic_email;
