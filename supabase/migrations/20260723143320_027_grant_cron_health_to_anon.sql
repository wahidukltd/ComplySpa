-- Migration 027: Grant check_cron_health to anon + fix cron job name vs ID mismatch

GRANT EXECUTE ON FUNCTION check_cron_health(TEXT, INTEGER) TO anon;

-- Fix: cron.job_run_details has jobid, not jobname. The original function queried
-- by jobname which doesn't exist in that table, causing all cron checks to fail.
CREATE OR REPLACE FUNCTION check_cron_health(p_jobname TEXT, p_max_stale_hours INTEGER DEFAULT 26)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id BIGINT;
  v_last_run TIMESTAMPTZ;
  v_job_exists BOOLEAN;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = p_jobname;
  v_job_exists := FOUND;

  IF NOT v_job_exists THEN RETURN FALSE; END IF;

  SELECT MAX(COALESCE(end_time, start_time)) INTO v_last_run
  FROM cron.job_run_details
  WHERE jobid = v_job_id;

  IF v_last_run IS NULL THEN RETURN FALSE; END IF;

  RETURN v_last_run > NOW() - (p_max_stale_hours * INTERVAL '1 hour');
END;
$$;
