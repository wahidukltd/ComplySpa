-- Migration 012: Escalation alerts for credentials expired 7+ days
-- Adds a new pg_cron job that scans for expired, un-alerted credentials
-- and triggers the send-credential-alert Edge Function with days_before = -7

CREATE OR REPLACE FUNCTION scan_escalation_alerts()
RETURNS void AS $$
DECLARE
  record RECORD;
  edge_function_url TEXT;
  anon_key TEXT;
BEGIN
  edge_function_url := COALESCE(
    NULLIF(current_setting('app.edge_function_url', true), ''),
    'http://host.docker.internal:54321/functions/v1'
  );
  anon_key := COALESCE(
    NULLIF(current_setting('app.supabase_anon_key', true), ''),
    'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  );

  edge_function_url := edge_function_url || '/send-credential-alert';

  FOR record IN
    SELECT c.id AS credential_id, c.clinic_id
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    WHERE c.status = 'expired'
      AND c.expiration_date < NOW() - INTERVAL '7 days'
      AND sm.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM alert_logs al
        WHERE al.credential_id = c.id
          AND al.alert_type = 'email'
          AND al.sent_at > NOW() - INTERVAL '8 days'
      )
  LOOP
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key,
        'x-cron-secret', current_setting('app.cron_secret', true)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-escalation-scan') THEN
    PERFORM cron.schedule('daily-escalation-scan', '0 9 * * *', 'SELECT scan_escalation_alerts()');
  END IF;
END $$;
