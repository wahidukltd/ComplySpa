-- Migration 003: pg_cron scheduled jobs
-- 4 daily jobs: credential status update, alert scan, trial expiry, inactive cleanup

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- FUNCTION 1: update_credential_statuses
-- Recalculates credential.status based on expiration_date.
-- Runs daily at 05:00 UTC (before the alert scan at 06:00).
-- ============================================================================
CREATE OR REPLACE FUNCTION update_credential_statuses()
RETURNS void AS $$
BEGIN
  UPDATE credentials
  SET status = 'expired'
  WHERE expiration_date IS NOT NULL
    AND expiration_date::DATE < CURRENT_DATE
    AND status != 'expired';

  UPDATE credentials
  SET status = 'expiring'
  WHERE expiration_date IS NOT NULL
    AND expiration_date::DATE >= CURRENT_DATE
    AND expiration_date::DATE <= CURRENT_DATE + 90
    AND status != 'expiring';

  UPDATE credentials
  SET status = 'valid'
  WHERE expiration_date IS NOT NULL
    AND expiration_date::DATE > CURRENT_DATE + 90
    AND status != 'valid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION 2: scan_expiring_credentials
-- Finds credentials expiring in exactly 90, 60, 30, or 7 days and calls the
-- send-credential-alert Edge Function for each via pg_net.
-- Runs daily at 06:00 UTC (after status update at 05:00).
-- Skips credentials belonging to soft-deleted staff members.
-- ============================================================================
CREATE OR REPLACE FUNCTION scan_expiring_credentials()
RETURNS void AS $$
DECLARE
  record RECORD;
  edge_function_url TEXT;
BEGIN
  edge_function_url := current_setting('app.edge_function_url', true);

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'app.edge_function_url not set, skipping credential scan';
    RETURN;
  END IF;

  edge_function_url := edge_function_url || '/send-credential-alert';

  FOR record IN
    SELECT c.id, c.clinic_id, c.expiration_date,
           (c.expiration_date::DATE - CURRENT_DATE) AS days_before
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    WHERE c.expiration_date IS NOT NULL
      AND (c.expiration_date::DATE - CURRENT_DATE) IN (90, 60, 30, 7)
      AND sm.deleted_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'credential_id', record.id,
        'clinic_id', record.clinic_id,
        'days_before', record.days_before
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION 3: check_trial_expiry
-- Moves clinics from 'trial' to 'expired_trial' when trial_end_date has passed.
-- Runs daily at 07:00 UTC.
-- ============================================================================
CREATE OR REPLACE FUNCTION check_trial_expiry()
RETURNS void AS $$
BEGIN
  UPDATE clinics
  SET plan = 'expired_trial'
  WHERE plan = 'trial' AND trial_end_date < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION 4: cleanup_inactive_clinics
-- Moves clinics from 'expired_trial' to 'inactive' 30 days after trial expiry.
-- Runs daily at 08:00 UTC.
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_inactive_clinics()
RETURNS void AS $$
BEGIN
  UPDATE clinics
  SET plan = 'inactive'
  WHERE plan = 'expired_trial' AND trial_end_date < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SCHEDULE JOBS (idempotent — only schedules if not already scheduled)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-credential-status-update') THEN
    PERFORM cron.schedule('daily-credential-status-update', '0 5 * * *', 'SELECT update_credential_statuses()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-credential-scan') THEN
    PERFORM cron.schedule('daily-credential-scan', '0 6 * * *', 'SELECT scan_expiring_credentials()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-trial-expiry-check') THEN
    PERFORM cron.schedule('daily-trial-expiry-check', '0 7 * * *', 'SELECT check_trial_expiry()');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-inactive-cleanup') THEN
    PERFORM cron.schedule('daily-inactive-cleanup', '0 8 * * *', 'SELECT cleanup_inactive_clinics()');
  END IF;
END $$;
