-- 046: Notification & Alert System hardening (plan 2026-08-02-notification-hardening.md).
-- 1) notification_settings table: the scan functions' config source. Supabase
--    hosted does NOT support custom app.* GUCs (ALTER DATABASE SET is
--    superuser-gated; the dashboard/API/CLI allowlists only cover ~20 built-in
--    parameters) — migration 006's "set manually in production" instruction is
--    unworkable on hosted. A deny-all table is the supported equivalent.
--    DELIBERATE GRANT EXCEPTION: this table is intentionally NOT granted to
--    anon/authenticated/service_role — RLS enabled with zero policies = deny
--    all. The SECURITY DEFINER scan functions run as the postgres owner
--    (superuser) and bypass RLS, so they read it without grants. The cron
--    secret is replaced post-deploy via the Management API query endpoint
--    (which has DML rights).
CREATE TABLE IF NOT EXISTS public.notification_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Seed: local-dev defaults (matching migration 006's dev values). The
-- production deploy step replaces all three via the Management API query
-- endpoint (which has DML rights) — edge URL + anon key are public by design,
-- the cron secret must equal the edge function's CRON_SECRET env.
INSERT INTO public.notification_settings (key, value, description) VALUES
  ('edge_function_url', 'http://127.0.0.1:54321/functions/v1', 'send-credential-alert edge function base URL'),
  ('supabase_anon_key', 'sb_publishable_jZH7y3QnI-DzYM9jj_Fhkw_UnNQqX6j', 'apikey header value sent to the edge function'),
  ('cron_secret', 'dev-cron-secret-change-in-production', 'x-cron-secret shared with the edge function env CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON public.notification_settings FROM anon, authenticated, service_role;

-- 2) Audit columns: delivery-confirmation timestamp + failure reason.
--    delivered_at is set by the Resend webhook on email.delivered;
--    failure_reason by the webhook (bounced/complained/rejected/suppressed),
--    the edge function (send_failed), and the stale-pending reconciliation.
ALTER TABLE public.alert_logs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.alert_logs ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 3) Stale-pending reconciliation: rows left pending after webhook downtime
--    or unhandled terminal events resolve deterministically after 48h.
CREATE OR REPLACE FUNCTION reconcile_stale_pending_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.alert_logs
  SET delivery_status = 'failed',
      failure_reason = 'no_delivery_confirmation'
  WHERE delivery_status = 'pending'
    AND sent_at < NOW() - INTERVAL '48 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_stale_pending_alerts() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-stale-pending-check') THEN
    PERFORM cron.schedule('daily-stale-pending-check', '0 10 * * *', 'SELECT reconcile_stale_pending_alerts()');
  END IF;
END;
$$;

-- 4) scan_expiring_credentials() — 045 body with the config source switched
--    from current_setting('app.*') to the notification_settings table
--    (same warn-and-skip semantics, supported on hosted Supabase).
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
  SELECT value INTO edge_function_url FROM public.notification_settings WHERE key = 'edge_function_url';
  SELECT value INTO anon_key FROM public.notification_settings WHERE key = 'supabase_anon_key';
  SELECT value INTO cron_secret FROM public.notification_settings WHERE key = 'cron_secret';

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'notification_settings.edge_function_url not set, skipping credential scan';
    RETURN;
  END IF;

  IF anon_key IS NULL OR anon_key = '' THEN
    RAISE WARNING 'notification_settings.supabase_anon_key not set, skipping credential scan';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'notification_settings.cron_secret not set, skipping credential scan';
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
      AND c.deleted_at IS NULL
      AND c.suspended_at IS NULL
      AND ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) IN (90, 60, 30, 7)
      AND sm.deleted_at IS NULL
      AND sm.suspended_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice')
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

-- 5) scan_escalation_alerts() — same config-source switch.
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
  SELECT value INTO edge_function_url FROM public.notification_settings WHERE key = 'edge_function_url';
  SELECT value INTO anon_key FROM public.notification_settings WHERE key = 'supabase_anon_key';
  SELECT value INTO cron_secret FROM public.notification_settings WHERE key = 'cron_secret';

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'notification_settings.cron_secret not set, skipping escalation scan';
    RETURN;
  END IF;

  IF anon_key IS NULL OR anon_key = '' THEN
    RAISE WARNING 'notification_settings.supabase_anon_key not set, skipping escalation scan';
    RETURN;
  END IF;

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'notification_settings.edge_function_url not set, skipping escalation scan';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id AS credential_id, c.clinic_id
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.status = 'expired'
      AND c.deleted_at IS NULL
      AND c.suspended_at IS NULL
      AND (c.expiration_date AT TIME ZONE 'UTC')::DATE < (CURRENT_DATE - 7)
      AND sm.deleted_at IS NULL
      AND sm.suspended_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice')
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
