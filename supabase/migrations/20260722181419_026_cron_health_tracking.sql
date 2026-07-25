-- Migration 026: Sentry cron health tracking
-- Adds a function that health endpoint uses to verify pg_cron jobs ran on
-- schedule. If a cron job misses its window, Sentry alerts via the health
-- check.

-- ============================================================================
-- FUNCTION: check_cron_health
-- Returns TRUE if the named cron job ran within the stale window.
-- Falls back to checking if the job is still scheduled (scheduled but we
-- can't verify last run) rather than false-positive "missed".
-- ============================================================================
CREATE OR REPLACE FUNCTION check_cron_health(p_jobname TEXT, p_max_stale_hours INTEGER DEFAULT 26)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_run TIMESTAMPTZ;
  v_job_exists BOOLEAN;
BEGIN
  -- Check if the cron job is scheduled
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_jobname) INTO v_job_exists;
  IF NOT v_job_exists THEN
    RETURN FALSE;
  END IF;

  -- Check last run time from cron.job_run_details
  SELECT MAX(COALESCE(end_time, start_time)) INTO v_last_run
  FROM cron.job_run_details
  WHERE jobname = p_jobname;

  -- If never run, it's not healthy (but we can't distinguish "just deployed"
  -- from "broken"). Return FALSE so Sentry captures it.
  IF v_last_run IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Healthy if last run was within the stale window
  RETURN v_last_run > NOW() - (p_max_stale_hours * INTERVAL '1 hour');
END;
$$;

GRANT EXECUTE ON FUNCTION check_cron_health(TEXT, INTEGER) TO authenticated;
