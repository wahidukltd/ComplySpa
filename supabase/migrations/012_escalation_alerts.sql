-- Migration 012: Escalation alerts for credentials expired 7+ days
-- Adds a new pg_cron job that scans for expired, un-alerted credentials
-- and triggers the send-credential-alert Edge Function with days_before = -7
--
-- PRODUCTION SETUP (Supabase Dashboard → Database → Configuration → Custom GUCs):
--   app.edge_function_url = https://<project-ref>.supabase.co/functions/v1
--   app.cron_secret = <generate-a-strong-random-secret>

CREATE OR REPLACE FUNCTION scan_escalation_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  record RECORD;
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
  -- ponytail: hardcoded anon key fallback for local dev; prod sets app.supabase_anon_key via supabase vault
  cron_secret := current_setting('app.cron_secret', true);

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping escalation scan — set it before enabling alerts';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id AS credential_id, c.clinic_id
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.status = 'expired'
      AND (c.expiration_date AT TIME ZONE 'UTC')::DATE < (CURRENT_DATE - 7)
      AND sm.deleted_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice', 'multi_location')
      AND NOT EXISTS (
        SELECT 1 FROM alert_logs al
        WHERE al.credential_id = c.id
          AND al.alert_type = 'email'
          AND al.days_before_expiration < 0
          AND (al.sent_at AT TIME ZONE 'UTC')::DATE > CURRENT_DATE - 8
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
        'credential_id', record.credential_id,
        'clinic_id', record.clinic_id,
        'days_before', -7
      ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION scan_escalation_alerts() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-escalation-scan') THEN
    PERFORM cron.schedule('daily-escalation-scan', '0 9 * * *', 'SELECT scan_escalation_alerts()');
  END IF;
END $$;
