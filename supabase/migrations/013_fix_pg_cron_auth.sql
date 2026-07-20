-- Migration 013: Add apikey header + timeout to scan_expiring_credentials()
-- Fixes pre-existing bug: original migration 003 omitted the apikey header
-- required by the API gateway for Edge Function calls.
-- Preserves all guards from migration 007 (plan filter, idempotency,
-- fail-closed cron_secret, timezone-safe dates).
-- Uses COALESCE fallbacks so local dev works without superuser GUC config.
--
-- PRODUCTION SETUP (Supabase Dashboard → Database → Configuration → Custom GUCs):
--   app.edge_function_url = https://<project-ref>.supabase.co/functions/v1
--   app.cron_secret = <generate-a-strong-random-secret>

CREATE OR REPLACE FUNCTION scan_expiring_credentials()
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

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'app.edge_function_url not set, skipping credential scan';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping credential scan — set it before enabling alerts';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id, c.clinic_id,
           ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) AS days_before
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.expiration_date IS NOT NULL
      AND ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) IN (90, 60, 30, 7)
      AND sm.deleted_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice', 'multi_location')
      AND NOT EXISTS (
        SELECT 1 FROM alert_logs al
        WHERE al.credential_id = c.id
          AND al.days_before_expiration = ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE)
          AND (al.sent_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE
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
        'credential_id', record.id,
        'clinic_id', record.clinic_id,
        'days_before', record.days_before
      ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;
